import type { DatabaseSync } from "node:sqlite";
import type { Entity, EntityMention, Relation, RelationType } from "./schema.js";

/**
 * Knowledge Graph query interface.
 * Provides structured queries for entity and relation lookups.
 *
 * Features:
 * - Entity lookup by name, type, and partial match
 * - Relation queries between entities
 * - Graph traversal (N-hop neighbors)
 * - Path finding between entities
 * - Aggregation queries
 */

export interface EntityWithRelations extends Entity {
  outgoingRelations: Relation[];
  incomingRelations: Relation[];
  mentions: EntityMention[];
}

export interface QueryOptions {
  db: DatabaseSync;
  includeRelations?: boolean;
  includeMentions?: boolean;
  minTrustScore?: number;
}

/**
 * Finds an entity by name, canonical name, or alias.
 */
export function findEntity(name: string, options: QueryOptions): EntityWithRelations | null {
  const { db, includeRelations = false, includeMentions = false, minTrustScore = 0 } = options;

  // Try exact match first
  let entity = db
    .prepare(
      `SELECT * FROM entities
       WHERE (LOWER(name) = LOWER(?) OR LOWER(canonical_name) = LOWER(?))
       AND trust_score >= ?`,
    )
    .get(name, name, minTrustScore) as Entity | undefined;

  // Try alias match if no exact match
  if (!entity) {
    const allEntities = db
      .prepare(`SELECT * FROM entities WHERE trust_score >= ?`)
      .all(minTrustScore) as unknown as Entity[];

    for (const e of allEntities) {
      const aliases: string[] = JSON.parse((e.aliases as unknown as string) || "[]");
      if (aliases.some((a) => a.toLowerCase() === name.toLowerCase())) {
        entity = e;
        break;
      }
    }
  }

  if (!entity) {
    return null;
  }

  // Parse aliases from JSON string
  entity.aliases = JSON.parse((entity.aliases as unknown as string) || "[]");

  const result: EntityWithRelations = {
    ...entity,
    outgoingRelations: [],
    incomingRelations: [],
    mentions: [],
  };

  if (includeRelations) {
    result.outgoingRelations = db
      .prepare(`SELECT * FROM relations WHERE source_entity_id = ? AND trust_score >= ?`)
      .all(entity.id, minTrustScore) as unknown as Relation[];

    result.incomingRelations = db
      .prepare(`SELECT * FROM relations WHERE target_entity_id = ? AND trust_score >= ?`)
      .all(entity.id, minTrustScore) as unknown as Relation[];
  }

  if (includeMentions) {
    result.mentions = db
      .prepare(`SELECT * FROM entity_mentions WHERE entity_id = ?`)
      .all(entity.id) as unknown as EntityMention[];
  }

  return result;
}

/**
 * Finds all entities of a given type.
 */
export function findEntitiesByType(entityType: string, options: QueryOptions): Entity[] {
  const { db, minTrustScore = 0 } = options;

  const entities = db
    .prepare(`SELECT * FROM entities WHERE entity_type = ? AND trust_score >= ? ORDER BY name`)
    .all(entityType, minTrustScore) as unknown as Entity[];

  // Parse aliases for each entity
  return entities.map((e) => ({
    ...e,
    aliases: JSON.parse((e.aliases as unknown as string) || "[]"),
  }));
}

/**
 * Finds relations between two entities (by name or ID).
 */
export function findRelationsBetween(
  entity1: string,
  entity2: string,
  options: QueryOptions,
): Relation[] {
  const { db, minTrustScore = 0 } = options;

  // First resolve entity names to IDs
  const e1 = findEntity(entity1, { db });
  const e2 = findEntity(entity2, { db });

  if (!e1 || !e2) {
    return [];
  }

  return db
    .prepare(
      `SELECT * FROM relations
       WHERE ((source_entity_id = ? AND target_entity_id = ?)
          OR (source_entity_id = ? AND target_entity_id = ?))
       AND trust_score >= ?`,
    )
    .all(e1.id, e2.id, e2.id, e1.id, minTrustScore) as unknown as Relation[];
}

/**
 * Finds all entities related to a given entity via a specific relation type.
 */
export function findRelatedEntities(
  entityName: string,
  relationType: RelationType,
  direction: "outgoing" | "incoming" | "both",
  options: QueryOptions,
): Entity[] {
  const { db, minTrustScore = 0 } = options;

  const entity = findEntity(entityName, { db });
  if (!entity) {
    return [];
  }

  const relatedIds: Set<string> = new Set();

  if (direction === "outgoing" || direction === "both") {
    const outgoing = db
      .prepare(
        `SELECT target_entity_id FROM relations
         WHERE source_entity_id = ? AND relation_type = ? AND trust_score >= ?`,
      )
      .all(entity.id, relationType, minTrustScore) as unknown as Array<{
      target_entity_id: string;
    }>;

    outgoing.forEach((r) => relatedIds.add(r.target_entity_id));
  }

  if (direction === "incoming" || direction === "both") {
    const incoming = db
      .prepare(
        `SELECT source_entity_id FROM relations
         WHERE target_entity_id = ? AND relation_type = ? AND trust_score >= ?`,
      )
      .all(entity.id, relationType, minTrustScore) as unknown as Array<{
      source_entity_id: string;
    }>;

    incoming.forEach((r) => relatedIds.add(r.source_entity_id));
  }

  if (relatedIds.size === 0) {
    return [];
  }

  // Fetch full entity records
  const placeholders = Array.from(relatedIds)
    .map(() => "?")
    .join(",");
  const entities = db
    .prepare(`SELECT * FROM entities WHERE id IN (${placeholders}) AND trust_score >= ?`)
    .all(...relatedIds, minTrustScore) as unknown as Entity[];

  return entities.map((e) => ({
    ...e,
    aliases: JSON.parse((e.aliases as unknown as string) || "[]"),
  }));
}

/**
 * Searches entities by partial name match.
 */
export function searchEntities(
  query: string,
  options: QueryOptions & { limit?: number },
): Entity[] {
  const { db, minTrustScore = 0, limit = 10 } = options;

  const pattern = `%${query.toLowerCase()}%`;

  const entities = db
    .prepare(
      `SELECT * FROM entities
       WHERE (LOWER(name) LIKE ? OR LOWER(canonical_name) LIKE ?)
       AND trust_score >= ?
       ORDER BY trust_score DESC, name
       LIMIT ?`,
    )
    .all(pattern, pattern, minTrustScore, limit) as unknown as Entity[];

  return entities.map((e) => ({
    ...e,
    aliases: JSON.parse((e.aliases as unknown as string) || "[]"),
  }));
}

/**
 * Gets chunks associated with an entity via mentions.
 * Returns chunk IDs that can be used for context retrieval.
 */
export function getEntityChunks(entityName: string, options: QueryOptions): string[] {
  const { db } = options;

  const entity = findEntity(entityName, { db });
  if (!entity) {
    return [];
  }

  const mentions = db
    .prepare(`SELECT DISTINCT chunk_id FROM entity_mentions WHERE entity_id = ?`)
    .all(entity.id) as unknown as Array<{ chunk_id: string }>;

  return mentions.map((m) => m.chunk_id);
}

/**
 * Graph traversal: finds all entities within N hops of the starting entity.
 */
export function findNeighbors(
  entityName: string,
  hops: number,
  options: QueryOptions,
): Map<number, Entity[]> {
  const { db, minTrustScore = 0 } = options;
  const result = new Map<number, Entity[]>();

  const startEntity = findEntity(entityName, { db });
  if (!startEntity) {
    return result;
  }

  const visited = new Set<string>([startEntity.id]);
  let currentLevel = [startEntity.id];

  for (let hop = 1; hop <= hops; hop++) {
    const nextLevel: string[] = [];

    for (const entityId of currentLevel) {
      // Get all connected entities
      const outgoing = db
        .prepare(
          `SELECT target_entity_id FROM relations
           WHERE source_entity_id = ? AND trust_score >= ?`,
        )
        .all(entityId, minTrustScore) as unknown as Array<{ target_entity_id: string }>;

      const incoming = db
        .prepare(
          `SELECT source_entity_id FROM relations
           WHERE target_entity_id = ? AND trust_score >= ?`,
        )
        .all(entityId, minTrustScore) as unknown as Array<{ source_entity_id: string }>;

      for (const r of outgoing) {
        if (!visited.has(r.target_entity_id)) {
          visited.add(r.target_entity_id);
          nextLevel.push(r.target_entity_id);
        }
      }

      for (const r of incoming) {
        if (!visited.has(r.source_entity_id)) {
          visited.add(r.source_entity_id);
          nextLevel.push(r.source_entity_id);
        }
      }
    }

    if (nextLevel.length > 0) {
      const placeholders = nextLevel.map(() => "?").join(",");
      const entities = db
        .prepare(`SELECT * FROM entities WHERE id IN (${placeholders})`)
        .all(...nextLevel) as unknown as Entity[];

      result.set(
        hop,
        entities.map((e) => ({
          ...e,
          aliases: JSON.parse((e.aliases as unknown as string) || "[]"),
        })),
      );
    }

    currentLevel = nextLevel;
  }

  return result;
}

/**
 * Finds a path between two entities using BFS.
 * Returns the sequence of entities and relations, or null if no path exists.
 */
export interface PathStep {
  entity: Entity;
  relation?: Relation;
}

export function findPath(
  fromEntity: string,
  toEntity: string,
  options: QueryOptions & { maxHops?: number },
): PathStep[] | null {
  const { db, minTrustScore = 0, maxHops = 5 } = options;

  const from = findEntity(fromEntity, { db });
  const to = findEntity(toEntity, { db });

  if (!from || !to) {
    return null;
  }

  if (from.id === to.id) {
    return [{ entity: from }];
  }

  // BFS to find shortest path
  const visited = new Set<string>([from.id]);
  const queue: Array<{ entityId: string; path: PathStep[] }> = [
    { entityId: from.id, path: [{ entity: from }] },
  ];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || current.path.length > maxHops) {
      continue;
    }

    // Get all relations from current entity
    const relations = db
      .prepare(
        `SELECT * FROM relations
         WHERE (source_entity_id = ? OR target_entity_id = ?)
         AND trust_score >= ?`,
      )
      .all(current.entityId, current.entityId, minTrustScore) as unknown as Relation[];

    for (const relation of relations) {
      const nextId =
        relation.source_entity_id === current.entityId
          ? relation.target_entity_id
          : relation.source_entity_id;

      if (visited.has(nextId)) {
        continue;
      }

      const nextEntity = db.prepare(`SELECT * FROM entities WHERE id = ?`).get(nextId) as
        | Entity
        | undefined;

      if (!nextEntity) {
        continue;
      }

      nextEntity.aliases = JSON.parse((nextEntity.aliases as unknown as string) || "[]");

      const newPath: PathStep[] = [...current.path, { entity: nextEntity, relation }];

      if (nextId === to.id) {
        return newPath;
      }

      visited.add(nextId);
      queue.push({ entityId: nextId, path: newPath });
    }
  }

  return null;
}

/**
 * Gets the most connected entities (by relation count).
 */
export function getMostConnected(
  options: QueryOptions & { limit?: number; entityType?: string },
): Array<{ entity: Entity; connectionCount: number }> {
  const { db, minTrustScore = 0, limit = 10, entityType } = options;

  const typeFilter = entityType ? `AND e.entity_type = ?` : "";
  const params = entityType
    ? [minTrustScore, minTrustScore, entityType, limit]
    : [minTrustScore, minTrustScore, limit];

  const results = db
    .prepare(
      `SELECT e.*,
              (SELECT COUNT(*) FROM relations r
               WHERE (r.source_entity_id = e.id OR r.target_entity_id = e.id)
               AND r.trust_score >= ?) as connection_count
       FROM entities e
       WHERE e.trust_score >= ?
       ${typeFilter}
       ORDER BY connection_count DESC
       LIMIT ?`,
    )
    .all(...params) as unknown as Array<Entity & { connection_count: number }>;

  return results.map((r) => ({
    entity: {
      ...r,
      aliases: JSON.parse((r.aliases as unknown as string) || "[]"),
    },
    connectionCount: r.connection_count,
  }));
}
