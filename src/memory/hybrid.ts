export type HybridSource = string;

export type HybridVectorResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  vectorScore: number;
  createdAt?: number; // Unix timestamp (ms)
};

export type HybridKeywordResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  textScore: number;
  createdAt?: number; // Unix timestamp (ms)
};

/**
 * Calculate recency weight using exponential decay.
 * Recent memories get higher weights, old memories decay toward floor.
 *
 * @param createdAtMs - Unix timestamp in milliseconds
 * @param halfLifeDays - Days until weight halves (default: 30)
 * @param floor - Minimum weight for very old memories (default: 0.1)
 * @returns Weight between floor and 1.0
 */
export function calculateRecencyWeight(
  createdAtMs: number | undefined,
  halfLifeDays: number = 30,
  floor: number = 0.1
): number {
  if (!createdAtMs || createdAtMs <= 0) return 1.0; // No timestamp = full weight
  const ageMs = Date.now() - createdAtMs;
  if (ageMs <= 0) return 1.0; // Future or current = full weight
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const decay = Math.exp(-ageDays / halfLifeDays);
  return Math.max(floor, decay);
}

export function buildFtsQuery(raw: string): string | null {
  const tokens =
    raw
      .match(/[A-Za-z0-9_]+/g)
      ?.map((t) => t.trim())
      .filter(Boolean) ?? [];
  if (tokens.length === 0) return null;
  const quoted = tokens.map((t) => `"${t.replaceAll('"', "")}"`);
  return quoted.join(" AND ");
}

export function bm25RankToScore(rank: number): number {
  const normalized = Number.isFinite(rank) ? Math.max(0, rank) : 999;
  return 1 / (1 + normalized);
}

export function mergeHybridResults(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  vectorWeight: number;
  textWeight: number;
  recencyHalfLifeDays?: number; // Days until weight halves (default: 30, 0 = disabled)
  recencyFloor?: number; // Minimum weight for old memories (default: 0.1)
}): Array<{
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: HybridSource;
}> {
  const byId = new Map<
    string,
    {
      id: string;
      path: string;
      startLine: number;
      endLine: number;
      source: HybridSource;
      snippet: string;
      vectorScore: number;
      textScore: number;
      createdAt?: number;
    }
  >();

  for (const r of params.vector) {
    byId.set(r.id, {
      id: r.id,
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      source: r.source,
      snippet: r.snippet,
      vectorScore: r.vectorScore,
      textScore: 0,
      createdAt: r.createdAt,
    });
  }

  for (const r of params.keyword) {
    const existing = byId.get(r.id);
    if (existing) {
      existing.textScore = r.textScore;
      if (r.snippet && r.snippet.length > 0) existing.snippet = r.snippet;
      if (r.createdAt && !existing.createdAt) existing.createdAt = r.createdAt;
    } else {
      byId.set(r.id, {
        id: r.id,
        path: r.path,
        startLine: r.startLine,
        endLine: r.endLine,
        source: r.source,
        snippet: r.snippet,
        vectorScore: 0,
        textScore: r.textScore,
        createdAt: r.createdAt,
      });
    }
  }

  // Apply recency weighting if enabled (halfLife > 0)
  const halfLife = params.recencyHalfLifeDays ?? 0; // Default: disabled
  const floor = params.recencyFloor ?? 0.1;
  const recencyEnabled = halfLife > 0;

  const merged = Array.from(byId.values()).map((entry) => {
    const hybridScore = params.vectorWeight * entry.vectorScore + params.textWeight * entry.textScore;
    const recencyWeight = recencyEnabled
      ? calculateRecencyWeight(entry.createdAt, halfLife, floor)
      : 1.0;
    const score = hybridScore * recencyWeight;
    return {
      path: entry.path,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score,
      snippet: entry.snippet,
      source: entry.source,
    };
  });

  return merged.sort((a, b) => b.score - a.score);
}
