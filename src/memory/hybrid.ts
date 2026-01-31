export type HybridSource = string;

export type HybridVectorResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  vectorScore: number;
  updatedAt?: number;
};

export type HybridKeywordResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  textScore: number;
  updatedAt?: number;
};

export type MergeStrategy = "weighted" | "rrf";

export type RecencyDecayConfig = {
  enabled: boolean;
  halfLifeDays: number;
};

export function buildFtsQuery(raw: string): string | null {
  const tokens =
    raw
      .match(/[A-Za-z0-9_]+/g)
      ?.map((t) => t.trim())
      .filter(Boolean) ?? [];
  if (tokens.length === 0) {
    return null;
  }
  const quoted = tokens.map((t) => `"${t.replaceAll('"', "")}"`);
  return quoted.join(" AND ");
}

export function bm25RankToScore(rank: number): number {
  const normalized = Number.isFinite(rank) ? Math.max(0, rank) : 999;
  return 1 / (1 + normalized);
}

/**
 * Compute a recency decay factor using exponential half-life decay.
 * Returns a value in (0, 1] where 1 means "just now" and decays toward 0.
 */
export function computeRecencyFactor(updatedAt: number, now: number, halfLifeDays: number): number {
  if (
    !Number.isFinite(updatedAt) ||
    !Number.isFinite(now) ||
    !Number.isFinite(halfLifeDays) ||
    halfLifeDays <= 0
  ) {
    return 1;
  }
  const ageDays = Math.max(0, (now - updatedAt) / (1000 * 60 * 60 * 24));
  const lambda = Math.LN2 / halfLifeDays;
  return Math.exp(-lambda * ageDays);
}

/**
 * Compute RRF (Reciprocal Rank Fusion) scores for a set of results across
 * multiple ranked lists. Each result gets: sum(1 / (k + rank_i)) across lists.
 */
export function computeRrfScores(rankedLists: Array<string[]>, k: number): Map<string, number> {
  const scores = new Map<string, number>();
  const safeK = Number.isFinite(k) && k > 0 ? k : 1;
  for (const list of rankedLists) {
    for (let rank = 0; rank < list.length; rank++) {
      const id = list[rank];
      const current = scores.get(id) ?? 0;
      scores.set(id, current + 1 / (safeK + rank + 1)); // rank is 0-indexed, RRF uses 1-indexed
    }
  }
  return scores;
}

export function mergeHybridResults(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  vectorWeight: number;
  textWeight: number;
  mergeStrategy?: MergeStrategy;
  rrfK?: number;
  recencyDecay?: RecencyDecayConfig;
  now?: number;
}): Array<{
  path: string;
  startLine: number;
  endLine: number;
  score: number;
  snippet: string;
  source: HybridSource;
}> {
  const strategy = params.mergeStrategy ?? "weighted";

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
      updatedAt?: number;
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
      updatedAt: r.updatedAt,
    });
  }

  for (const r of params.keyword) {
    const existing = byId.get(r.id);
    if (existing) {
      existing.textScore = r.textScore;
      if (r.snippet && r.snippet.length > 0) {
        existing.snippet = r.snippet;
      }
      // Keep the most recent updatedAt
      if (r.updatedAt != null) {
        existing.updatedAt =
          existing.updatedAt != null ? Math.max(existing.updatedAt, r.updatedAt) : r.updatedAt;
      }
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
        updatedAt: r.updatedAt,
      });
    }
  }

  let merged: Array<{
    path: string;
    startLine: number;
    endLine: number;
    score: number;
    snippet: string;
    source: HybridSource;
    updatedAt?: number;
  }>;

  if (strategy === "rrf") {
    const rawK = params.rrfK ?? 60;
    const k = Number.isFinite(rawK) && rawK > 0 ? rawK : 60;
    // Build ranked lists sorted by their respective scores (descending)
    const vectorRanked = params.vector
      .toSorted((a, b) => b.vectorScore - a.vectorScore)
      .map((r) => r.id);
    const keywordRanked = params.keyword
      .toSorted((a, b) => b.textScore - a.textScore)
      .map((r) => r.id);
    const rrfScores = computeRrfScores([vectorRanked, keywordRanked], k);
    const listsUsed = (vectorRanked.length > 0 ? 1 : 0) + (keywordRanked.length > 0 ? 1 : 0);
    const normalization = listsUsed > 0 ? (k + 1) / listsUsed : 1;

    merged = Array.from(byId.values()).map((entry) => ({
      path: entry.path,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score: (rrfScores.get(entry.id) ?? 0) * normalization,
      snippet: entry.snippet,
      source: entry.source,
      updatedAt: entry.updatedAt,
    }));
  } else {
    // Default: weighted merge
    merged = Array.from(byId.values()).map((entry) => ({
      path: entry.path,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score: params.vectorWeight * entry.vectorScore + params.textWeight * entry.textScore,
      snippet: entry.snippet,
      source: entry.source,
      updatedAt: entry.updatedAt,
    }));
  }

  // Apply recency decay if enabled
  const decay = params.recencyDecay;
  if (decay?.enabled && decay.halfLifeDays > 0) {
    const now = params.now ?? Date.now();
    for (const entry of merged) {
      if (entry.updatedAt != null) {
        const factor = computeRecencyFactor(entry.updatedAt, now, decay.halfLifeDays);
        entry.score *= factor;
      }
    }
  }

  return merged.toSorted((a, b) => b.score - a.score).map(({ updatedAt: _, ...rest }) => rest);
}
