import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ensureKGSchema, generateId } from "../kg/schema.js";
import { ensureProvenanceSchema } from "../trust/provenance.js";
import { classifyQuery } from "./classifier.js";
import {
  selectStrategy,
  executeStrategy,
  expandQueryWithAliases,
  mergeStrategyResults,
  buildKGContext,
  type SearchResult,
} from "./strategy.js";

describe("router/strategy", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY,
        path TEXT,
        source TEXT,
        text TEXT
      )
    `);
    ensureKGSchema(db);
    ensureProvenanceSchema(db);
  });

  afterEach(() => {
    db.close();
  });

  describe("selectStrategy", () => {
    it("uses suggested strategy for high-confidence classifications", () => {
      const classification = {
        intent: "factual" as const,
        confidence: 0.9,
        suggestedStrategy: "kg_first" as const,
        extractedEntities: [],
      };

      const strategy = selectStrategy(classification);
      expect(strategy).toBe("kg_first");
    });

    it("falls back to hybrid for low-confidence non-unknown classifications", () => {
      const classification = {
        intent: "factual" as const,
        confidence: 0.4,
        suggestedStrategy: "kg_first" as const,
        extractedEntities: [],
      };

      const strategy = selectStrategy(classification);
      expect(strategy).toBe("hybrid");
    });

    it("upgrades vector_first to hybrid when entities are detected", () => {
      const classification = {
        intent: "episodic" as const,
        confidence: 0.9,
        suggestedStrategy: "vector_first" as const,
        extractedEntities: ["Tom", "OpenClaw"],
      };

      const strategy = selectStrategy(classification);
      expect(strategy).toBe("hybrid");
    });

    it("keeps kg_only strategy when specified", () => {
      const classification = {
        intent: "relational" as const,
        confidence: 0.9,
        suggestedStrategy: "kg_only" as const,
        extractedEntities: ["Alice", "Bob"],
      };

      const strategy = selectStrategy(classification);
      expect(strategy).toBe("kg_only");
    });

    it("uses vector_first for unknown intent with no entities", () => {
      const classification = classifyQuery("some random query");

      const strategy = selectStrategy(classification);
      expect(strategy).toBe("vector_first");
    });
  });

  describe("expandQueryWithAliases", () => {
    it("returns original query when no entities found in KG", () => {
      const queries = expandQueryWithAliases("What does Tom prefer?", ["Tom"], { db });

      expect(queries).toHaveLength(1);
      expect(queries[0]).toBe("What does Tom prefer?");
    });

    it("expands query with entity aliases", () => {
      // Create entity with aliases directly in the database
      const chunkId = generateId();
      const entityId = generateId();
      db.prepare("INSERT INTO chunks (id, path, text) VALUES (?, ?, ?)").run(
        chunkId,
        "test.md",
        "Tom prefers TypeScript",
      );

      const now = Date.now();
      db.prepare(`
        INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entityId,
        "Tom",
        "person",
        "Tom",
        JSON.stringify(["Thomas", "Tommy"]),
        0.8,
        "user_stated",
        now,
        now,
      );

      db.prepare(`
        INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, start_offset, end_offset, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), entityId, chunkId, "Tom", 0, 3, 0.9);

      const queries = expandQueryWithAliases("What does Tom prefer?", ["Tom"], { db });

      expect(queries).toContain("What does Tom prefer?");
      expect(queries).toContain("What does Thomas prefer?");
      expect(queries).toContain("What does Tommy prefer?");
    });

    it("handles multiple entities in query", () => {
      const chunkId = generateId();
      db.prepare("INSERT INTO chunks (id, path, text) VALUES (?, ?, ?)").run(
        chunkId,
        "test.md",
        "Tom thinks OpenClaw is great",
      );

      const now = Date.now();
      const tomId = generateId();
      const openclawId = generateId();

      db.prepare(`
        INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        tomId,
        "Tom",
        "person",
        "Tom",
        JSON.stringify(["Thomas"]),
        0.8,
        "user_stated",
        now,
        now,
      );

      db.prepare(`
        INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        openclawId,
        "OpenClaw",
        "project",
        "OpenClaw",
        JSON.stringify(["OC"]),
        0.8,
        "user_stated",
        now,
        now,
      );

      db.prepare(`
        INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, start_offset, end_offset, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), tomId, chunkId, "Tom", 0, 3, 0.9);

      db.prepare(`
        INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, start_offset, end_offset, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), openclawId, chunkId, "OpenClaw", 12, 20, 0.9);

      const queries = expandQueryWithAliases(
        "What does Tom think about OpenClaw?",
        ["Tom", "OpenClaw"],
        { db },
      );

      expect(queries.length).toBeGreaterThan(1);
      expect(queries.some((q) => q.includes("Thomas"))).toBe(true);
      expect(queries.some((q) => q.includes("OC"))).toBe(true);
    });
  });

  describe("buildKGContext", () => {
    it("returns empty context for unknown entities", () => {
      const context = buildKGContext(["Unknown"], { db });

      expect(context.relevantEntities).toHaveLength(0);
      expect(context.relations).toHaveLength(0);
    });

    it("builds context with entity and its relations", () => {
      const chunkId = generateId();
      db.prepare("INSERT INTO chunks (id, path, text) VALUES (?, ?, ?)").run(
        chunkId,
        "test.md",
        "Tom works on OpenClaw",
      );

      const now = Date.now();
      const tomId = generateId();
      const openclawId = generateId();

      // Create entities directly
      db.prepare(`
        INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tomId, "Tom", "person", "Tom", "[]", 0.8, "user_stated", now, now);

      db.prepare(`
        INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(openclawId, "OpenClaw", "project", "OpenClaw", "[]", 0.8, "user_stated", now, now);

      // Create entity mentions
      db.prepare(`
        INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, start_offset, end_offset, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), tomId, chunkId, "Tom", 0, 3, 0.9);

      db.prepare(`
        INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, start_offset, end_offset, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), openclawId, chunkId, "OpenClaw", 13, 21, 0.9);

      // Create relation
      db.prepare(`
        INSERT INTO relations (id, source_entity_id, target_entity_id, relation_type, confidence, source_chunk_id, trust_score, source_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), tomId, openclawId, "works_on", 0.8, chunkId, 0.8, "user_stated", now);

      const context = buildKGContext(["Tom"], { db });

      expect(context.relevantEntities.length).toBeGreaterThan(0);
      expect(context.relevantEntities.some((e) => e.name === "Tom")).toBe(true);
      expect(context.relevantEntities.some((e) => e.name === "OpenClaw")).toBe(true);
      expect(context.relations.some((r) => r.source === "Tom" && r.target === "OpenClaw")).toBe(
        true,
      );
    });

    it("includes N-hop neighbors when maxHops > 1", () => {
      const chunkId = generateId();
      db.prepare("INSERT INTO chunks (id, path, text) VALUES (?, ?, ?)").run(
        chunkId,
        "test.md",
        "Tom works on OpenClaw which uses Claude",
      );

      const now = Date.now();
      const tomId = generateId();
      const openclawId = generateId();
      const claudeId = generateId();

      // Create entities: Tom -> OpenClaw -> Claude
      db.prepare(`
        INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(tomId, "Tom", "person", "Tom", "[]", 0.8, "user_stated", now, now);

      db.prepare(`
        INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(openclawId, "OpenClaw", "project", "OpenClaw", "[]", 0.8, "user_stated", now, now);

      db.prepare(`
        INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(claudeId, "Claude", "concept", "Claude", "[]", 0.8, "user_stated", now, now);

      // Create entity mentions
      db.prepare(`
        INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, start_offset, end_offset, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), tomId, chunkId, "Tom", 0, 3, 0.9);

      // Create relations: Tom -> OpenClaw -> Claude
      db.prepare(`
        INSERT INTO relations (id, source_entity_id, target_entity_id, relation_type, confidence, source_chunk_id, trust_score, source_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), tomId, openclawId, "works_on", 0.8, chunkId, 0.8, "user_stated", now);

      db.prepare(`
        INSERT INTO relations (id, source_entity_id, target_entity_id, relation_type, confidence, source_chunk_id, trust_score, source_type, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), openclawId, claudeId, "uses", 0.8, chunkId, 0.8, "user_stated", now);

      const context = buildKGContext(["Tom"], { db, maxHops: 2 });

      // Should include Claude (2 hops from Tom)
      expect(context.relevantEntities.some((e) => e.name === "Claude")).toBe(true);
    });
  });

  describe("executeStrategy", () => {
    it("returns empty results for entities not in KG", async () => {
      const classification = classifyQuery("What does Tom prefer?");
      const result = await executeStrategy("What does Tom prefer?", classification, { db });

      expect(result.results).toHaveLength(0);
      expect(result.strategy).toBeDefined();
    });

    it("returns chunks mentioning entities for kg_first strategy", async () => {
      // Create chunk and entity
      const chunkId = generateId();
      const entityId = generateId();
      const now = Date.now();

      db.prepare("INSERT INTO chunks (id, path, source, text) VALUES (?, ?, ?, ?)").run(
        chunkId,
        "memory/prefs.md",
        "memory",
        "Tom prefers TypeScript for new projects.",
      );

      db.prepare(`
        INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(entityId, "Tom", "person", "Tom", "[]", 0.8, "user_stated", now, now);

      db.prepare(`
        INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, start_offset, end_offset, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), entityId, chunkId, "Tom", 0, 3, 0.9);

      const classification = classifyQuery("What does Tom prefer?");
      const result = await executeStrategy("What does Tom prefer?", classification, { db });

      expect(result.results.length).toBeGreaterThan(0);
      expect(result.results[0].chunkId).toBe(chunkId);
      expect(result.kgContext).toBeDefined();
    });

    it("filters results by minimum trust score", async () => {
      // Create chunk and entity with low trust
      const chunkId = generateId();
      const entityId = generateId();
      const now = Date.now();

      db.prepare("INSERT INTO chunks (id, path, source, text) VALUES (?, ?, ?, ?)").run(
        chunkId,
        "external.md",
        "external",
        "Tom prefers JavaScript.",
      );

      db.prepare(`
        INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(entityId, "Tom", "person", "Tom", "[]", 0.3, "external_doc", now, now);

      db.prepare(`
        INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, start_offset, end_offset, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), entityId, chunkId, "Tom", 0, 3, 0.9);

      // Set low trust score
      db.prepare(`
        INSERT INTO chunk_provenance (chunk_id, source_type, trust_score, created_at)
        VALUES (?, ?, ?, ?)
      `).run(chunkId, "external_doc", 0.2, now);

      const classification = classifyQuery("What does Tom prefer?");
      const result = await executeStrategy("What does Tom prefer?", classification, {
        db,
        minTrustScore: 0.5,
      });

      // Should filter out the low-trust chunk
      expect(result.results.every((r) => (r.trustScore ?? 0.5) >= 0.5)).toBe(true);
    });

    it("includes expanded queries in result", async () => {
      const chunkId = generateId();
      const entityId = generateId();
      const now = Date.now();

      db.prepare("INSERT INTO chunks (id, path, text) VALUES (?, ?, ?)").run(
        chunkId,
        "test.md",
        "Tom prefers TypeScript",
      );

      db.prepare(`
        INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        entityId,
        "Tom",
        "person",
        "Tom",
        JSON.stringify(["Thomas"]),
        0.8,
        "user_stated",
        now,
        now,
      );

      db.prepare(`
        INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, start_offset, end_offset, confidence)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(generateId(), entityId, chunkId, "Tom", 0, 3, 0.9);

      const classification = classifyQuery("What does Tom prefer?");
      const result = await executeStrategy("What does Tom prefer?", classification, { db });

      expect(result.expandedQueries).toBeDefined();
      expect(result.expandedQueries?.length).toBeGreaterThan(1);
    });
  });

  describe("mergeStrategyResults", () => {
    it("combines vector and KG results with weights", () => {
      const vectorResults: SearchResult[] = [
        { chunkId: "c1", text: "Chunk 1", score: 0.8, path: "p1", source: "memory" },
        { chunkId: "c2", text: "Chunk 2", score: 0.6, path: "p2", source: "memory" },
      ];

      const kgResults: SearchResult[] = [
        {
          chunkId: "c1",
          text: "Chunk 1",
          score: 0.9,
          path: "p1",
          source: "memory",
          entities: ["Tom"],
        },
        {
          chunkId: "c3",
          text: "Chunk 3",
          score: 0.7,
          path: "p3",
          source: "memory",
          entities: ["Alice"],
        },
      ];

      const merged = mergeStrategyResults(vectorResults, kgResults, {
        vectorWeight: 0.6,
        kgWeight: 0.4,
      });

      // c1 should have boosted score (found in both)
      const c1 = merged.find((r) => r.chunkId === "c1");
      expect(c1).toBeDefined();
      expect(c1!.score).toBe(0.8 * 0.6 + 0.9 * 0.4); // 0.48 + 0.36 = 0.84

      // c2 only from vector
      const c2 = merged.find((r) => r.chunkId === "c2");
      expect(c2!.score).toBe(0.6 * 0.6); // 0.36

      // c3 only from KG
      const c3 = merged.find((r) => r.chunkId === "c3");
      expect(c3!.score).toBe(0.7 * 0.4); // 0.28
    });

    it("sorts results by combined score descending", () => {
      const vectorResults: SearchResult[] = [
        { chunkId: "c1", text: "Chunk 1", score: 0.5, path: "p1", source: "memory" },
      ];

      const kgResults: SearchResult[] = [
        { chunkId: "c2", text: "Chunk 2", score: 1.0, path: "p2", source: "memory" },
      ];

      const merged = mergeStrategyResults(vectorResults, kgResults, {
        vectorWeight: 0.5,
        kgWeight: 0.5,
      });

      expect(merged[0].chunkId).toBe("c2"); // Higher score first
    });

    it("merges entity lists for overlapping results", () => {
      const vectorResults: SearchResult[] = [
        {
          chunkId: "c1",
          text: "Chunk 1",
          score: 0.8,
          path: "p1",
          source: "memory",
          entities: ["Tom"],
        },
      ];

      const kgResults: SearchResult[] = [
        {
          chunkId: "c1",
          text: "Chunk 1",
          score: 0.9,
          path: "p1",
          source: "memory",
          entities: ["Alice"],
        },
      ];

      const merged = mergeStrategyResults(vectorResults, kgResults, {
        vectorWeight: 0.5,
        kgWeight: 0.5,
      });

      const c1 = merged.find((r) => r.chunkId === "c1");
      expect(c1!.entities).toContain("Tom");
      expect(c1!.entities).toContain("Alice");
    });
  });
});
