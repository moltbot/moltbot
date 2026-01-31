/**
 * Query intent classification for hybrid retrieval routing.
 * Determines the optimal retrieval strategy based on query patterns.
 */

export type QueryIntent =
  | "episodic" // "What did we discuss about X?"
  | "factual" // "What does X use/prefer?"
  | "relational" // "Who knows/works with X?"
  | "planning" // "How should we handle X given Y?"
  | "unknown";

export interface ClassificationResult {
  intent: QueryIntent;
  confidence: number;
  suggestedStrategy: RetrievalStrategy;
  extractedEntities: string[];
}

export type RetrievalStrategy = "vector_first" | "kg_first" | "hybrid" | "kg_only";

// Pattern-based intent classification rules
const INTENT_PATTERNS: Array<{
  pattern: RegExp;
  intent: QueryIntent;
  strategy: RetrievalStrategy;
}> = [
  // Episodic - past discussions, events, context
  {
    pattern: /what\s+did\s+we\s+(discuss|talk|say)/i,
    intent: "episodic",
    strategy: "vector_first",
  },
  { pattern: /when\s+did\s+(we|I|you)/i, intent: "episodic", strategy: "vector_first" },
  { pattern: /last\s+time\s+we/i, intent: "episodic", strategy: "vector_first" },
  { pattern: /remember\s+when/i, intent: "episodic", strategy: "vector_first" },
  { pattern: /in\s+our\s+(previous|last|earlier)/i, intent: "episodic", strategy: "vector_first" },

  // Factual - preferences, properties, attributes
  {
    pattern: /what\s+(does|do|is)\s+\w+\s+(use|prefer|like|want)/i,
    intent: "factual",
    strategy: "kg_first",
  },
  {
    pattern: /what\s+is\s+\w+'?s?\s+(favorite|preferred)/i,
    intent: "factual",
    strategy: "kg_first",
  },
  { pattern: /how\s+does\s+\w+\s+(work|function)/i, intent: "factual", strategy: "hybrid" },
  {
    pattern: /what\s+are\s+the\s+(features|properties|attributes)/i,
    intent: "factual",
    strategy: "kg_first",
  },

  // Relational - connections between entities
  { pattern: /who\s+(knows|works|collaborates)/i, intent: "relational", strategy: "kg_first" },
  {
    pattern: /what\s+projects?\s+(involve|include|have)/i,
    intent: "relational",
    strategy: "kg_first",
  },
  {
    pattern: /is\s+\w+\s+(related|connected|linked)\s+to/i,
    intent: "relational",
    strategy: "kg_only",
  },
  { pattern: /relationship\s+between/i, intent: "relational", strategy: "kg_only" },
  {
    pattern: /how\s+(are|is)\s+\w+\s+(and|with)\s+\w+\s+related/i,
    intent: "relational",
    strategy: "kg_only",
  },

  // Planning - combining knowledge for decisions
  {
    pattern: /how\s+should\s+(we|I)\s+(handle|approach|deal)/i,
    intent: "planning",
    strategy: "hybrid",
  },
  { pattern: /what\s+(approach|strategy)\s+should/i, intent: "planning", strategy: "hybrid" },
  { pattern: /given\s+.+,?\s+(how|what)/i, intent: "planning", strategy: "hybrid" },
  { pattern: /considering\s+.+,?\s+(should|could)/i, intent: "planning", strategy: "hybrid" },
];

/**
 * Classifies a query's intent based on pattern matching.
 * Falls back to "unknown" with vector_first strategy for unmatched queries.
 */
export function classifyQuery(query: string): ClassificationResult {
  // Normalize query
  const normalizedQuery = query.trim().toLowerCase();

  // Try pattern matching
  for (const rule of INTENT_PATTERNS) {
    if (rule.pattern.test(normalizedQuery)) {
      return {
        intent: rule.intent,
        confidence: 0.8, // Pattern matches have high confidence
        suggestedStrategy: rule.strategy,
        extractedEntities: extractPotentialEntities(query),
      };
    }
  }

  // Default to unknown/vector_first for general queries
  return {
    intent: "unknown",
    confidence: 0.3,
    suggestedStrategy: "vector_first",
    extractedEntities: extractPotentialEntities(query),
  };
}

/**
 * Extracts potential entity names from a query.
 * Simple heuristic: capitalized words that aren't common English words.
 */
function extractPotentialEntities(query: string): string[] {
  const commonWords = new Set([
    "I",
    "We",
    "You",
    "The",
    "A",
    "An",
    "What",
    "Who",
    "When",
    "Where",
    "Why",
    "How",
    "Is",
    "Are",
    "Do",
    "Does",
    "Did",
    "Can",
    "Could",
    "Should",
    "Would",
    "Will",
    "Has",
    "Have",
    "Had",
  ]);

  // Find capitalized words that aren't at sentence start or common words
  const words = query.split(/\s+/);
  const entities: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[^a-zA-Z]/g, "");
    if (word.length > 1 && word[0] === word[0].toUpperCase() && !commonWords.has(word)) {
      // Check if previous word suggests this isn't just sentence-initial cap
      if (i > 0 || words.length > 2) {
        entities.push(word);
      }
    }
  }

  return [...new Set(entities)];
}

/** Embedding provider interface for classification */
export interface EmbeddingProviderLike {
  embedQuery: (text: string) => Promise<number[]>;
}

/** Options for embedding-based classification */
export interface EmbeddingClassificationOptions {
  embeddingProvider: EmbeddingProviderLike;
  confidenceThreshold?: number;
}

// Intent prototype phrases for embedding comparison
const INTENT_PROTOTYPES: Record<QueryIntent, string[]> = {
  episodic: [
    "what did we discuss about this topic",
    "when did we talk about this",
    "remember our previous conversation",
    "in our last meeting we mentioned",
    "what did I tell you before",
  ],
  factual: [
    "what does the user prefer",
    "what technology does the project use",
    "what is the preferred programming language",
    "what are the features of this system",
    "how does this function work",
  ],
  relational: [
    "who works on this project",
    "what projects involve this person",
    "how are these two things related",
    "what is the relationship between these concepts",
    "who knows about this topic",
  ],
  planning: [
    "how should we approach this problem",
    "what strategy should we use",
    "given the constraints how do we proceed",
    "considering the requirements what should we do",
    "what is the best way to handle this",
  ],
  unknown: [],
};

// Strategy mapping for each intent
const INTENT_STRATEGIES: Record<QueryIntent, RetrievalStrategy> = {
  episodic: "vector_first",
  factual: "kg_first",
  relational: "kg_only",
  planning: "hybrid",
  unknown: "vector_first",
};

/**
 * Enhanced classification using embedding similarity.
 * Compares query embeddings against intent prototype embeddings.
 */
export async function classifyQueryWithEmbeddings(
  query: string,
  options?: EmbeddingClassificationOptions,
): Promise<ClassificationResult> {
  // Fall back to pattern-based if no embedding provider
  if (!options?.embeddingProvider) {
    return classifyQuery(query);
  }

  const { embeddingProvider, confidenceThreshold = 0.5 } = options;

  try {
    // Embed the query
    const queryEmbedding = await embeddingProvider.embedQuery(query);

    // Compare against each intent's prototypes
    const intentScores: Array<{ intent: QueryIntent; score: number }> = [];

    for (const intent of ["episodic", "factual", "relational", "planning"] as QueryIntent[]) {
      const prototypes = INTENT_PROTOTYPES[intent];
      if (prototypes.length === 0) {
        continue;
      }

      // Embed all prototypes and find best match
      const prototypeEmbeddings = await Promise.all(
        prototypes.map((p) => embeddingProvider.embedQuery(p)),
      );

      let maxSimilarity = 0;
      for (const protoEmb of prototypeEmbeddings) {
        const similarity = cosineSimilarity(queryEmbedding, protoEmb);
        maxSimilarity = Math.max(maxSimilarity, similarity);
      }

      intentScores.push({ intent, score: maxSimilarity });
    }

    // Sort by score descending
    intentScores.sort((a, b) => b.score - a.score);

    const best = intentScores[0];
    const secondBest = intentScores[1];

    // Check if the best match is confident enough
    if (best && best.score >= confidenceThreshold) {
      // Also check the margin over second best for confidence
      const margin = secondBest ? best.score - secondBest.score : best.score;
      const confidence = Math.min(0.95, best.score * (1 + margin));

      return {
        intent: best.intent,
        confidence,
        suggestedStrategy: INTENT_STRATEGIES[best.intent],
        extractedEntities: extractPotentialEntities(query),
      };
    }

    // Low confidence - fall back to pattern matching
    return classifyQuery(query);
  } catch {
    // On any error, fall back to pattern-based
    return classifyQuery(query);
  }
}

/**
 * Computes cosine similarity between two vectors.
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}
