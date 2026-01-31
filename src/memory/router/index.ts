/**
 * Intent-based query routing module for RAG/KG memory system.
 *
 * This module provides:
 * - Query intent classification (classifier.ts)
 * - Retrieval strategy selection and execution (strategy.ts)
 *
 * Routing rules:
 * - Episodic queries ("what did we discuss") → Vector first
 * - Factual queries ("what does X prefer") → KG first
 * - Relational queries ("who works with X") → KG only
 * - Planning queries ("how should we handle") → Hybrid
 */

// Intent classification
export {
  classifyQuery,
  classifyQueryWithEmbeddings,
  type QueryIntent,
  type ClassificationResult,
  type RetrievalStrategy,
  type EmbeddingProviderLike,
  type EmbeddingClassificationOptions,
} from "./classifier.js";

// Strategy selection and execution
export {
  selectStrategy,
  executeStrategy,
  expandQueryWithAliases,
  mergeStrategyResults,
  buildKGContext,
  type StrategyOptions,
  type SearchResult,
  type StrategyResult,
  type KGContext,
} from "./strategy.js";
