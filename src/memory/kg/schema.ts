import type { DatabaseSync } from "node:sqlite";

/**
 * Knowledge Graph schema definitions for RAG/KG memory system.
 * Adds entity, relation, and entity_mention tables to extend OpenClaw's
 * existing chunk-based memory with structured knowledge graph capabilities.
 */

export interface Entity {
  id: string;
  name: string;
  entity_type: EntityType;
  canonical_name: string | null;
  aliases: string[]; // Stored as JSON in SQLite
  trust_score: number;
  source_type: SourceType;
  created_at: number;
  updated_at: number;
}

export interface Relation {
  id: string;
  source_entity_id: string;
  target_entity_id: string;
  relation_type: RelationType;
  confidence: number;
  source_chunk_id: string | null;
  trust_score: number;
  source_type: SourceType;
  created_at: number;
}

export interface EntityMention {
  id: string;
  entity_id: string;
  chunk_id: string;
  mention_text: string;
  start_offset: number | null;
  end_offset: number | null;
  confidence: number;
}

export type EntityType =
  | "person"
  | "project"
  | "concept"
  | "organization"
  | "technology"
  | "location"
  | "file"
  | "other";

export type RelationType =
  | "works_on"
  | "knows"
  | "prefers"
  | "owns"
  | "uses"
  | "created"
  | "related_to"
  | "depends_on"
  | "part_of"
  | "other";

export type SourceType = "user_stated" | "inferred" | "external_doc" | "tool_result";

/**
 * Ensures all KG-related tables exist in the database.
 * Should be called after ensureMemoryIndexSchema() in memory-schema.ts.
 */
export function ensureKGSchema(db: DatabaseSync): void {
  // Entity table - stores canonical entities extracted from memory
  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      canonical_name TEXT,
      aliases TEXT DEFAULT '[]',
      trust_score REAL DEFAULT 0.5,
      source_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  // Relations table - stores relationships between entities
  db.exec(`
    CREATE TABLE IF NOT EXISTS relations (
      id TEXT PRIMARY KEY,
      source_entity_id TEXT NOT NULL,
      target_entity_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      source_chunk_id TEXT,
      trust_score REAL DEFAULT 0.5,
      source_type TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (source_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY (target_entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY (source_chunk_id) REFERENCES chunks(id) ON DELETE SET NULL
    );
  `);

  // Entity mentions - links entities to chunks where they appear
  db.exec(`
    CREATE TABLE IF NOT EXISTS entity_mentions (
      id TEXT PRIMARY KEY,
      entity_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      mention_text TEXT NOT NULL,
      start_offset INTEGER,
      end_offset INTEGER,
      confidence REAL DEFAULT 0.5,
      FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE,
      FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
    );
  `);

  // Performance indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_canonical ON entities(canonical_name);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_entity_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_entity_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_relations_type ON relations(relation_type);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mentions_entity ON entity_mentions(entity_id);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_mentions_chunk ON entity_mentions(chunk_id);`);
}

/**
 * Generates a unique ID for entities, relations, or mentions.
 * Uses crypto.randomUUID() for collision-free IDs.
 */
export function generateId(): string {
  return crypto.randomUUID();
}
