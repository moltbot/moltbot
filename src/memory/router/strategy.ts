import type { DatabaseSync } from "node:sqlite";
import type { RetrievalStrategy, ClassificationResult } from "./classifier.js";
import { findEntity, findNeighbors, getEntityChunks, searchEntities } from "../kg/index.js";

/**
 * Retrieval strategy selection and execution.
 * Routes queries to the appropriate search path based on intent.
 *
 * Implements:
 * - KG-first retrieval for factual/relational queries
 * - Query expansion with entity aliases
 * - KG context building for enhanced results
 */

export interface StrategyOptions {
  db: DatabaseSync;
  maxResults?: number;
  minScore?: number;
  minTrustScore?: number;
}

export interface SearchResult {
  chunkId: string;
  text: string;
  score: number;
  path: string;
  source: string;
  trustScore?: number;
  entities?: string[];
}

export interface StrategyResult {
  results: SearchResult[];
  strategy: RetrievalStrategy;
  expandedQueries?: string[];
  kgContext?: KGContext;
}

export interface KGContext {
  relevantEntities: Array<{ id: string; name: string; type: string }>;
  relations: Array<{ source: string; relation: string; target: string }>;
}

/**
 * Selects the optimal retrieval strategy based on classification.
 */
export function selectStrategy(classification: ClassificationResult): RetrievalStrategy {
  // Use suggested strategy from classification by default
  let strategy = classification.suggestedStrategy;

  // Override for low-confidence classifications
  if (classification.confidence < 0.5 && classification.intent !== "unknown") {
    // Fall back to hybrid for uncertain classifications
    strategy = "hybrid";
  }

  // If entities were detected, prefer strategies that use KG
  if (classification.extractedEntities.length > 0 && strategy === "vector_first") {
    strategy = "hybrid";
  }

  return strategy;
}

/**
 * Executes the retrieval strategy and returns results.
 * Routes to appropriate retrieval path based on strategy.
 */
export async function executeStrategy(
  query: string,
  classification: ClassificationResult,
  options: StrategyOptions,
): Promise<StrategyResult> {
  const { db, maxResults = 10, minTrustScore = 0 } = options;
  const strategy = selectStrategy(classification);
  const expandedQueries = expandQueryWithAliases(query, classification.extractedEntities, { db });

  let kgResults: SearchResult[] = [];
  let kgContext: KGContext | undefined;

  // For KG-involving strategies, query the knowledge graph
  if (strategy === "kg_first" || strategy === "kg_only" || strategy === "hybrid") {
    kgContext = buildKGContext(classification.extractedEntities, { db, maxHops: 2 });

    // Get chunks associated with relevant entities
    for (const entityName of classification.extractedEntities) {
      const chunkIds = getEntityChunks(entityName, { db });

      for (const chunkId of chunkIds) {
        // Fetch chunk details
        const chunk = db
          .prepare(`SELECT id, path, source, text FROM chunks WHERE id = ?`)
          .get(chunkId) as { id: string; path: string; source: string; text: string } | undefined;

        if (chunk) {
          // Get trust score from provenance
          const provenance = db
            .prepare(`SELECT trust_score FROM chunk_provenance WHERE chunk_id = ?`)
            .get(chunkId) as { trust_score: number } | undefined;

          const trustScore = provenance?.trust_score ?? 0.5;

          // Filter by minimum trust score
          if (trustScore >= minTrustScore) {
            kgResults.push({
              chunkId: chunk.id,
              text: chunk.text,
              score: 0.8, // Base KG score - entity match is high signal
              path: chunk.path,
              source: chunk.source,
              trustScore,
              entities: [entityName],
            });
          }
        }
      }
    }

    // Also search by entity name patterns
    for (const entityName of classification.extractedEntities) {
      const matchingEntities = searchEntities(entityName, { db, limit: 5 });
      for (const entity of matchingEntities) {
        const chunkIds = getEntityChunks(entity.name, { db });
        for (const chunkId of chunkIds) {
          // Skip if already in results
          if (kgResults.some((r) => r.chunkId === chunkId)) {
            continue;
          }

          const chunk = db
            .prepare(`SELECT id, path, source, text FROM chunks WHERE id = ?`)
            .get(chunkId) as { id: string; path: string; source: string; text: string } | undefined;

          if (chunk) {
            const provenance = db
              .prepare(`SELECT trust_score FROM chunk_provenance WHERE chunk_id = ?`)
              .get(chunkId) as { trust_score: number } | undefined;

            const trustScore = provenance?.trust_score ?? 0.5;

            if (trustScore >= minTrustScore) {
              kgResults.push({
                chunkId: chunk.id,
                text: chunk.text,
                score: 0.6, // Lower score for fuzzy entity matches
                path: chunk.path,
                source: chunk.source,
                trustScore,
                entities: [entity.name],
              });
            }
          }
        }
      }
    }

    // Deduplicate and limit KG results
    kgResults = deduplicateResults(kgResults).slice(0, maxResults);
  }

  // For kg_only, return just KG results
  if (strategy === "kg_only") {
    return {
      results: kgResults,
      strategy,
      expandedQueries,
      kgContext,
    };
  }

  // For vector_first or hybrid, caller will combine with vector search results
  // Return KG results that can be merged with vector results
  return {
    results: kgResults,
    strategy,
    expandedQueries,
    kgContext,
  };
}

/**
 * Deduplicates results by chunkId, keeping highest score.
 */
function deduplicateResults(results: SearchResult[]): SearchResult[] {
  const byChunkId = new Map<string, SearchResult>();

  for (const result of results) {
    const existing = byChunkId.get(result.chunkId);
    if (!existing || result.score > existing.score) {
      // Merge entities if both have them
      if (existing?.entities && result.entities) {
        result.entities = [...new Set([...existing.entities, ...result.entities])];
      }
      byChunkId.set(result.chunkId, result);
    }
  }

  return Array.from(byChunkId.values());
}

/**
 * Expands a query with entity aliases from the KG.
 * Returns additional query variants to search.
 */
export function expandQueryWithAliases(
  query: string,
  entities: string[],
  options: { db: DatabaseSync },
): string[] {
  const expandedQueries: string[] = [query];
  const { db } = options;

  for (const entityName of entities) {
    // Look up the entity in the KG
    const entity = findEntity(entityName, { db });
    if (!entity) {
      continue;
    }

    // Get aliases and canonical name
    const allNames = [entity.canonical_name, entity.name, ...(entity.aliases || [])].filter(
      (n): n is string => n !== undefined && n !== null,
    );

    // Generate query variants with each alias
    for (const alias of allNames) {
      if (alias.toLowerCase() !== entityName.toLowerCase()) {
        // Create a variant query with the alias substituted
        const variant = query.replace(new RegExp(`\\b${entityName}\\b`, "gi"), alias);
        if (variant !== query && !expandedQueries.includes(variant)) {
          expandedQueries.push(variant);
        }
      }
    }
  }

  return expandedQueries;
}

/**
 * Merges results from multiple retrieval strategies.
 * Handles deduplication and re-scoring.
 */
export function mergeStrategyResults(
  vectorResults: SearchResult[],
  kgResults: SearchResult[],
  weights: { vectorWeight: number; kgWeight: number },
): SearchResult[] {
  const { vectorWeight, kgWeight } = weights;
  const resultMap = new Map<string, SearchResult>();

  // Add vector results
  for (const result of vectorResults) {
    resultMap.set(result.chunkId, {
      ...result,
      score: result.score * vectorWeight,
    });
  }

  // Merge KG results
  for (const result of kgResults) {
    const existing = resultMap.get(result.chunkId);
    if (existing) {
      // Boost score for results found by both methods
      existing.score += result.score * kgWeight;
      if (result.entities) {
        existing.entities = [...(existing.entities || []), ...result.entities];
      }
    } else {
      resultMap.set(result.chunkId, {
        ...result,
        score: result.score * kgWeight,
      });
    }
  }

  // Sort by combined score
  return Array.from(resultMap.values()).toSorted((a, b) => b.score - a.score);
}

/**
 * Builds KG context for a set of entities.
 * Returns relevant entities and their relations.
 */
export function buildKGContext(
  entities: string[],
  options: { db: DatabaseSync; maxHops?: number },
): KGContext {
  const { db, maxHops = 1 } = options;
  const relevantEntities: Array<{ id: string; name: string; type: string }> = [];
  const relations: Array<{ source: string; relation: string; target: string }> = [];
  const seenEntityIds = new Set<string>();

  for (const entityName of entities) {
    // Find the entity in the KG
    const entity = findEntity(entityName, { db, includeRelations: true });
    if (!entity) {
      continue;
    }

    // Add the entity itself
    if (!seenEntityIds.has(entity.id)) {
      seenEntityIds.add(entity.id);
      relevantEntities.push({
        id: entity.id,
        name: entity.name,
        type: entity.entity_type,
      });
    }

    // Add outgoing relations
    for (const rel of entity.outgoingRelations) {
      const targetEntity = db
        .prepare(`SELECT id, name, entity_type FROM entities WHERE id = ?`)
        .get(rel.target_entity_id) as { id: string; name: string; entity_type: string } | undefined;

      if (targetEntity) {
        relations.push({
          source: entity.name,
          relation: rel.relation_type,
          target: targetEntity.name,
        });

        // Add target entity if not seen
        if (!seenEntityIds.has(targetEntity.id)) {
          seenEntityIds.add(targetEntity.id);
          relevantEntities.push({
            id: targetEntity.id,
            name: targetEntity.name,
            type: targetEntity.entity_type,
          });
        }
      }
    }

    // Add incoming relations
    for (const rel of entity.incomingRelations) {
      const sourceEntity = db
        .prepare(`SELECT id, name, entity_type FROM entities WHERE id = ?`)
        .get(rel.source_entity_id) as { id: string; name: string; entity_type: string } | undefined;

      if (sourceEntity) {
        relations.push({
          source: sourceEntity.name,
          relation: rel.relation_type,
          target: entity.name,
        });

        // Add source entity if not seen
        if (!seenEntityIds.has(sourceEntity.id)) {
          seenEntityIds.add(sourceEntity.id);
          relevantEntities.push({
            id: sourceEntity.id,
            name: sourceEntity.name,
            type: sourceEntity.entity_type,
          });
        }
      }
    }

    // Find N-hop neighbors if requested (beyond direct relations already captured)
    if (maxHops > 1) {
      // findNeighbors returns all entities within N hops
      const neighbors = findNeighbors(entityName, maxHops, { db });
      for (const [, hopEntities] of neighbors) {
        for (const neighbor of hopEntities) {
          if (!seenEntityIds.has(neighbor.id)) {
            seenEntityIds.add(neighbor.id);
            relevantEntities.push({
              id: neighbor.id,
              name: neighbor.name,
              type: neighbor.entity_type,
            });
          }
        }
      }
    }
  }

  return { relevantEntities, relations };
}
