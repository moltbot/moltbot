import { describe, expect, it, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";

import {
  ensureProvenanceSchema,
  recordProvenance,
  getProvenance,
  verifyChunk,
  getDefaultTrustScore,
  recordContradiction,
  getContradictionCount,
} from "./provenance.js";

describe("trust/provenance", () => {
  let db: DatabaseSync;

  beforeEach(() => {
    db = new DatabaseSync(":memory:");
    // Create chunks table that provenance references
    db.exec(`
      CREATE TABLE chunks (
        id TEXT PRIMARY KEY,
        text TEXT
      );
      INSERT INTO chunks (id, text) VALUES ('chunk1', 'test content');
      INSERT INTO chunks (id, text) VALUES ('chunk2', 'more content');
    `);
    ensureProvenanceSchema(db);
  });

  describe("ensureProvenanceSchema", () => {
    it("creates chunk_provenance table", () => {
      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_provenance'")
        .all();
      expect(tables).toHaveLength(1);
    });

    it("creates indexes", () => {
      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_provenance%'",
        )
        .all();
      expect(indexes.length).toBeGreaterThanOrEqual(2);
    });

    it("is idempotent", () => {
      // Should not throw when called multiple times
      ensureProvenanceSchema(db);
      ensureProvenanceSchema(db);

      const tables = db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='chunk_provenance'")
        .all();
      expect(tables).toHaveLength(1);
    });
  });

  describe("recordProvenance", () => {
    it("records provenance for a chunk", () => {
      const result = recordProvenance(db, "chunk1", "user_stated", "memory/test.md");

      expect(result.chunk_id).toBe("chunk1");
      expect(result.source_type).toBe("user_stated");
      expect(result.source_uri).toBe("memory/test.md");
      expect(result.verified_by_user).toBe(false);
    });

    it("uses default trust score for source type", () => {
      const result = recordProvenance(db, "chunk1", "external_doc");

      expect(result.trust_score).toBe(0.3); // External docs capped at 0.3
    });

    it("allows custom trust score", () => {
      const result = recordProvenance(db, "chunk1", "user_stated", undefined, 0.95);

      expect(result.trust_score).toBe(0.95);
    });

    it("replaces existing provenance on re-record", () => {
      recordProvenance(db, "chunk1", "user_stated", "uri1", 0.5);
      const result = recordProvenance(db, "chunk1", "external_doc", "uri2", 0.3);

      expect(result.source_type).toBe("external_doc");
      expect(result.source_uri).toBe("uri2");
    });

    it("sets created_at timestamp", () => {
      const before = Date.now();
      const result = recordProvenance(db, "chunk1", "user_stated");
      const after = Date.now();

      expect(result.created_at).toBeGreaterThanOrEqual(before);
      expect(result.created_at).toBeLessThanOrEqual(after);
    });
  });

  describe("getProvenance", () => {
    it("retrieves existing provenance", () => {
      recordProvenance(db, "chunk1", "user_stated", "memory/test.md", 0.9);

      const result = getProvenance(db, "chunk1");

      expect(result).not.toBeNull();
      expect(result?.source_type).toBe("user_stated");
      expect(result?.trust_score).toBe(0.9);
    });

    it("returns null for non-existent chunk", () => {
      const result = getProvenance(db, "nonexistent");

      expect(result).toBeNull();
    });

    it("converts verified_by_user to boolean", () => {
      recordProvenance(db, "chunk1", "user_stated");
      verifyChunk(db, "chunk1");

      const result = getProvenance(db, "chunk1");

      expect(typeof result?.verified_by_user).toBe("boolean");
      expect(result?.verified_by_user).toBe(true);
    });
  });

  describe("verifyChunk", () => {
    it("marks chunk as verified", () => {
      recordProvenance(db, "chunk1", "user_stated", undefined, 0.5);

      const success = verifyChunk(db, "chunk1");
      const result = getProvenance(db, "chunk1");

      expect(success).toBe(true);
      expect(result?.verified_by_user).toBe(true);
    });

    it("increases trust score by default boost", () => {
      recordProvenance(db, "chunk1", "user_stated", undefined, 0.5);

      verifyChunk(db, "chunk1");
      const result = getProvenance(db, "chunk1");

      expect(result?.trust_score).toBeCloseTo(0.8); // 0.5 + 0.3 default boost
    });

    it("respects custom trust boost", () => {
      recordProvenance(db, "chunk1", "user_stated", undefined, 0.5);

      verifyChunk(db, "chunk1", 0.1);
      const result = getProvenance(db, "chunk1");

      expect(result?.trust_score).toBeCloseTo(0.6); // 0.5 + 0.1
    });

    it("caps trust score at 1.0", () => {
      recordProvenance(db, "chunk1", "user_stated", undefined, 0.9);

      verifyChunk(db, "chunk1", 0.5);
      const result = getProvenance(db, "chunk1");

      expect(result?.trust_score).toBe(1.0);
    });

    it("sets verification timestamp", () => {
      recordProvenance(db, "chunk1", "user_stated");

      const before = Date.now();
      verifyChunk(db, "chunk1");
      const after = Date.now();

      const result = getProvenance(db, "chunk1");
      expect(result?.verification_timestamp).toBeGreaterThanOrEqual(before);
      expect(result?.verification_timestamp).toBeLessThanOrEqual(after);
    });

    it("returns false for non-existent chunk", () => {
      const success = verifyChunk(db, "nonexistent");

      expect(success).toBe(false);
    });
  });

  describe("getDefaultTrustScore", () => {
    it("returns 0.9 for user_stated", () => {
      expect(getDefaultTrustScore("user_stated")).toBe(0.9);
    });

    it("returns 0.5 for inferred", () => {
      expect(getDefaultTrustScore("inferred")).toBe(0.5);
    });

    it("returns 0.3 for external_doc (security cap)", () => {
      expect(getDefaultTrustScore("external_doc")).toBe(0.3);
    });

    it("returns 0.4 for tool_result", () => {
      expect(getDefaultTrustScore("tool_result")).toBe(0.4);
    });

    it("returns 0.5 for unknown source types", () => {
      // @ts-expect-error - testing unknown type
      expect(getDefaultTrustScore("unknown_type")).toBe(0.5);
    });
  });

  describe("trust hierarchy security", () => {
    it("external_doc can never exceed 0.3 by default", () => {
      const score = getDefaultTrustScore("external_doc");
      expect(score).toBeLessThanOrEqual(0.3);
    });

    it("user_stated has highest default trust", () => {
      const userScore = getDefaultTrustScore("user_stated");
      const externalScore = getDefaultTrustScore("external_doc");
      const inferredScore = getDefaultTrustScore("inferred");
      const toolScore = getDefaultTrustScore("tool_result");

      expect(userScore).toBeGreaterThan(externalScore);
      expect(userScore).toBeGreaterThan(inferredScore);
      expect(userScore).toBeGreaterThan(toolScore);
    });

    it("inferred content has moderate trust", () => {
      const score = getDefaultTrustScore("inferred");
      expect(score).toBe(0.5);
    });
  });

  describe("recordContradiction", () => {
    it("increments contradiction count", () => {
      recordProvenance(db, "chunk1", "user_stated", undefined, 0.8);

      recordContradiction(db, "chunk1");
      const result = getProvenance(db, "chunk1");

      expect(result?.contradiction_count).toBe(1);
    });

    it("applies trust penalty", () => {
      recordProvenance(db, "chunk1", "user_stated", undefined, 0.8);

      recordContradiction(db, "chunk1", 0.1);
      const result = getProvenance(db, "chunk1");

      expect(result?.trust_score).toBeCloseTo(0.7); // 0.8 - 0.1
    });

    it("accumulates multiple contradictions", () => {
      recordProvenance(db, "chunk1", "user_stated", undefined, 0.8);

      recordContradiction(db, "chunk1", 0.1);
      recordContradiction(db, "chunk1", 0.1);
      recordContradiction(db, "chunk1", 0.1);

      const result = getProvenance(db, "chunk1");
      expect(result?.contradiction_count).toBe(3);
      expect(result?.trust_score).toBeCloseTo(0.5); // 0.8 - 0.3
    });

    it("floors trust score at 0.1", () => {
      recordProvenance(db, "chunk1", "external_doc", undefined, 0.3);

      recordContradiction(db, "chunk1", 0.5);
      const result = getProvenance(db, "chunk1");

      expect(result?.trust_score).toBe(0.1);
    });

    it("returns false for non-existent chunk", () => {
      const success = recordContradiction(db, "nonexistent");
      expect(success).toBe(false);
    });
  });

  describe("getContradictionCount", () => {
    it("returns 0 for new chunks", () => {
      recordProvenance(db, "chunk1", "user_stated");
      expect(getContradictionCount(db, "chunk1")).toBe(0);
    });

    it("returns correct count after contradictions", () => {
      recordProvenance(db, "chunk1", "user_stated");
      recordContradiction(db, "chunk1");
      recordContradiction(db, "chunk1");

      expect(getContradictionCount(db, "chunk1")).toBe(2);
    });

    it("returns 0 for non-existent chunk", () => {
      expect(getContradictionCount(db, "nonexistent")).toBe(0);
    });
  });
});
