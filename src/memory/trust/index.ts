/**
 * Trust and provenance module for RAG/KG memory system.
 *
 * This module provides:
 * - Provenance tracking for all memory chunks (provenance.ts)
 * - Security validation and injection detection (validator.ts)
 * - Trust score calculation and re-ranking (scorer.ts)
 *
 * Security model:
 * - External documents are never trusted above 0.3 by default
 * - User verification can boost trust scores
 * - Security directives in external content trigger warnings/blocks
 */

// Provenance tracking
export {
  ensureProvenanceSchema,
  recordProvenance,
  getProvenance,
  verifyChunk,
  getDefaultTrustScore,
  recordContradiction,
  getContradictionCount,
  type ChunkProvenance,
} from "./provenance.js";

// Security validation
export {
  validateContent,
  validateTrustLevel,
  checkContradictions,
  type ValidationResult,
  type ValidationWarning,
  type ValidatorOptions,
} from "./validator.js";

// Trust scoring
export {
  calculateTrustScore,
  getEffectiveTrustScore,
  trustWeightedRerank,
  filterByTrust,
  updateTrustScore,
  type TrustFactors,
  type ScorerOptions,
  type TrustWeightedResult,
} from "./scorer.js";
