import { describe, expect, it } from "vitest";

import {
  bm25RankToScore,
  buildFtsQuery,
  computeRecencyFactor,
  computeRrfScores,
  mergeHybridResults,
} from "./hybrid.js";

describe("memory hybrid helpers", () => {
  it("buildFtsQuery tokenizes and AND-joins", () => {
    expect(buildFtsQuery("hello world")).toBe('"hello" AND "world"');
    expect(buildFtsQuery("FOO_bar baz-1")).toBe('"FOO_bar" AND "baz" AND "1"');
    expect(buildFtsQuery("   ")).toBeNull();
  });

  it("bm25RankToScore is monotonic and clamped", () => {
    expect(bm25RankToScore(0)).toBeCloseTo(1);
    expect(bm25RankToScore(1)).toBeCloseTo(0.5);
    expect(bm25RankToScore(10)).toBeLessThan(bm25RankToScore(1));
    expect(bm25RankToScore(-100)).toBeCloseTo(1);
  });

  it("mergeHybridResults unions by id and combines weighted scores", () => {
    const merged = mergeHybridResults({
      vectorWeight: 0.7,
      textWeight: 0.3,
      vector: [
        {
          id: "a",
          path: "memory/a.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "vec-a",
          vectorScore: 0.9,
        },
      ],
      keyword: [
        {
          id: "b",
          path: "memory/b.md",
          startLine: 3,
          endLine: 4,
          source: "memory",
          snippet: "kw-b",
          textScore: 1.0,
        },
      ],
    });

    expect(merged).toHaveLength(2);
    const a = merged.find((r) => r.path === "memory/a.md");
    const b = merged.find((r) => r.path === "memory/b.md");
    expect(a?.score).toBeCloseTo(0.7 * 0.9);
    expect(b?.score).toBeCloseTo(0.3 * 1.0);
  });

  it("mergeHybridResults prefers keyword snippet when ids overlap", () => {
    const merged = mergeHybridResults({
      vectorWeight: 0.5,
      textWeight: 0.5,
      vector: [
        {
          id: "a",
          path: "memory/a.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "vec-a",
          vectorScore: 0.2,
        },
      ],
      keyword: [
        {
          id: "a",
          path: "memory/a.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "kw-a",
          textScore: 1.0,
        },
      ],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.snippet).toBe("kw-a");
    expect(merged[0]?.score).toBeCloseTo(0.5 * 0.2 + 0.5 * 1.0);
  });
});

describe("computeRecencyFactor", () => {
  it("returns 1 for items at current time", () => {
    const now = Date.now();
    expect(computeRecencyFactor(now, now, 7)).toBeCloseTo(1);
  });

  it("returns ~0.5 at the half-life", () => {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
    expect(computeRecencyFactor(sevenDaysAgo, now, 7)).toBeCloseTo(0.5, 4);
  });

  it("returns ~0.25 at two half-lives", () => {
    const now = Date.now();
    const fourteenDaysAgo = now - 14 * 24 * 60 * 60 * 1000;
    expect(computeRecencyFactor(fourteenDaysAgo, now, 7)).toBeCloseTo(0.25, 4);
  });

  it("returns 1 when halfLifeDays is 0 (disabled)", () => {
    const now = Date.now();
    const old = now - 365 * 24 * 60 * 60 * 1000;
    expect(computeRecencyFactor(old, now, 0)).toBe(1);
  });

  it("clamps negative age to 0", () => {
    const now = Date.now();
    const future = now + 1000;
    expect(computeRecencyFactor(future, now, 7)).toBeCloseTo(1);
  });
});

describe("computeRrfScores", () => {
  it("computes correct RRF scores for single list", () => {
    const scores = computeRrfScores([["a", "b", "c"]], 60);
    // rank 0 → 1/(60+1), rank 1 → 1/(60+2), rank 2 → 1/(60+3)
    expect(scores.get("a")).toBeCloseTo(1 / 61);
    expect(scores.get("b")).toBeCloseTo(1 / 62);
    expect(scores.get("c")).toBeCloseTo(1 / 63);
  });

  it("sums scores across multiple lists", () => {
    const scores = computeRrfScores(
      [
        ["a", "b"],
        ["b", "a"],
      ],
      60,
    );
    // a: 1/61 + 1/62, b: 1/62 + 1/61
    expect(scores.get("a")).toBeCloseTo(1 / 61 + 1 / 62);
    expect(scores.get("b")).toBeCloseTo(1 / 62 + 1 / 61);
  });

  it("handles items appearing in only one list", () => {
    const scores = computeRrfScores(
      [
        ["a", "b"],
        ["c", "a"],
      ],
      60,
    );
    expect(scores.get("a")).toBeCloseTo(1 / 61 + 1 / 62);
    expect(scores.get("b")).toBeCloseTo(1 / 62);
    expect(scores.get("c")).toBeCloseTo(1 / 61);
  });
});

describe("mergeHybridResults with RRF strategy", () => {
  it("ranks by RRF score instead of weighted", () => {
    const merged = mergeHybridResults({
      vectorWeight: 0.7,
      textWeight: 0.3,
      mergeStrategy: "rrf",
      rrfK: 60,
      vector: [
        {
          id: "a",
          path: "memory/a.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "vec-a",
          vectorScore: 0.9,
        },
        {
          id: "b",
          path: "memory/b.md",
          startLine: 3,
          endLine: 4,
          source: "memory",
          snippet: "vec-b",
          vectorScore: 0.1,
        },
      ],
      keyword: [
        {
          id: "b",
          path: "memory/b.md",
          startLine: 3,
          endLine: 4,
          source: "memory",
          snippet: "kw-b",
          textScore: 0.9,
        },
        {
          id: "a",
          path: "memory/a.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "kw-a",
          textScore: 0.1,
        },
      ],
    });

    expect(merged).toHaveLength(2);
    // Both appear at rank 0 in one list and rank 1 in the other → equal RRF scores
    expect(merged[0]?.score).toBeCloseTo(merged[1]?.score ?? 0);
  });

  it("RRF boosts items that appear in both lists over single-list items", () => {
    const merged = mergeHybridResults({
      vectorWeight: 0.7,
      textWeight: 0.3,
      mergeStrategy: "rrf",
      rrfK: 60,
      vector: [
        {
          id: "both",
          path: "memory/both.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "both",
          vectorScore: 0.5,
        },
      ],
      keyword: [
        {
          id: "both",
          path: "memory/both.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "both",
          textScore: 0.5,
        },
        {
          id: "kw-only",
          path: "memory/kw.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "kw-only",
          textScore: 0.9,
        },
      ],
    });

    const both = merged.find((r) => r.path === "memory/both.md");
    const kwOnly = merged.find((r) => r.path === "memory/kw.md");
    // "both" gets 1/61 + 1/61, "kw-only" gets only 1/62
    expect(both!.score).toBeGreaterThan(kwOnly!.score);
  });
});

describe("mergeHybridResults with recency decay", () => {
  const DAY_MS = 24 * 60 * 60 * 1000;

  it("boosts newer results over older ones", () => {
    const now = Date.now();
    const merged = mergeHybridResults({
      vectorWeight: 1,
      textWeight: 0,
      recencyDecay: { enabled: true, halfLifeDays: 7 },
      now,
      vector: [
        {
          id: "old",
          path: "memory/old.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "old",
          vectorScore: 0.8,
          updatedAt: now - 30 * DAY_MS,
        },
        {
          id: "new",
          path: "memory/new.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "new",
          vectorScore: 0.7,
          updatedAt: now - 1 * DAY_MS,
        },
      ],
      keyword: [],
    });

    // "new" should rank higher despite lower vectorScore due to recency
    expect(merged[0]?.path).toBe("memory/new.md");
    expect(merged[1]?.path).toBe("memory/old.md");
  });

  it("does not affect scoring when disabled", () => {
    const now = Date.now();
    const merged = mergeHybridResults({
      vectorWeight: 1,
      textWeight: 0,
      recencyDecay: { enabled: false, halfLifeDays: 7 },
      now,
      vector: [
        {
          id: "old",
          path: "memory/old.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "old",
          vectorScore: 0.8,
          updatedAt: now - 30 * DAY_MS,
        },
        {
          id: "new",
          path: "memory/new.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "new",
          vectorScore: 0.7,
          updatedAt: now - 1 * DAY_MS,
        },
      ],
      keyword: [],
    });

    // Without decay, higher vectorScore wins
    expect(merged[0]?.path).toBe("memory/old.md");
    expect(merged[0]?.score).toBeCloseTo(0.8);
  });

  it("works with RRF strategy and recency decay combined", () => {
    const now = Date.now();
    const merged = mergeHybridResults({
      vectorWeight: 0.7,
      textWeight: 0.3,
      mergeStrategy: "rrf",
      rrfK: 60,
      recencyDecay: { enabled: true, halfLifeDays: 7 },
      now,
      vector: [
        {
          id: "a",
          path: "memory/a.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "a",
          vectorScore: 0.9,
          updatedAt: now - 30 * DAY_MS,
        },
        {
          id: "b",
          path: "memory/b.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "b",
          vectorScore: 0.5,
          updatedAt: now,
        },
      ],
      keyword: [],
    });

    // b is much newer so recency decay should push it higher despite lower RRF base
    const a = merged.find((r) => r.path === "memory/a.md");
    const b = merged.find((r) => r.path === "memory/b.md");
    expect(b!.score).toBeGreaterThan(a!.score);
  });
});

describe("backward compatibility", () => {
  it("default params produce same behavior as original weighted merge", () => {
    const merged = mergeHybridResults({
      vectorWeight: 0.7,
      textWeight: 0.3,
      // No mergeStrategy, rrfK, or recencyDecay — all defaults
      vector: [
        {
          id: "a",
          path: "memory/a.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "vec-a",
          vectorScore: 0.9,
        },
      ],
      keyword: [
        {
          id: "a",
          path: "memory/a.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "kw-a",
          textScore: 0.8,
        },
      ],
    });

    expect(merged).toHaveLength(1);
    expect(merged[0]?.score).toBeCloseTo(0.7 * 0.9 + 0.3 * 0.8);
  });
});
