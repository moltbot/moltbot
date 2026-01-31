import type { DatabaseSync } from "node:sqlite";

import { truncateUtf16Safe } from "../utils.js";
import { cosineSimilarity, parseEmbedding } from "./internal.js";
import { classifyQuery, selectStrategy, type ClassificationResult } from "./router/index.js";
import { findEntity, getEntityChunks, searchEntities } from "./kg/index.js";

const vectorToBlob = (embedding: number[]): Buffer =>
  Buffer.from(new Float32Array(embedding).buffer);

export type SearchSource = string;

export type SearchRowResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: SearchSource;
};

export async function searchVector(params: {
  db: DatabaseSync;
  vectorTable: string;
  providerModel: string;
  queryVec: number[];
  limit: number;
  snippetMaxChars: number;
  ensureVectorReady: (dimensions: number) => Promise<boolean>;
  sourceFilterVec: { sql: string; params: SearchSource[] };
  sourceFilterChunks: { sql: string; params: SearchSource[] };
}): Promise<SearchRowResult[]> {
  if (params.queryVec.length === 0 || params.limit <= 0) {
    return [];
  }
  if (await params.ensureVectorReady(params.queryVec.length)) {
    const rows = params.db
      .prepare(
        `SELECT c.id, c.path, c.start_line, c.end_line, c.text,\n` +
          `       c.source,\n` +
          `       vec_distance_cosine(v.embedding, ?) AS dist\n` +
          `  FROM ${params.vectorTable} v\n` +
          `  JOIN chunks c ON c.id = v.id\n` +
          ` WHERE c.model = ?${params.sourceFilterVec.sql}\n` +
          ` ORDER BY dist ASC\n` +
          ` LIMIT ?`,
      )
      .all(
        vectorToBlob(params.queryVec),
        params.providerModel,
        ...params.sourceFilterVec.params,
        params.limit,
      ) as Array<{
      id: string;
      path: string;
      start_line: number;
      end_line: number;
      text: string;
      source: SearchSource;
      dist: number;
    }>;
    return rows.map((row) => ({
      id: row.id,
      path: row.path,
      startLine: row.start_line,
      endLine: row.end_line,
      score: 1 - row.dist,
      snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
      source: row.source,
    }));
  }

  const candidates = listChunks({
    db: params.db,
    providerModel: params.providerModel,
    sourceFilter: params.sourceFilterChunks,
  });
  const scored = candidates
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(params.queryVec, chunk.embedding),
    }))
    .filter((entry) => Number.isFinite(entry.score));
  return scored
    .toSorted((a, b) => b.score - a.score)
    .slice(0, params.limit)
    .map((entry) => ({
      id: entry.chunk.id,
      path: entry.chunk.path,
      startLine: entry.chunk.startLine,
      endLine: entry.chunk.endLine,
      score: entry.score,
      snippet: truncateUtf16Safe(entry.chunk.text, params.snippetMaxChars),
      source: entry.chunk.source,
    }));
}

export function listChunks(params: {
  db: DatabaseSync;
  providerModel: string;
  sourceFilter: { sql: string; params: SearchSource[] };
}): Array<{
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  embedding: number[];
  source: SearchSource;
}> {
  const rows = params.db
    .prepare(
      `SELECT id, path, start_line, end_line, text, embedding, source\n` +
        `  FROM chunks\n` +
        ` WHERE model = ?${params.sourceFilter.sql}`,
    )
    .all(params.providerModel, ...params.sourceFilter.params) as Array<{
    id: string;
    path: string;
    start_line: number;
    end_line: number;
    text: string;
    embedding: string;
    source: SearchSource;
  }>;

  return rows.map((row) => ({
    id: row.id,
    path: row.path,
    startLine: row.start_line,
    endLine: row.end_line,
    text: row.text,
    embedding: parseEmbedding(row.embedding),
    source: row.source,
  }));
}

export async function searchKeyword(params: {
  db: DatabaseSync;
  ftsTable: string;
  providerModel: string;
  query: string;
  limit: number;
  snippetMaxChars: number;
  sourceFilter: { sql: string; params: SearchSource[] };
  buildFtsQuery: (raw: string) => string | null;
  bm25RankToScore: (rank: number) => number;
}): Promise<Array<SearchRowResult & { textScore: number }>> {
  if (params.limit <= 0) {
    return [];
  }
  const ftsQuery = params.buildFtsQuery(params.query);
  if (!ftsQuery) {
    return [];
  }

  const rows = params.db
    .prepare(
      `SELECT id, path, source, start_line, end_line, text,\n` +
        `       bm25(${params.ftsTable}) AS rank\n` +
        `  FROM ${params.ftsTable}\n` +
        ` WHERE ${params.ftsTable} MATCH ? AND model = ?${params.sourceFilter.sql}\n` +
        ` ORDER BY rank ASC\n` +
        ` LIMIT ?`,
    )
    .all(ftsQuery, params.providerModel, ...params.sourceFilter.params, params.limit) as Array<{
    id: string;
    path: string;
    source: SearchSource;
    start_line: number;
    end_line: number;
    text: string;
    rank: number;
  }>;

  return rows.map((row) => {
    const textScore = params.bm25RankToScore(row.rank);
    return {
      id: row.id,
      path: row.path,
      startLine: row.start_line,
      endLine: row.end_line,
      score: textScore,
      textScore,
      snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
      source: row.source,
    };
  });
}

// ============================================================================
// KG-Aware Routing
// ============================================================================

/**
 * Extended search result with routing metadata.
 */
export type RoutedSearchResult = SearchRowResult & {
  kgBoost?: number;
  matchedEntities?: string[];
  routingInfo?: {
    intent: string;
    strategy: string;
    confidence: number;
  };
};

/**
 * Options for KG-aware routing.
 */
export interface RoutingOptions {
  /** Enable KG-based routing (default: true) */
  enableRouting?: boolean;
  /** Score boost for chunks matched via KG (default: 0.15) */
  kgBoostFactor?: number;
  /** Minimum trust score for KG entities (default: 0) */
  minTrustScore?: number;
  /** Maximum entities to resolve from query (default: 5) */
  maxEntities?: number;
}

const DEFAULT_ROUTING_OPTIONS: Required<RoutingOptions> = {
  enableRouting: true,
  kgBoostFactor: 0.15,
  minTrustScore: 0,
  maxEntities: 5,
};

/**
 * Classifies a query and returns routing metadata.
 * This is the entry point for intent-based routing.
 */
export function getQueryRouting(query: string): {
  classification: ClassificationResult;
  strategy: string;
  shouldUseKG: boolean;
} {
  const classification = classifyQuery(query);
  const strategy = selectStrategy(classification);

  // Determine if KG should be used based on strategy
  const shouldUseKG = strategy === "kg_first" || strategy === "kg_only" || strategy === "hybrid";

  return {
    classification,
    strategy,
    shouldUseKG,
  };
}

/**
 * Resolves entity names from a query to their chunk IDs via the KG.
 * Returns a map of chunk IDs to their matched entity names.
 */
export function resolveKGChunks(
  db: DatabaseSync,
  entityNames: string[],
  options: Pick<RoutingOptions, "minTrustScore" | "maxEntities"> = {},
): Map<string, string[]> {
  const { minTrustScore = 0, maxEntities = 5 } = options;
  const chunkEntityMap = new Map<string, string[]>();

  // Limit the number of entities we resolve
  const entitiesToResolve = entityNames.slice(0, maxEntities);

  for (const name of entitiesToResolve) {
    // Try exact entity match first
    const entity = findEntity(name, { db, minTrustScore });

    if (entity) {
      const chunkIds = getEntityChunks(name, { db });
      for (const chunkId of chunkIds) {
        const existing = chunkEntityMap.get(chunkId) || [];
        existing.push(entity.name);
        chunkEntityMap.set(chunkId, existing);
      }
    } else {
      // Fall back to fuzzy search
      const matches = searchEntities(name, { db, minTrustScore, limit: 2 });
      for (const match of matches) {
        const chunkIds = getEntityChunks(match.name, { db });
        for (const chunkId of chunkIds) {
          const existing = chunkEntityMap.get(chunkId) || [];
          existing.push(match.name);
          chunkEntityMap.set(chunkId, existing);
        }
      }
    }
  }

  return chunkEntityMap;
}

/**
 * Applies KG-based boosting to search results.
 * Chunks associated with query entities receive a score boost.
 */
export function applyKGBoost(
  results: SearchRowResult[],
  kgChunks: Map<string, string[]>,
  boostFactor: number,
): RoutedSearchResult[] {
  return results.map((result) => {
    const matchedEntities = kgChunks.get(result.id);
    if (matchedEntities && matchedEntities.length > 0) {
      // Apply boost proportional to number of matched entities
      const kgBoost = boostFactor * Math.min(matchedEntities.length, 3);
      return {
        ...result,
        score: result.score + kgBoost,
        kgBoost,
        matchedEntities,
      };
    }
    return result;
  });
}

/**
 * Performs KG-enhanced vector search with intent-based routing.
 *
 * This function wraps the standard vector search with:
 * 1. Query intent classification
 * 2. Entity extraction from the query
 * 3. KG lookup for entity-related chunks
 * 4. Score boosting for KG-matched chunks
 *
 * The original search remains the primary retrieval path; KG enhancement
 * is additive and never replaces vector results.
 */
export async function searchVectorWithRouting(
  params: Parameters<typeof searchVector>[0] & {
    query: string;
    routingOptions?: RoutingOptions;
  },
): Promise<{
  results: RoutedSearchResult[];
  routing: ReturnType<typeof getQueryRouting>;
}> {
  const options = { ...DEFAULT_ROUTING_OPTIONS, ...params.routingOptions };

  // Step 1: Classify query intent
  const routing = getQueryRouting(params.query);

  // Step 2: Perform standard vector search
  const baseResults = await searchVector(params);

  // Step 3: If routing is disabled or KG not needed, return base results
  if (!options.enableRouting || !routing.shouldUseKG) {
    return {
      results: baseResults.map((r) => ({
        ...r,
        routingInfo: {
          intent: routing.classification.intent,
          strategy: routing.strategy,
          confidence: routing.classification.confidence,
        },
      })),
      routing,
    };
  }

  // Step 4: Resolve entities from query to KG chunks
  const extractedEntities = routing.classification.extractedEntities;
  const kgChunks = resolveKGChunks(params.db, extractedEntities, {
    minTrustScore: options.minTrustScore,
    maxEntities: options.maxEntities,
  });

  // Step 5: Apply KG boost to results
  const boostedResults = applyKGBoost(baseResults, kgChunks, options.kgBoostFactor);

  // Step 6: Re-sort by boosted score
  const sortedResults = boostedResults.toSorted((a, b) => b.score - a.score);

  // Step 7: Add routing metadata
  return {
    results: sortedResults.map((r) => ({
      ...r,
      routingInfo: {
        intent: routing.classification.intent,
        strategy: routing.strategy,
        confidence: routing.classification.confidence,
      },
    })),
    routing,
  };
}

/**
 * Performs KG-enhanced keyword search with intent-based routing.
 * Similar to searchVectorWithRouting but for BM25 keyword search.
 */
export async function searchKeywordWithRouting(
  params: Parameters<typeof searchKeyword>[0] & {
    routingOptions?: RoutingOptions;
  },
): Promise<{
  results: Array<RoutedSearchResult & { textScore: number }>;
  routing: ReturnType<typeof getQueryRouting>;
}> {
  const options = { ...DEFAULT_ROUTING_OPTIONS, ...params.routingOptions };

  // Step 1: Classify query intent
  const routing = getQueryRouting(params.query);

  // Step 2: Perform standard keyword search
  const baseResults = await searchKeyword(params);

  // Step 3: If routing is disabled or KG not needed, return base results
  if (!options.enableRouting || !routing.shouldUseKG) {
    return {
      results: baseResults.map((r) => ({
        ...r,
        routingInfo: {
          intent: routing.classification.intent,
          strategy: routing.strategy,
          confidence: routing.classification.confidence,
        },
      })),
      routing,
    };
  }

  // Step 4: Resolve entities from query to KG chunks
  const extractedEntities = routing.classification.extractedEntities;
  const kgChunks = resolveKGChunks(params.db, extractedEntities, {
    minTrustScore: options.minTrustScore,
    maxEntities: options.maxEntities,
  });

  // Step 5: Apply KG boost to results
  const boostedResults = applyKGBoost(baseResults, kgChunks, options.kgBoostFactor) as Array<
    RoutedSearchResult & { textScore: number }
  >;

  // Step 6: Re-sort by boosted score
  const sortedResults = boostedResults.toSorted((a, b) => b.score - a.score);

  // Step 7: Add routing metadata
  return {
    results: sortedResults.map((r) => ({
      ...r,
      routingInfo: {
        intent: routing.classification.intent,
        strategy: routing.strategy,
        confidence: routing.classification.confidence,
      },
    })),
    routing,
  };
}
