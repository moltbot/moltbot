import { describe, expect, it } from "vitest";

import { bm25RankToScore, buildFtsQuery, calculateRecencyWeight, mergeHybridResults } from "./hybrid.js";

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

describe("calculateRecencyWeight", () => {
  it("returns 1.0 for brand new memory", () => {
    expect(calculateRecencyWeight(Date.now())).toBeCloseTo(1.0);
  });

  it("returns ~0.5 at half-life", () => {
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    expect(calculateRecencyWeight(thirtyDaysAgo, 30)).toBeCloseTo(0.5, 1);
  });

  it("respects floor for very old memories", () => {
    const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    expect(calculateRecencyWeight(yearAgo, 30, 0.1)).toBe(0.1);
  });

  it("returns 1.0 when no timestamp provided", () => {
    expect(calculateRecencyWeight(undefined)).toBe(1.0);
    expect(calculateRecencyWeight(0)).toBe(1.0);
  });

  it("returns 1.0 for future timestamps", () => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000;
    expect(calculateRecencyWeight(tomorrow)).toBe(1.0);
  });

  it("uses custom floor", () => {
    const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    expect(calculateRecencyWeight(yearAgo, 30, 0.2)).toBe(0.2);
    expect(calculateRecencyWeight(yearAgo, 30, 0.05)).toBe(0.05);
  });
});

describe("mergeHybridResults with recency", () => {
  it("applies recency weight when enabled", () => {
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    const merged = mergeHybridResults({
      vectorWeight: 1.0,
      textWeight: 0,
      recencyHalfLifeDays: 30,
      recencyFloor: 0.1,
      vector: [
        {
          id: "recent",
          path: "memory/recent.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "recent",
          vectorScore: 0.8,
          createdAt: now,
        },
        {
          id: "old",
          path: "memory/old.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "old",
          vectorScore: 0.8,
          createdAt: thirtyDaysAgo,
        },
      ],
      keyword: [],
    });

    expect(merged).toHaveLength(2);
    // Recent should rank higher due to recency weight
    expect(merged[0]?.path).toBe("memory/recent.md");
    expect(merged[0]?.score).toBeGreaterThan(merged[1]?.score ?? 0);
    // Old memory score should be ~0.5x the recent one (at half-life)
    expect(merged[1]?.score).toBeCloseTo(merged[0]!.score * 0.5, 1);
  });

  it("does not apply recency weight when halfLife is 0", () => {
    const now = Date.now();
    const yearAgo = now - 365 * 24 * 60 * 60 * 1000;

    const merged = mergeHybridResults({
      vectorWeight: 1.0,
      textWeight: 0,
      recencyHalfLifeDays: 0, // Disabled
      vector: [
        {
          id: "recent",
          path: "memory/recent.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "recent",
          vectorScore: 0.8,
          createdAt: now,
        },
        {
          id: "old",
          path: "memory/old.md",
          startLine: 1,
          endLine: 2,
          source: "memory",
          snippet: "old",
          vectorScore: 0.8,
          createdAt: yearAgo,
        },
      ],
      keyword: [],
    });

    // Both should have equal scores when recency is disabled
    expect(merged[0]?.score).toBeCloseTo(merged[1]?.score ?? 0);
  });
});
