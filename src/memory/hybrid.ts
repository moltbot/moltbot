import type { DatabaseSync } from "node:sqlite";
import { trustWeightedRerank } from "./trust/index.js";

export type HybridSource = string;

export type HybridVectorResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  vectorScore: number;
};

export type HybridKeywordResult = {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  source: HybridSource;
  snippet: string;
  textScore: number;
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

/** Options for trust-weighted reranking in hybrid search */
export interface TrustRerankOptions {
  /** Database handle for provenance lookups */
  db: DatabaseSync;
  /** Enable trust-weighted reranking (default: false) */
  enabled?: boolean;
  /** Weight for trust score in final ranking (0-1, default: 0.3) */
  trustWeight?: number;
}

/** Result type for merged hybrid search results */
export type HybridMergedResult = {
  /** Chunk ID for provenance lookups */
  chunkId: string;
  path: string;
  startLine: number;
  endLine: number;
  /** Combined relevance score (vector + text weighted) */
  score: number;
  snippet: string;
  source: HybridSource;
  /** Trust score from provenance (only present if trust reranking enabled) */
  trustScore?: number;
};

export function mergeHybridResults(params: {
  vector: HybridVectorResult[];
  keyword: HybridKeywordResult[];
  vectorWeight: number;
  textWeight: number;
  /** Optional trust reranking configuration */
  trust?: TrustRerankOptions;
}): HybridMergedResult[] {
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
    });
  }

  for (const r of params.keyword) {
    const existing = byId.get(r.id);
    if (existing) {
      existing.textScore = r.textScore;
      if (r.snippet && r.snippet.length > 0) {
        existing.snippet = r.snippet;
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
      });
    }
  }

  const merged = Array.from(byId.values()).map((entry) => {
    const score = params.vectorWeight * entry.vectorScore + params.textWeight * entry.textScore;
    return {
      chunkId: entry.id,
      path: entry.path,
      startLine: entry.startLine,
      endLine: entry.endLine,
      score,
      snippet: entry.snippet,
      source: entry.source,
    };
  });

  // Sort by relevance score
  const sorted = merged.toSorted((a, b) => b.score - a.score);

  // Apply trust-weighted reranking if enabled
  if (params.trust?.enabled && params.trust.db) {
    const reranked = trustWeightedRerank(sorted, {
      db: params.trust.db,
      trustWeight: params.trust.trustWeight,
    });
    // Return with trust scores attached
    return reranked.map((r) => ({
      chunkId: r.chunkId,
      path: r.path,
      startLine: r.startLine,
      endLine: r.endLine,
      score: r.combinedScore,
      snippet: r.snippet,
      source: r.source,
      trustScore: r.trustScore,
    }));
  }

  return sorted;
}
