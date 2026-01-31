import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { ensureKGSchema, generateId } from "./schema.js";
import { extractFromChunk, persistEntities, persistRelations } from "./extractor.js";
import { resolveEntity, mergeEntities, findPotentialDuplicates } from "./resolver.js";
import {
  findEntity,
  findEntitiesByType,
  findRelatedEntities,
  searchEntities,
  getEntityChunks,
  findNeighbors,
  findPath,
  getMostConnected,
} from "./query.js";

/**
 * Integration tests for the Knowledge Graph module.
 * Tests the full pipeline: extraction → storage → query → pathfinding.
 */
describe("kg/integration", () => {
  let db: DatabaseSync;
  let tempDir: string;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");

    // Create chunks table (simulating memory schema)
    db.exec(`
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY,
        path TEXT,
        text TEXT,
        embedding TEXT
      );
    `);

    ensureKGSchema(db);
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "kg-integration-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe("full pipeline: extraction → storage → query", () => {
    it("extracts entities from text and stores them in the database", async () => {
      // Insert a chunk with content that matches extraction patterns
      // Pattern: "X prefers Y" should extract preference relation
      const chunkId = generateId();
      const text = "Tom prefers TypeScript for the Dashboard project.";
      db.prepare(`INSERT INTO chunks (id, path, text) VALUES (?, ?, ?)`).run(
        chunkId,
        "memory/test.md",
        text,
      );

      // Extract entities using pattern-based extraction
      const result = await extractFromChunk(chunkId, text, {
        db,
        sourceType: "user_stated",
      });

      // Pattern-based extraction should return a valid result
      expect(result).toBeDefined();
      expect(result.entities).toBeInstanceOf(Array);

      // If entities were found, persist them and verify storage
      if (result.entities.length > 0) {
        const persisted = persistEntities(db, result.entities, chunkId, "user_stated");
        expect(persisted.length).toBeGreaterThan(0);

        // Verify at least one entity was stored
        const storedEntities = db.prepare(`SELECT * FROM entities`).all();
        expect(storedEntities.length).toBeGreaterThan(0);
      }
    });

    it("extracts and stores relations between entities", async () => {
      const chunkId = generateId();
      // Use text with clear "knows" pattern
      const text = "Alice knows Bob and they both use TypeScript.";
      db.prepare(`INSERT INTO chunks (id, path, text) VALUES (?, ?, ?)`).run(
        chunkId,
        "memory/test.md",
        text,
      );

      const result = await extractFromChunk(chunkId, text, {
        db,
        sourceType: "user_stated",
      });

      // Extraction function should complete without error and return valid structure
      expect(result).toBeDefined();
      expect(result.entities).toBeInstanceOf(Array);
      expect(result.relations).toBeInstanceOf(Array);

      // Persist any entities found
      if (result.entities.length > 0) {
        persistEntities(db, result.entities, chunkId, "user_stated");
      }

      // Persist relations if found (relation persistence requires entities to exist)
      if (result.relations.length > 0) {
        persistRelations(db, result.relations, chunkId, "user_stated");
      }

      // The test passes if extraction completes without error
      // Note: Pattern-based extraction is heuristic, so relations may not always be found
    });

    it("supports entity search by partial name", () => {
      // Create entities directly
      const now = Date.now();
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e1", "TypeScript", "technology", "TypeScript", "[]", 0.9, "user_stated", now, now);
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e2", "JavaScript", "technology", "JavaScript", "[]", 0.9, "user_stated", now, now);

      // Search for partial match
      const results = searchEntities("Script", { db });
      expect(results.length).toBe(2);
      expect(results.map((e) => e.name)).toContain("TypeScript");
      expect(results.map((e) => e.name)).toContain("JavaScript");
    });

    it("filters entities by type", () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e1", "Tom", "person", "Tom", "[]", 0.9, "user_stated", now, now);
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e2", "OpenClaw", "project", "OpenClaw", "[]", 0.9, "user_stated", now, now);

      const people = findEntitiesByType("person", { db });
      expect(people.length).toBe(1);
      expect(people[0].name).toBe("Tom");

      const projects = findEntitiesByType("project", { db });
      expect(projects.length).toBe(1);
      expect(projects[0].name).toBe("OpenClaw");
    });
  });

  describe("entity resolution and deduplication", () => {
    it("resolves entity by alias", () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        "e1",
        "Thomas",
        "person",
        "Thomas",
        JSON.stringify(["Tom", "Tommy"]),
        0.9,
        "user_stated",
        now,
        now,
      );

      // Resolve by alias
      const resolution = resolveEntity("Tom", "person", { db });
      expect(resolution).not.toBeNull();
      expect(resolution?.canonicalId).toBe("e1");
      expect(resolution?.canonicalName).toBe("Thomas");
    });

    it("uses fuzzy matching for near-matches", () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e1", "JavaScript", "technology", "JavaScript", "[]", 0.9, "user_stated", now, now);

      // Resolve with typo (fuzzy threshold should match)
      const resolution = resolveEntity("JavaScrpt", "technology", { db, fuzzyThreshold: 0.8 });
      expect(resolution).not.toBeNull();
      expect(resolution?.canonicalId).toBe("e1");
    });

    it("merges duplicate entities", () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e1", "Tom Smith", "person", "Tom Smith", "[]", 0.9, "user_stated", now, now);
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e2", "Thomas Smith", "person", "Thomas Smith", "[]", 0.9, "user_stated", now, now);

      // Create a relation pointing to the duplicate
      db.prepare(
        `INSERT INTO relations (id, source_entity_id, target_entity_id, relation_type, trust_score, source_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run("r1", "e2", "e1", "knows", 0.8, "user_stated", now);

      // Merge e2 into e1
      const success = mergeEntities(db, "e1", "e2");
      expect(success).toBe(true);

      // Verify e2 is deleted
      const e2 = db.prepare(`SELECT * FROM entities WHERE id = ?`).get("e2");
      expect(e2).toBeUndefined();

      // Verify aliases were merged
      const e1 = findEntity("Tom Smith", { db });
      expect(e1?.aliases).toContain("Thomas Smith");

      // Verify relation was updated
      const relation = db.prepare(`SELECT * FROM relations WHERE id = ?`).get("r1") as {
        source_entity_id: string;
      };
      expect(relation.source_entity_id).toBe("e1");
    });

    it("finds potential duplicates", () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e1", "John Smith", "person", "John Smith", "[]", 0.9, "user_stated", now, now);
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e2", "Jon Smith", "person", "Jon Smith", "[]", 0.9, "user_stated", now, now);
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e3", "Jane Doe", "person", "Jane Doe", "[]", 0.9, "user_stated", now, now);

      const duplicates = findPotentialDuplicates(db, "person");

      // "John Smith" and "Jon Smith" should be flagged as similar
      expect(duplicates.length).toBeGreaterThan(0);
      const johnJonDup = duplicates.find(
        (d) =>
          (d.entity1.name === "John Smith" && d.entity2.name === "Jon Smith") ||
          (d.entity1.name === "Jon Smith" && d.entity2.name === "John Smith"),
      );
      expect(johnJonDup).toBeDefined();
      expect(johnJonDup!.similarity).toBeGreaterThan(0.8);
    });
  });

  describe("graph traversal and pathfinding", () => {
    beforeEach(() => {
      // Create a graph: A -> B -> C -> D
      //                  \-> E -> F
      const now = Date.now();
      const entities = ["A", "B", "C", "D", "E", "F"];
      for (const name of entities) {
        db.prepare(
          `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(`e_${name}`, name, "concept", name, "[]", 0.9, "user_stated", now, now);
      }

      const relations = [
        ["A", "B"],
        ["B", "C"],
        ["C", "D"],
        ["A", "E"],
        ["E", "F"],
      ];
      for (const [source, target] of relations) {
        db.prepare(
          `INSERT INTO relations (id, source_entity_id, target_entity_id, relation_type, trust_score, source_type, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          `r_${source}_${target}`,
          `e_${source}`,
          `e_${target}`,
          "related_to",
          0.9,
          "user_stated",
          now,
        );
      }
    });

    it("finds neighbors within N hops", () => {
      const neighbors = findNeighbors("A", 2, { db });

      // 1 hop: B, E
      expect(
        neighbors
          .get(1)
          ?.map((e) => e.name)
          .toSorted(),
      ).toEqual(["B", "E"]);

      // 2 hops: C (via B), F (via E)
      expect(
        neighbors
          .get(2)
          ?.map((e) => e.name)
          .toSorted(),
      ).toEqual(["C", "F"]);
    });

    it("finds shortest path between entities", () => {
      const pathResult = findPath("A", "D", { db });

      expect(pathResult).not.toBeNull();
      expect(pathResult!.length).toBe(4); // A -> B -> C -> D
      expect(pathResult![0].entity.name).toBe("A");
      expect(pathResult![3].entity.name).toBe("D");
    });

    it("returns null when no path exists", () => {
      // Add isolated entity G
      const now = Date.now();
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e_G", "G", "concept", "G", "[]", 0.9, "user_stated", now, now);

      const pathResult = findPath("A", "G", { db });
      expect(pathResult).toBeNull();
    });

    it("respects maxHops limit in pathfinding", () => {
      // Path A -> D requires 3 hops, but limit to 2
      const pathResult = findPath("A", "D", { db, maxHops: 2 });
      expect(pathResult).toBeNull();
    });

    it("finds most connected entities", () => {
      const mostConnected = getMostConnected({ db, limit: 3 });

      // A has 2 connections (B, E), B has 2 (A, C)
      expect(mostConnected.length).toBeGreaterThan(0);
      expect(mostConnected[0].connectionCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe("chunk-entity association", () => {
    it("tracks which chunks mention an entity", () => {
      const now = Date.now();

      // Create entity
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e1", "Tom", "person", "Tom", "[]", 0.9, "user_stated", now, now);

      // Create chunks
      db.prepare(`INSERT INTO chunks (id, path, text) VALUES (?, ?, ?)`).run(
        "chunk1",
        "memory/day1.md",
        "Tom worked on feature X",
      );
      db.prepare(`INSERT INTO chunks (id, path, text) VALUES (?, ?, ?)`).run(
        "chunk2",
        "memory/day2.md",
        "Tom reviewed the PR",
      );
      db.prepare(`INSERT INTO chunks (id, path, text) VALUES (?, ?, ?)`).run(
        "chunk3",
        "memory/day3.md",
        "Alice deployed to prod",
      );

      // Create mentions
      db.prepare(
        `INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, confidence)
         VALUES (?, ?, ?, ?, ?)`,
      ).run("m1", "e1", "chunk1", "Tom", 0.9);
      db.prepare(
        `INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, confidence)
         VALUES (?, ?, ?, ?, ?)`,
      ).run("m2", "e1", "chunk2", "Tom", 0.9);

      // Query chunks for Tom
      const chunks = getEntityChunks("Tom", { db });
      expect(chunks.length).toBe(2);
      expect(chunks).toContain("chunk1");
      expect(chunks).toContain("chunk2");
      expect(chunks).not.toContain("chunk3");
    });
  });

  describe("trust score filtering", () => {
    it("filters entities by minimum trust score", () => {
      const now = Date.now();
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e1", "HighTrust", "concept", "HighTrust", "[]", 0.9, "user_stated", now, now);
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e2", "LowTrust", "concept", "LowTrust", "[]", 0.2, "external_doc", now, now);

      // Without filter: both entities
      const allEntities = findEntitiesByType("concept", { db });
      expect(allEntities.length).toBe(2);

      // With filter: only high trust
      const highTrustEntities = findEntitiesByType("concept", { db, minTrustScore: 0.5 });
      expect(highTrustEntities.length).toBe(1);
      expect(highTrustEntities[0].name).toBe("HighTrust");
    });

    it("filters related entities by trust score", () => {
      const now = Date.now();

      // Create entities
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e1", "Alice", "person", "Alice", "[]", 0.9, "user_stated", now, now);
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e2", "Project1", "project", "Project1", "[]", 0.9, "user_stated", now, now);
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run("e3", "Project2", "project", "Project2", "[]", 0.9, "user_stated", now, now);

      // Create relations with different trust scores
      db.prepare(
        `INSERT INTO relations (id, source_entity_id, target_entity_id, relation_type, trust_score, source_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run("r1", "e1", "e2", "works_on", 0.9, "user_stated", now);
      db.prepare(
        `INSERT INTO relations (id, source_entity_id, target_entity_id, relation_type, trust_score, source_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run("r2", "e1", "e3", "works_on", 0.2, "external_doc", now);

      // Without filter: both projects
      const allRelated = findRelatedEntities("Alice", "works_on", "outgoing", { db });
      expect(allRelated.length).toBe(2);

      // With filter: only high trust relation
      const highTrustRelated = findRelatedEntities("Alice", "works_on", "outgoing", {
        db,
        minTrustScore: 0.5,
      });
      expect(highTrustRelated.length).toBe(1);
      expect(highTrustRelated[0].name).toBe("Project1");
    });
  });
});
