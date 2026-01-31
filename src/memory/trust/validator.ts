import type { DatabaseSync } from "node:sqlite";
import type { SourceType } from "../kg/schema.js";
import { getProvenance } from "./provenance.js";

/**
 * Security rule enforcement for memory content.
 * Validates that content doesn't violate trust boundaries.
 *
 * Features:
 * - Security directive detection (prompt injection patterns)
 * - Content classification for sensitive patterns
 * - Trust level validation
 * - Contradiction detection against high-trust memories
 */

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
  blocked: boolean;
  blockReason?: string;
}

export interface ValidationWarning {
  type: "security_directive" | "trust_mismatch" | "unverified_claim" | "potential_injection";
  message: string;
  severity: "low" | "medium" | "high";
  chunkId?: string;
}

export interface ValidatorOptions {
  db: DatabaseSync;
  strictMode?: boolean; // Block vs warn on security issues
}

// Patterns that indicate potential security directives or injection attempts
const SECURITY_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|directives|rules)/i,
  /disregard\s+(your|all|the)\s+(instructions|directives|rules)/i,
  /you\s+(must|should|will)\s+(always|never)\s+(say|do|respond|answer)/i,
  /override\s+(system|security|safety)\s+(settings|rules|directives)/i,
  /new\s+(system|admin|root)\s+(prompt|instruction|directive)/i,
  /\[SYSTEM\]/i,
  /\[ADMIN\]/i,
  /<system>/i,
  /```system/i,
];

// Patterns for potentially sensitive content
const SENSITIVE_PATTERNS = [
  /password\s*[:=]/i,
  /api[_-]?key\s*[:=]/i,
  /secret\s*[:=]/i,
  /token\s*[:=]/i,
  /credentials?\s*[:=]/i,
];

/**
 * Validates content before it's stored in memory.
 * Checks for security directives and injection attempts.
 */
export function validateContent(
  content: string,
  sourceType: SourceType,
  options: ValidatorOptions,
): ValidationResult {
  const { strictMode = false } = options;
  const warnings: ValidationWarning[] = [];
  let blocked = false;
  let blockReason: string | undefined;

  // External documents get extra scrutiny
  const isExternal = sourceType === "external_doc" || sourceType === "tool_result";

  // Check for security directive patterns
  for (const pattern of SECURITY_PATTERNS) {
    if (pattern.test(content)) {
      const warning: ValidationWarning = {
        type: "security_directive",
        message: `Potential security directive detected: ${pattern.source}`,
        severity: isExternal ? "high" : "medium",
      };
      warnings.push(warning);

      if (isExternal && strictMode) {
        blocked = true;
        blockReason = "External content contains potential security directive";
      }
    }
  }

  // Check for potential injection patterns
  if (content.includes("{{") || content.includes("${") || content.includes("<%")) {
    warnings.push({
      type: "potential_injection",
      message: "Content contains template syntax that could be injection",
      severity: isExternal ? "medium" : "low",
    });
  }

  // Check for sensitive patterns (warn but don't block)
  for (const pattern of SENSITIVE_PATTERNS) {
    if (pattern.test(content)) {
      warnings.push({
        type: "unverified_claim",
        message: `Content may contain sensitive information: ${pattern.source}`,
        severity: "medium",
      });
    }
  }

  return {
    valid: !blocked,
    warnings,
    blocked,
    blockReason,
  };
}

/**
 * Validates that a chunk meets minimum trust requirements for an operation.
 */
export function validateTrustLevel(
  db: DatabaseSync,
  chunkId: string,
  requiredTrust: number,
): ValidationResult {
  const provenance = getProvenance(db, chunkId);
  const warnings: ValidationWarning[] = [];

  if (!provenance) {
    return {
      valid: false,
      warnings: [
        {
          type: "trust_mismatch",
          message: "Chunk has no provenance record",
          severity: "high",
          chunkId,
        },
      ],
      blocked: true,
      blockReason: "No provenance record for chunk",
    };
  }

  if (provenance.trust_score < requiredTrust) {
    warnings.push({
      type: "trust_mismatch",
      message: `Chunk trust score ${provenance.trust_score} below required ${requiredTrust}`,
      severity: "medium",
      chunkId,
    });

    return {
      valid: false,
      warnings,
      blocked: false,
    };
  }

  return {
    valid: true,
    warnings,
    blocked: false,
  };
}

/**
 * Checks if content appears to contradict existing high-trust memories.
 * Returns warnings if contradictions are detected.
 *
 * Uses pattern-based detection for common contradictions:
 * - Negation patterns ("X does not use Y" vs "X uses Y")
 * - Preference conflicts ("X prefers Y" vs "X prefers Z")
 * - Factual conflicts (different values for same attribute)
 */
export function checkContradictions(
  db: DatabaseSync,
  content: string,
  options: ValidatorOptions,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = [];
  const minTrustThreshold = 0.7; // Only compare against high-trust content

  // Extract potential claims from content
  const claims = extractClaims(content);
  if (claims.length === 0) {
    return warnings;
  }

  // Find related high-trust chunks
  const relatedChunks = findRelatedHighTrustChunks(db, claims, minTrustThreshold);

  // Check for contradictions
  for (const claim of claims) {
    for (const chunk of relatedChunks) {
      const contradiction = detectContradiction(claim, chunk.text);
      if (contradiction) {
        warnings.push({
          type: "trust_mismatch",
          message: `Potential contradiction with high-trust memory: "${contradiction.reason}"`,
          severity: options.strictMode ? "high" : "medium",
          chunkId: chunk.id,
        });
      }
    }
  }

  return warnings;
}

interface Claim {
  subject: string;
  predicate: string;
  object: string;
  negated: boolean;
  raw: string;
}

interface ChunkWithText {
  id: string;
  text: string;
  trust_score: number;
}

/**
 * Extracts simple subject-predicate-object claims from text.
 */
function extractClaims(content: string): Claim[] {
  const claims: Claim[] = [];

  // Pattern: "X uses/prefers/works_on/knows Y"
  const claimPatterns = [
    {
      pattern:
        /(\w+(?:\s+\w+)?)\s+(does\s+not\s+|doesn't\s+)?(use|prefer|know|work\s+on|own|like)\s+(\w+(?:\s+\w+)?)/gi,
      negatedGroup: 2,
    },
    { pattern: /(\w+(?:\s+\w+)?)\s+(is\s+not\s+|isn't\s+)?(a|an|the)?\s*(\w+)/gi, negatedGroup: 2 },
  ];

  for (const { pattern, negatedGroup } of claimPatterns) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(pattern.source, pattern.flags);

    while ((match = regex.exec(content)) !== null) {
      const subject = match[1]?.trim();
      const negation = match[negatedGroup];
      const predicate = match[3]?.trim().toLowerCase().replace(/\s+/g, "_");
      const object = match[4]?.trim();

      if (subject && predicate && object && subject.length > 1 && object.length > 1) {
        claims.push({
          subject,
          predicate,
          object,
          negated: !!negation,
          raw: match[0],
        });
      }
    }
  }

  return claims;
}

/**
 * Finds high-trust chunks that mention similar entities.
 */
function findRelatedHighTrustChunks(
  db: DatabaseSync,
  claims: Claim[],
  minTrust: number,
): ChunkWithText[] {
  // Collect unique subjects and objects from claims
  const entities = new Set<string>();
  for (const claim of claims) {
    entities.add(claim.subject.toLowerCase());
    entities.add(claim.object.toLowerCase());
  }

  if (entities.size === 0) {
    return [];
  }

  // Search for chunks that mention these entities and have high trust
  // Use entity_mentions table to find relevant chunks
  const entityList = Array.from(entities);
  const placeholders = entityList.map(() => "?").join(",");

  try {
    const rows = db
      .prepare(
        `SELECT DISTINCT c.id, c.text, cp.trust_score
         FROM chunks c
         JOIN entity_mentions em ON c.id = em.chunk_id
         JOIN entities e ON em.entity_id = e.id
         JOIN chunk_provenance cp ON c.id = cp.chunk_id
         WHERE LOWER(e.name) IN (${placeholders})
           AND cp.trust_score >= ?
         LIMIT 20`,
      )
      .all(...entityList, minTrust) as unknown as ChunkWithText[];

    return rows;
  } catch {
    // Tables might not exist yet, return empty
    return [];
  }
}

interface ContradictionResult {
  reason: string;
  claim1: string;
  claim2: string;
}

/**
 * Detects if a claim contradicts content in an existing chunk.
 */
function detectContradiction(claim: Claim, existingText: string): ContradictionResult | null {
  const lowerText = existingText.toLowerCase();
  const subject = claim.subject.toLowerCase();
  const object = claim.object.toLowerCase();

  // Check for direct negation contradiction
  // e.g., "X uses Y" (new) vs "X does not use Y" (existing) or vice versa
  const negationPatterns = [
    new RegExp(
      `${escapeRegex(subject)}\\s+(does\\s+not|doesn't)\\s+${escapeRegex(claim.predicate.replace("_", "\\s*"))}\\s+${escapeRegex(object)}`,
      "i",
    ),
    new RegExp(
      `${escapeRegex(subject)}\\s+${escapeRegex(claim.predicate.replace("_", "\\s*"))}\\s+${escapeRegex(object)}`,
      "i",
    ),
  ];

  const hasNegatedForm = negationPatterns[0].test(lowerText);
  const hasPositiveForm = negationPatterns[1].test(lowerText) && !hasNegatedForm;

  // Contradiction: new claim is positive but existing is negated, or vice versa
  if (claim.negated && hasPositiveForm) {
    return {
      reason: `New content says "${claim.subject} does not ${claim.predicate} ${claim.object}" but existing memory says it does`,
      claim1: claim.raw,
      claim2: `${claim.subject} ${claim.predicate} ${claim.object}`,
    };
  }

  if (!claim.negated && hasNegatedForm) {
    return {
      reason: `New content says "${claim.subject} ${claim.predicate} ${claim.object}" but existing memory says it doesn't`,
      claim1: claim.raw,
      claim2: `${claim.subject} does not ${claim.predicate} ${claim.object}`,
    };
  }

  // Check for preference/attribute conflicts
  // e.g., "X prefers Y" vs "X prefers Z" (where Y != Z)
  if (["prefer", "use", "like"].includes(claim.predicate)) {
    const conflictPattern = new RegExp(
      `${escapeRegex(subject)}\\s+${escapeRegex(claim.predicate)}s?\\s+(\\w+(?:\\s+\\w+)?)`,
      "gi",
    );

    let match: RegExpExecArray | null;
    while ((match = conflictPattern.exec(existingText)) !== null) {
      const existingObject = match[1]?.toLowerCase();
      if (existingObject && existingObject !== object && existingObject.length > 2) {
        return {
          reason: `New content says "${claim.subject} ${claim.predicate}s ${claim.object}" but existing memory says "${claim.subject} ${claim.predicate}s ${existingObject}"`,
          claim1: claim.raw,
          claim2: `${claim.subject} ${claim.predicate}s ${existingObject}`,
        };
      }
    }
  }

  return null;
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
