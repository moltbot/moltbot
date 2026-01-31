import type { DatabaseSync } from "node:sqlite";
import type { Entity } from "./schema.js";

/**
 * Entity canonicalization and alias resolution.
 * Handles merging duplicate entities and maintaining canonical names.
 *
 * Features:
 * - Exact match resolution on name, canonical_name, and aliases
 * - Fuzzy matching using Levenshtein distance for near-matches
 * - Entity merging to consolidate duplicates
 * - Duplicate detection for manual review
 */

export interface ResolverOptions {
  db: DatabaseSync;
  fuzzyThreshold?: number; // 0.0-1.0, default 0.8
}

export interface ResolutionResult {
  canonicalId: string;
  canonicalName: string;
  isNew: boolean;
  merged: string[]; // IDs of entities that were merged
}

/**
 * Resolves an entity name to its canonical form.
 * Returns existing entity if found, creates new if not.
 */
export function resolveEntity(
  name: string,
  entityType: string,
  options: ResolverOptions,
): ResolutionResult | null {
  const { db } = options;

  // Exact match on name or canonical_name
  const exact = db
    .prepare(
      `SELECT id, canonical_name FROM entities
       WHERE (LOWER(name) = LOWER(?) OR LOWER(canonical_name) = LOWER(?))
       AND entity_type = ?`,
    )
    .get(name, name, entityType) as { id: string; canonical_name: string } | undefined;

  if (exact) {
    return {
      canonicalId: exact.id,
      canonicalName: exact.canonical_name,
      isNew: false,
      merged: [],
    };
  }

  // Check aliases
  const allEntities = db
    .prepare(
      `SELECT id, name, canonical_name, aliases FROM entities
       WHERE entity_type = ?`,
    )
    .all(entityType) as unknown as Array<{
    id: string;
    name: string;
    canonical_name: string;
    aliases: string;
  }>;

  for (const entity of allEntities) {
    const aliases: string[] = JSON.parse(entity.aliases || "[]");
    if (aliases.some((alias) => alias.toLowerCase() === name.toLowerCase())) {
      return {
        canonicalId: entity.id,
        canonicalName: entity.canonical_name,
        isNew: false,
        merged: [],
      };
    }
  }

  // Fuzzy matching if enabled
  const { fuzzyThreshold = 0.8 } = options;
  if (fuzzyThreshold > 0 && fuzzyThreshold < 1) {
    let bestMatch: { id: string; canonical_name: string; similarity: number } | null = null;

    for (const entity of allEntities) {
      // Check against name and all aliases
      const candidates = [entity.name, ...JSON.parse(entity.aliases || "[]")];
      for (const candidate of candidates) {
        const sim = calculateSimilarity(name, candidate);
        if (sim >= fuzzyThreshold && (!bestMatch || sim > bestMatch.similarity)) {
          bestMatch = {
            id: entity.id,
            canonical_name: entity.canonical_name,
            similarity: sim,
          };
        }
      }
    }

    if (bestMatch) {
      return {
        canonicalId: bestMatch.id,
        canonicalName: bestMatch.canonical_name,
        isNew: false,
        merged: [],
      };
    }
  }

  // No match found - caller should create new entity
  return null;
}

/**
 * Merges two entities, keeping the first as canonical.
 * Updates all relations and mentions to point to the canonical entity.
 */
export function mergeEntities(db: DatabaseSync, canonicalId: string, duplicateId: string): boolean {
  const canonical = db.prepare(`SELECT * FROM entities WHERE id = ?`).get(canonicalId) as
    | Entity
    | undefined;
  const duplicate = db.prepare(`SELECT * FROM entities WHERE id = ?`).get(duplicateId) as
    | Entity
    | undefined;

  if (!canonical || !duplicate) {
    return false;
  }

  // Merge aliases
  const canonicalAliases: string[] = JSON.parse((canonical.aliases as unknown as string) || "[]");
  const duplicateAliases: string[] = JSON.parse((duplicate.aliases as unknown as string) || "[]");
  const mergedAliases = [...new Set([...canonicalAliases, ...duplicateAliases, duplicate.name])];

  // Update canonical entity with merged aliases
  db.prepare(`UPDATE entities SET aliases = ?, updated_at = ? WHERE id = ?`).run(
    JSON.stringify(mergedAliases),
    Date.now(),
    canonicalId,
  );

  // Update all relations pointing to duplicate
  db.prepare(`UPDATE relations SET source_entity_id = ? WHERE source_entity_id = ?`).run(
    canonicalId,
    duplicateId,
  );
  db.prepare(`UPDATE relations SET target_entity_id = ? WHERE target_entity_id = ?`).run(
    canonicalId,
    duplicateId,
  );

  // Update all mentions pointing to duplicate
  db.prepare(`UPDATE entity_mentions SET entity_id = ? WHERE entity_id = ?`).run(
    canonicalId,
    duplicateId,
  );

  // Delete duplicate entity
  db.prepare(`DELETE FROM entities WHERE id = ?`).run(duplicateId);

  return true;
}

/**
 * Finds potential duplicate entities based on name similarity.
 * Returns pairs of (entity1, entity2, similarity) for manual review.
 */
export function findPotentialDuplicates(
  db: DatabaseSync,
  entityType?: string,
): Array<{ entity1: Entity; entity2: Entity; similarity: number }> {
  // Get all entities of the specified type (or all if not specified)
  const query = entityType
    ? `SELECT * FROM entities WHERE entity_type = ? ORDER BY name`
    : `SELECT * FROM entities ORDER BY name`;

  const entities = (entityType
    ? db.prepare(query).all(entityType)
    : db.prepare(query).all()) as unknown as Entity[];

  const duplicates: Array<{ entity1: Entity; entity2: Entity; similarity: number }> = [];

  // Simple n^2 comparison - could be optimized with locality-sensitive hashing
  for (let i = 0; i < entities.length; i++) {
    for (let j = i + 1; j < entities.length; j++) {
      const sim = calculateSimilarity(entities[i].name, entities[j].name);
      if (sim >= 0.8) {
        duplicates.push({
          entity1: entities[i],
          entity2: entities[j],
          similarity: sim,
        });
      }
    }
  }

  return duplicates.toSorted((a, b) => b.similarity - a.similarity);
}

/**
 * Simple string similarity using Levenshtein distance.
 * Returns value between 0.0 (completely different) and 1.0 (identical).
 */
function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  if (s1 === s2) {
    return 1.0;
  }

  const len1 = s1.length;
  const len2 = s2.length;

  if (len1 === 0 || len2 === 0) {
    return 0.0;
  }

  // Levenshtein distance
  const matrix: number[][] = [];

  for (let i = 0; i <= len1; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= len2; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= len1; i++) {
    for (let j = 1; j <= len2; j++) {
      const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1, // deletion
        matrix[i][j - 1] + 1, // insertion
        matrix[i - 1][j - 1] + cost, // substitution
      );
    }
  }

  const distance = matrix[len1][len2];
  const maxLen = Math.max(len1, len2);

  return 1 - distance / maxLen;
}
