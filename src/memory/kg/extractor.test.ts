import { describe, expect, it, beforeEach, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";

import {
  extractFromChunk,
  extractWithPatterns,
  persistEntities,
  persistRelations,
  type ExtractedEntity,
  type ExtractedRelation,
} from "./extractor.js";
import { ensureKGSchema } from "./schema.js";

describe("kg/extractor", () => {
  describe("extractWithPatterns", () => {
    it("extracts proper nouns as entities", () => {
      const result = extractWithPatterns("John Smith works at Acme Corp on the Widget project.");

      const names = result.entities.map((e) => e.name);
      expect(names).toContain("John Smith");
      expect(names).toContain("Acme Corp");
      expect(names).toContain("Widget");
    });

    it("extracts technology keywords with high confidence", () => {
      const result = extractWithPatterns("We use TypeScript and React for the frontend.");

      const techEntities = result.entities.filter((e) => e.type === "technology");
      expect(techEntities.length).toBeGreaterThanOrEqual(2);

      const typeScriptEntity = techEntities.find((e) => e.name.toLowerCase() === "typescript");
      expect(typeScriptEntity).toBeDefined();
      expect(typeScriptEntity?.confidence).toBe(0.8);
    });

    it("extracts quoted strings as concepts", () => {
      const result = extractWithPatterns(
        'The project is called "Memory RAGKG" and uses "hybrid search".',
      );

      const concepts = result.entities.filter((e) => e.type === "concept");
      const names = concepts.map((e) => e.name);
      expect(names).toContain("Memory RAGKG");
      expect(names).toContain("hybrid search");
    });

    it("extracts CamelCase identifiers", () => {
      const result = extractWithPatterns("The MemoryIndexManager handles EntityExtraction.");

      const names = result.entities.map((e) => e.name);
      expect(names).toContain("MemoryIndexManager");
      expect(names).toContain("EntityExtraction");
    });

    it("extracts snake_case identifiers", () => {
      const result = extractWithPatterns("Call extract_from_chunk and persist_entities functions.");

      const names = result.entities.map((e) => e.name);
      expect(names).toContain("extract_from_chunk");
      expect(names).toContain("persist_entities");
    });

    it("extracts file paths", () => {
      const result = extractWithPatterns("Edit src/memory/kg/extractor.ts and config.json files.");

      const files = result.entities.filter((e) => e.type === "file");
      expect(files.length).toBeGreaterThanOrEqual(2);
    });

    it("filters out stop words", () => {
      const result = extractWithPatterns("The quick brown fox jumps over the lazy dog.");

      const names = result.entities.map((e) => e.name.toLowerCase());
      expect(names).not.toContain("the");
      expect(names).not.toContain("over");
    });

    it("extracts relations from pattern matches", () => {
      const result = extractWithPatterns("Tom uses TypeScript. Alice works on OpenClaw.");

      expect(result.relations.length).toBeGreaterThanOrEqual(2);

      const usesRelation = result.relations.find((r) => r.relationType === "uses");
      expect(usesRelation).toBeDefined();

      const worksOnRelation = result.relations.find((r) => r.relationType === "works_on");
      expect(worksOnRelation).toBeDefined();
    });

    it("returns empty for very short text", async () => {
      const result = await extractFromChunk("test", "Hi", {
        db: {} as DatabaseSync,
        sourceType: "user_stated",
      });

      expect(result.entities).toHaveLength(0);
      expect(result.relations).toHaveLength(0);
    });

    it("infers person type from context", () => {
      const result = extractWithPatterns("The developer John created the API.");

      const johnEntity = result.entities.find((e) => e.name === "John");
      expect(johnEntity?.type).toBe("person");
    });

    it("infers organization type from context", () => {
      const result = extractWithPatterns("The company Acme Inc provides cloud services.");

      const acmeEntity = result.entities.find((e) => e.name.includes("Acme"));
      expect(acmeEntity?.type).toBe("organization");
    });

    it("infers project type from context", () => {
      // The "repository" keyword in context triggers project type inference
      const result = extractWithPatterns("Check out the repository Widget for more details.");

      const projectEntity = result.entities.find((e) => e.name === "Widget");
      expect(projectEntity?.type).toBe("project");
    });

    it("deduplicates entities by type and name", () => {
      // Same entity mentioned multiple times with same type should be deduplicated
      const result = extractWithPatterns("React is great. I love React. React forever!");

      // React is a tech keyword, so it should be extracted once as technology
      const reactEntities = result.entities.filter(
        (e) => e.name.toLowerCase() === "react" && e.type === "technology",
      );
      expect(reactEntities.length).toBe(1);
    });
  });

  describe("persistEntities", () => {
    let db: DatabaseSync;

    beforeEach(() => {
      db = new DatabaseSync(":memory:");
      // Create minimal schema for testing
      db.exec(`
        CREATE TABLE chunks (
          id TEXT PRIMARY KEY,
          text TEXT
        );
        INSERT INTO chunks (id, text) VALUES ('chunk1', 'test');
      `);
      ensureKGSchema(db);
    });

    it("inserts new entities", () => {
      const entities: ExtractedEntity[] = [
        {
          name: "TestEntity",
          type: "concept",
          mentionText: "TestEntity",
          confidence: 0.8,
        },
      ];

      const result = persistEntities(db, entities, "chunk1", "user_stated", 0.9);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("TestEntity");
      expect(result[0].trust_score).toBe(0.9);
    });

    it("creates entity mentions", () => {
      const entities: ExtractedEntity[] = [
        {
          name: "TestEntity",
          type: "concept",
          mentionText: "TestEntity",
          startOffset: 10,
          endOffset: 20,
          confidence: 0.8,
        },
      ];

      persistEntities(db, entities, "chunk1", "user_stated");

      const mention = db
        .prepare("SELECT * FROM entity_mentions WHERE chunk_id = ?")
        .get("chunk1") as { mention_text: string; start_offset: number };

      expect(mention).toBeDefined();
      expect(mention.mention_text).toBe("TestEntity");
      expect(mention.start_offset).toBe(10);
    });

    it("updates aliases for existing entities", () => {
      const entities1: ExtractedEntity[] = [
        { name: "TypeScript", type: "technology", mentionText: "TypeScript", confidence: 0.8 },
      ];
      const entities2: ExtractedEntity[] = [
        { name: "typescript", type: "technology", mentionText: "typescript", confidence: 0.8 },
      ];

      persistEntities(db, entities1, "chunk1", "user_stated");
      persistEntities(db, entities2, "chunk1", "user_stated");

      const entity = db
        .prepare("SELECT aliases FROM entities WHERE LOWER(name) = 'typescript'")
        .get() as { aliases: string };

      const aliases = JSON.parse(entity.aliases);
      expect(aliases).toContain("typescript");
    });
  });

  describe("persistRelations", () => {
    let db: DatabaseSync;

    beforeEach(() => {
      db = new DatabaseSync(":memory:");
      db.exec(`
        CREATE TABLE chunks (id TEXT PRIMARY KEY, text TEXT);
        INSERT INTO chunks (id, text) VALUES ('chunk1', 'test');
      `);
      ensureKGSchema(db);

      // Pre-create entities for relation tests
      const now = Date.now();
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e1", "Tom", "person", "tom", "[]", 0.9, "user_stated", now, now);
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e2", "TypeScript", "technology", "typescript", "[]", 0.9, "user_stated", now, now);
    });

    it("inserts new relations", () => {
      const relations: ExtractedRelation[] = [
        {
          sourceEntityName: "Tom",
          targetEntityName: "TypeScript",
          relationType: "uses",
          confidence: 0.7,
        },
      ];

      const result = persistRelations(db, relations, "chunk1", "user_stated", 0.9);

      expect(result).toHaveLength(1);
      expect(result[0].relation_type).toBe("uses");
    });

    it("skips relations with non-existent entities", () => {
      const relations: ExtractedRelation[] = [
        {
          sourceEntityName: "NonExistent",
          targetEntityName: "TypeScript",
          relationType: "uses",
          confidence: 0.7,
        },
      ];

      const result = persistRelations(db, relations, "chunk1", "user_stated");

      expect(result).toHaveLength(0);
    });

    it("updates confidence for existing relations", () => {
      const relations1: ExtractedRelation[] = [
        {
          sourceEntityName: "Tom",
          targetEntityName: "TypeScript",
          relationType: "uses",
          confidence: 0.5,
        },
      ];
      const relations2: ExtractedRelation[] = [
        {
          sourceEntityName: "Tom",
          targetEntityName: "TypeScript",
          relationType: "uses",
          confidence: 0.9,
        },
      ];

      persistRelations(db, relations1, "chunk1", "user_stated");
      persistRelations(db, relations2, "chunk1", "user_stated");

      const relation = db
        .prepare("SELECT confidence FROM relations WHERE relation_type = 'uses'")
        .get() as { confidence: number };

      expect(relation.confidence).toBe(0.9);
    });
  });

  describe("extractFromChunk with LLM", () => {
    it("falls back to patterns when LLM is disabled", async () => {
      const result = await extractFromChunk("chunk1", "Tom uses TypeScript for development.", {
        db: {} as DatabaseSync,
        sourceType: "user_stated",
        useLlm: false,
      });

      expect(result.entities.length).toBeGreaterThan(0);
    });

    it("falls back to patterns when no API key provided", async () => {
      const result = await extractFromChunk("chunk1", "Tom uses TypeScript for development.", {
        db: {} as DatabaseSync,
        sourceType: "user_stated",
        useLlm: true,
        // No API key
      });

      expect(result.entities.length).toBeGreaterThan(0);
    });

    it("handles LLM extraction failure gracefully", async () => {
      // Mock fetch to fail
      const originalFetch = globalThis.fetch;
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

      try {
        const result = await extractFromChunk("chunk1", "Tom uses TypeScript for development.", {
          db: {} as DatabaseSync,
          sourceType: "user_stated",
          useLlm: true,
          openaiApiKey: "test-key",
        });

        // Should fall back to pattern extraction
        expect(result.entities.length).toBeGreaterThan(0);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
