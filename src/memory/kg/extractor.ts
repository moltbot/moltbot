import type { DatabaseSync } from "node:sqlite";
import type { Entity, EntityType, Relation, RelationType, SourceType } from "./schema.js";
import { generateId } from "./schema.js";
import { recordProvenance, getDefaultTrustScore } from "../trust/provenance.js";

/**
 * Entity and relation extraction from text chunks.
 *
 * Implements a hybrid approach:
 * 1. Pattern-based extraction (fast, works offline)
 * 2. LLM-based extraction (higher quality, optional)
 *
 * Pattern-based extraction serves as the default and fallback.
 * LLM extraction can be enabled when API access is available.
 */

export interface ExtractionResult {
  entities: ExtractedEntity[];
  relations: ExtractedRelation[];
}

export interface ExtractedEntity {
  name: string;
  type: EntityType;
  mentionText: string;
  startOffset?: number;
  endOffset?: number;
  confidence: number;
}

export interface ExtractedRelation {
  sourceEntityName: string;
  targetEntityName: string;
  relationType: RelationType;
  confidence: number;
}

export interface ExtractorOptions {
  db: DatabaseSync;
  sourceType: SourceType;
  trustScore?: number;
  /** Enable LLM-based extraction (requires API key) */
  useLlm?: boolean;
  /** OpenAI API key for LLM extraction */
  openaiApiKey?: string;
  /** OpenAI base URL (defaults to https://api.openai.com/v1) */
  openaiBaseUrl?: string;
  /** Model to use for extraction (defaults to gpt-4o-mini) */
  extractionModel?: string;
}

// Common words to exclude from entity extraction
const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "in",
  "on",
  "at",
  "to",
  "for",
  "of",
  "with",
  "by",
  "from",
  "as",
  "is",
  "was",
  "are",
  "were",
  "been",
  "be",
  "have",
  "has",
  "had",
  "do",
  "does",
  "did",
  "will",
  "would",
  "could",
  "should",
  "may",
  "might",
  "must",
  "shall",
  "can",
  "need",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "he",
  "she",
  "it",
  "we",
  "they",
  "what",
  "which",
  "who",
  "whom",
  "when",
  "where",
  "why",
  "how",
  "all",
  "each",
  "every",
  "both",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "not",
  "only",
  "same",
  "so",
  "than",
  "too",
  "very",
  "just",
  "also",
  "now",
  "here",
  "there",
  "then",
  "if",
  "else",
  "etc",
  "true",
  "false",
  "null",
  "undefined",
  "new",
  "old",
  "first",
  "last",
  "next",
  "previous",
]);

// Technology keywords that indicate a technology entity
const TECH_KEYWORDS = new Set([
  "typescript",
  "javascript",
  "python",
  "rust",
  "go",
  "java",
  "kotlin",
  "swift",
  "ruby",
  "php",
  "sql",
  "html",
  "css",
  "react",
  "vue",
  "angular",
  "svelte",
  "node",
  "nodejs",
  "deno",
  "bun",
  "npm",
  "pnpm",
  "yarn",
  "webpack",
  "vite",
  "esbuild",
  "rollup",
  "docker",
  "kubernetes",
  "k8s",
  "aws",
  "azure",
  "gcp",
  "redis",
  "mongodb",
  "postgres",
  "postgresql",
  "mysql",
  "sqlite",
  "graphql",
  "rest",
  "api",
  "git",
  "github",
  "gitlab",
  "linux",
  "macos",
  "windows",
  "openai",
  "anthropic",
  "claude",
  "gpt",
  "llm",
  "ai",
  "ml",
  "tensorflow",
  "pytorch",
  "langchain",
  "vitest",
  "jest",
  "mocha",
  "cypress",
  "playwright",
]);

/**
 * Extracts entities and relations from a text chunk.
 * Uses pattern-based extraction by default, with optional LLM enhancement.
 */
export async function extractFromChunk(
  chunkId: string,
  text: string,
  options: ExtractorOptions,
): Promise<ExtractionResult> {
  // Skip very short text
  if (!text || text.length < 10) {
    return { entities: [], relations: [] };
  }

  // Try LLM extraction if enabled and API key provided
  if (options.useLlm && options.openaiApiKey) {
    try {
      const llmResult = await extractWithLlm(text, options);
      if (llmResult.entities.length > 0 || llmResult.relations.length > 0) {
        return llmResult;
      }
    } catch (err) {
      // Fall back to pattern-based extraction on LLM failure
      console.warn(`LLM extraction failed for chunk ${chunkId}, using pattern-based:`, err);
    }
  }

  // Default to pattern-based extraction
  return extractWithPatterns(text);
}

/**
 * Pattern-based entity and relation extraction.
 * Works without external API calls, suitable for offline use.
 */
export function extractWithPatterns(text: string): ExtractionResult {
  const entities: ExtractedEntity[] = [];
  const relations: ExtractedRelation[] = [];
  const seenEntities = new Set<string>();

  // Helper to add entity if not duplicate
  const addEntity = (entity: ExtractedEntity) => {
    const key = `${entity.type}:${entity.name.toLowerCase()}`;
    if (!seenEntities.has(key) && !STOP_WORDS.has(entity.name.toLowerCase())) {
      seenEntities.add(key);
      entities.push(entity);
    }
  };

  // 1. Extract capitalized proper nouns (potential person/organization names)
  // Matches sequences like "John Smith" or "Acme Corp"
  const properNounPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  let match: RegExpExecArray | null;

  while ((match = properNounPattern.exec(text)) !== null) {
    const name = match[1];
    // Skip single short words or common words
    if (name.length < 3 || STOP_WORDS.has(name.toLowerCase())) {
      continue;
    }

    // Determine type based on context
    const type = inferEntityType(name, text, match.index);
    addEntity({
      name,
      type,
      mentionText: match[0],
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      confidence: 0.6,
    });
  }

  // 2. Extract technology keywords
  const techPattern = new RegExp(`\\b(${Array.from(TECH_KEYWORDS).join("|")})\\b`, "gi");
  while ((match = techPattern.exec(text)) !== null) {
    addEntity({
      name: match[1],
      type: "technology",
      mentionText: match[0],
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      confidence: 0.8,
    });
  }

  // 3. Extract quoted strings (potential project names, concepts)
  const quotedPattern = /["']([^"']{2,50})["']/g;
  while ((match = quotedPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length >= 2 && !STOP_WORDS.has(name.toLowerCase())) {
      addEntity({
        name,
        type: "concept",
        mentionText: match[0],
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        confidence: 0.5,
      });
    }
  }

  // 4. Extract code identifiers (CamelCase, snake_case, kebab-case)
  // CamelCase: extractFromChunk, MemoryManager
  const camelCasePattern = /\b([A-Z][a-z]+(?:[A-Z][a-z]+)+)\b/g;
  while ((match = camelCasePattern.exec(text)) !== null) {
    addEntity({
      name: match[1],
      type: "concept",
      mentionText: match[0],
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      confidence: 0.5,
    });
  }

  // snake_case: extract_from_chunk, memory_manager
  const snakeCasePattern = /\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b/g;
  while ((match = snakeCasePattern.exec(text)) !== null) {
    addEntity({
      name: match[1],
      type: "concept",
      mentionText: match[0],
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      confidence: 0.5,
    });
  }

  // 5. Extract file paths
  const filePathPattern =
    /(?:^|[\s,])((?:\.\/|\.\.\/|\/)?[\w\-./]+\.(?:ts|js|json|md|py|rs|go|java|sql|yml|yaml|toml))\b/g;
  while ((match = filePathPattern.exec(text)) !== null) {
    addEntity({
      name: match[1],
      type: "file",
      mentionText: match[1],
      startOffset: match.index,
      endOffset: match.index + match[0].length,
      confidence: 0.7,
    });
  }

  // 6. Extract relations from common patterns
  extractRelationPatterns(text, entities, relations);

  return { entities, relations };
}

/**
 * Infers entity type based on context clues in the surrounding text.
 */
function inferEntityType(name: string, text: string, offset: number): EntityType {
  // Get surrounding context (100 chars before and after)
  const start = Math.max(0, offset - 100);
  const end = Math.min(text.length, offset + name.length + 100);
  const context = text.slice(start, end).toLowerCase();

  // Check for person indicators
  if (
    /\b(said|says|wrote|writes|created|author|developer|engineer|manager|lead|director|ceo|cto)\b/.test(
      context,
    )
  ) {
    return "person";
  }

  // Check for organization indicators
  if (/\b(company|corp|inc|llc|ltd|organization|team|group|department)\b/.test(context)) {
    return "organization";
  }

  // Check for project indicators
  if (/\b(project|repo|repository|package|library|framework|app|application)\b/.test(context)) {
    return "project";
  }

  // Check for location indicators
  if (/\b(city|country|state|region|located|based in|headquarters)\b/.test(context)) {
    return "location";
  }

  // Check for technology indicators
  if (TECH_KEYWORDS.has(name.toLowerCase())) {
    return "technology";
  }

  // Default to concept for unclassified entities
  return "concept";
}

/**
 * Extracts relations from common linguistic patterns.
 */
function extractRelationPatterns(
  text: string,
  entities: ExtractedEntity[],
  relations: ExtractedRelation[],
): void {
  const entityNames = new Map<string, ExtractedEntity>();
  for (const entity of entities) {
    entityNames.set(entity.name.toLowerCase(), entity);
  }

  // Relation patterns: "X uses Y", "X works on Y", "X created Y", etc.
  const relationPatterns: Array<{
    pattern: RegExp;
    relationType: RelationType;
    confidence: number;
  }> = [
    {
      pattern: /\b(\w+(?:\s+\w+)?)\s+uses\s+(\w+(?:\s+\w+)?)\b/gi,
      relationType: "uses",
      confidence: 0.7,
    },
    {
      pattern: /\b(\w+(?:\s+\w+)?)\s+works\s+on\s+(\w+(?:\s+\w+)?)\b/gi,
      relationType: "works_on",
      confidence: 0.7,
    },
    {
      pattern: /\b(\w+(?:\s+\w+)?)\s+created\s+(\w+(?:\s+\w+)?)\b/gi,
      relationType: "created",
      confidence: 0.7,
    },
    {
      pattern: /\b(\w+(?:\s+\w+)?)\s+owns\s+(\w+(?:\s+\w+)?)\b/gi,
      relationType: "owns",
      confidence: 0.7,
    },
    {
      pattern: /\b(\w+(?:\s+\w+)?)\s+prefers\s+(\w+(?:\s+\w+)?)\b/gi,
      relationType: "prefers",
      confidence: 0.7,
    },
    {
      pattern: /\b(\w+(?:\s+\w+)?)\s+knows\s+(\w+(?:\s+\w+)?)\b/gi,
      relationType: "knows",
      confidence: 0.6,
    },
    {
      pattern: /\b(\w+(?:\s+\w+)?)\s+depends\s+on\s+(\w+(?:\s+\w+)?)\b/gi,
      relationType: "depends_on",
      confidence: 0.7,
    },
    {
      pattern: /\b(\w+(?:\s+\w+)?)\s+is\s+part\s+of\s+(\w+(?:\s+\w+)?)\b/gi,
      relationType: "part_of",
      confidence: 0.7,
    },
    {
      pattern: /\b(\w+(?:\s+\w+)?)\s+is\s+related\s+to\s+(\w+(?:\s+\w+)?)\b/gi,
      relationType: "related_to",
      confidence: 0.5,
    },
  ];

  for (const { pattern, relationType, confidence } of relationPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const sourceName = match[1].trim();
      const targetName = match[2].trim();

      // Only add relation if both entities exist or are valid
      const sourceEntity = entityNames.get(sourceName.toLowerCase());
      const targetEntity = entityNames.get(targetName.toLowerCase());

      if (
        (sourceEntity || isValidEntityName(sourceName)) &&
        (targetEntity || isValidEntityName(targetName))
      ) {
        relations.push({
          sourceEntityName: sourceName,
          targetEntityName: targetName,
          relationType,
          confidence,
        });
      }
    }
  }
}

/**
 * Checks if a string is a valid entity name.
 */
function isValidEntityName(name: string): boolean {
  return (
    name.length >= 2 &&
    name.length <= 100 &&
    !STOP_WORDS.has(name.toLowerCase()) &&
    /^[A-Za-z]/.test(name)
  );
}

/**
 * LLM-based entity and relation extraction using OpenAI API.
 * Provides higher quality extraction but requires API access.
 */
async function extractWithLlm(text: string, options: ExtractorOptions): Promise<ExtractionResult> {
  const baseUrl = options.openaiBaseUrl || "https://api.openai.com/v1";
  const model = options.extractionModel || "gpt-4o-mini";
  const apiKey = options.openaiApiKey;

  if (!apiKey) {
    throw new Error("OpenAI API key required for LLM extraction");
  }

  // Truncate very long text to avoid token limits
  const maxChars = 4000;
  const truncatedText = text.length > maxChars ? text.slice(0, maxChars) + "..." : text;

  const systemPrompt = `You are an entity and relation extraction system. Extract entities and their relationships from the given text.

Return a JSON object with this exact structure:
{
  "entities": [
    {
      "name": "entity name",
      "type": "person|project|concept|organization|technology|location|file|other",
      "confidence": 0.0-1.0
    }
  ],
  "relations": [
    {
      "source": "source entity name",
      "target": "target entity name",
      "type": "works_on|knows|prefers|owns|uses|created|related_to|depends_on|part_of|other",
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
- Only extract meaningful named entities (people, projects, technologies, organizations, concepts)
- Skip common words and pronouns
- Relations should connect extracted entities
- Confidence should reflect certainty (0.5 = uncertain, 0.9 = very confident)
- Keep entity names as they appear in text (preserve casing)
- For code/technical content, extract function names, class names, package names as concepts or technologies`;

  const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: truncatedText },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`LLM extraction failed: ${response.status} ${errorText}`);
  }

  const result = (await response.json()) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
  };

  const content = result.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM returned empty response");
  }

  const parsed = JSON.parse(content) as {
    entities?: Array<{
      name: string;
      type: string;
      confidence?: number;
    }>;
    relations?: Array<{
      source: string;
      target: string;
      type: string;
      confidence?: number;
    }>;
  };

  // Convert LLM response to our format
  const entities: ExtractedEntity[] = (parsed.entities || [])
    .filter((e) => e.name && e.type)
    .map((e) => ({
      name: e.name,
      type: normalizeEntityType(e.type),
      mentionText: e.name,
      confidence: e.confidence ?? 0.7,
    }));

  const relations: ExtractedRelation[] = (parsed.relations || [])
    .filter((r) => r.source && r.target && r.type)
    .map((r) => ({
      sourceEntityName: r.source,
      targetEntityName: r.target,
      relationType: normalizeRelationType(r.type),
      confidence: r.confidence ?? 0.6,
    }));

  return { entities, relations };
}

/**
 * Normalizes entity type from LLM output to valid EntityType.
 */
function normalizeEntityType(type: string): EntityType {
  const normalized = type.toLowerCase().trim();
  const validTypes: EntityType[] = [
    "person",
    "project",
    "concept",
    "organization",
    "technology",
    "location",
    "file",
    "other",
  ];

  if (validTypes.includes(normalized as EntityType)) {
    return normalized as EntityType;
  }

  // Map common variations
  if (normalized === "tech" || normalized === "tool" || normalized === "framework") {
    return "technology";
  }
  if (normalized === "company" || normalized === "org" || normalized === "team") {
    return "organization";
  }
  if (normalized === "user" || normalized === "developer" || normalized === "author") {
    return "person";
  }
  if (normalized === "repo" || normalized === "package" || normalized === "library") {
    return "project";
  }
  if (normalized === "place" || normalized === "city" || normalized === "country") {
    return "location";
  }
  if (normalized === "path" || normalized === "module") {
    return "file";
  }

  return "other";
}

/**
 * Normalizes relation type from LLM output to valid RelationType.
 */
function normalizeRelationType(type: string): RelationType {
  const normalized = type.toLowerCase().trim().replace(/\s+/g, "_");
  const validTypes: RelationType[] = [
    "works_on",
    "knows",
    "prefers",
    "owns",
    "uses",
    "created",
    "related_to",
    "depends_on",
    "part_of",
    "other",
  ];

  if (validTypes.includes(normalized as RelationType)) {
    return normalized as RelationType;
  }

  // Map common variations
  if (normalized === "working_on" || normalized === "develops" || normalized === "maintains") {
    return "works_on";
  }
  if (normalized === "used_by" || normalized === "utilizes" || normalized === "employs") {
    return "uses";
  }
  if (normalized === "made" || normalized === "built" || normalized === "authored") {
    return "created";
  }
  if (normalized === "has" || normalized === "possesses") {
    return "owns";
  }
  if (normalized === "requires" || normalized === "needs") {
    return "depends_on";
  }
  if (normalized === "member_of" || normalized === "belongs_to" || normalized === "included_in") {
    return "part_of";
  }
  if (
    normalized === "associated_with" ||
    normalized === "connected_to" ||
    normalized === "linked_to"
  ) {
    return "related_to";
  }

  return "other";
}

/**
 * Persists extracted entities to the database.
 * Handles deduplication via canonical name matching.
 */
export function persistEntities(
  db: DatabaseSync,
  entities: ExtractedEntity[],
  chunkId: string,
  sourceType: SourceType,
  trustScore: number = 0.5,
): Entity[] {
  const now = Date.now();
  const persisted: Entity[] = [];

  for (const extracted of entities) {
    // Check for existing entity by name (case-insensitive)
    const existing = db
      .prepare(
        `SELECT id, aliases FROM entities
         WHERE LOWER(name) = LOWER(?) OR LOWER(canonical_name) = LOWER(?)`,
      )
      .get(extracted.name, extracted.name) as { id: string; aliases: string } | undefined;

    let entityId: string;

    if (existing) {
      // Update existing entity's aliases if this is a new mention form
      entityId = existing.id;
      const aliases: string[] = JSON.parse(existing.aliases || "[]");
      if (!aliases.some((a) => a.toLowerCase() === extracted.name.toLowerCase())) {
        aliases.push(extracted.name);
        db.prepare(`UPDATE entities SET aliases = ?, updated_at = ? WHERE id = ?`).run(
          JSON.stringify(aliases),
          now,
          entityId,
        );
      }
    } else {
      // Create new entity
      entityId = generateId();
      db.prepare(
        `INSERT INTO entities (id, name, entity_type, canonical_name, aliases, trust_score, source_type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        entityId,
        extracted.name,
        extracted.type,
        extracted.name.toLowerCase(),
        "[]",
        trustScore,
        sourceType,
        now,
        now,
      );

      persisted.push({
        id: entityId,
        name: extracted.name,
        entity_type: extracted.type,
        canonical_name: extracted.name.toLowerCase(),
        aliases: [],
        trust_score: trustScore,
        source_type: sourceType,
        created_at: now,
        updated_at: now,
      });
    }

    // Create entity mention linking to chunk
    const mentionId = generateId();
    db.prepare(
      `INSERT INTO entity_mentions (id, entity_id, chunk_id, mention_text, start_offset, end_offset, confidence)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      mentionId,
      entityId,
      chunkId,
      extracted.mentionText,
      extracted.startOffset ?? null,
      extracted.endOffset ?? null,
      extracted.confidence,
    );
  }

  return persisted;
}

/**
 * Persists extracted relations to the database.
 * Requires entities to already exist.
 */
export function persistRelations(
  db: DatabaseSync,
  relations: ExtractedRelation[],
  chunkId: string,
  sourceType: SourceType,
  trustScore: number = 0.5,
): Relation[] {
  const now = Date.now();
  const persisted: Relation[] = [];

  for (const extracted of relations) {
    // Look up source and target entities by name
    const sourceEntity = db
      .prepare(
        `SELECT id FROM entities WHERE LOWER(name) = LOWER(?) OR LOWER(canonical_name) = LOWER(?)`,
      )
      .get(extracted.sourceEntityName, extracted.sourceEntityName) as { id: string } | undefined;

    const targetEntity = db
      .prepare(
        `SELECT id FROM entities WHERE LOWER(name) = LOWER(?) OR LOWER(canonical_name) = LOWER(?)`,
      )
      .get(extracted.targetEntityName, extracted.targetEntityName) as { id: string } | undefined;

    if (!sourceEntity || !targetEntity) {
      // Skip relations where entities don't exist
      continue;
    }

    // Check for existing relation
    const existing = db
      .prepare(
        `SELECT id FROM relations
         WHERE source_entity_id = ? AND target_entity_id = ? AND relation_type = ?`,
      )
      .get(sourceEntity.id, targetEntity.id, extracted.relationType) as { id: string } | undefined;

    if (existing) {
      // Update confidence if new evidence is stronger
      db.prepare(`UPDATE relations SET confidence = MAX(confidence, ?) WHERE id = ?`).run(
        extracted.confidence,
        existing.id,
      );
      continue;
    }

    // Create new relation
    const relationId = generateId();
    db.prepare(
      `INSERT INTO relations (id, source_entity_id, target_entity_id, relation_type, confidence, source_chunk_id, trust_score, source_type, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      relationId,
      sourceEntity.id,
      targetEntity.id,
      extracted.relationType,
      extracted.confidence,
      chunkId,
      trustScore,
      sourceType,
      now,
    );

    persisted.push({
      id: relationId,
      source_entity_id: sourceEntity.id,
      target_entity_id: targetEntity.id,
      relation_type: extracted.relationType,
      confidence: extracted.confidence,
      source_chunk_id: chunkId,
      trust_score: trustScore,
      source_type: sourceType,
      created_at: now,
    });
  }

  return persisted;
}

/**
 * Indexed chunk information passed from the memory manager.
 */
export interface IndexedChunk {
  id: string;
  text: string;
  path: string;
  startLine: number;
  endLine: number;
}

type MemorySource = "memory" | "sessions";

/**
 * Maps memory source to provenance source type.
 * - "memory" files are user-curated → user_stated
 * - "sessions" are conversation transcripts → inferred
 */
function mapSourceType(source: MemorySource): SourceType {
  switch (source) {
    case "memory":
      return "user_stated";
    case "sessions":
      return "inferred";
    default:
      return "inferred";
  }
}

/**
 * Extracts and indexes entities from a batch of chunks.
 * Called from MemoryIndexManager.indexFile() after chunks are stored.
 *
 * This function:
 * 1. Records provenance for each chunk
 * 2. Extracts entities and relations from chunk text
 * 3. Persists entities, relations, and mentions to the KG tables
 */
export async function extractAndIndexEntities(
  db: DatabaseSync,
  chunks: IndexedChunk[],
  source: MemorySource,
): Promise<void> {
  const sourceType = mapSourceType(source);
  const trustScore = getDefaultTrustScore(sourceType);

  for (const chunk of chunks) {
    // Record provenance for this chunk
    recordProvenance(db, chunk.id, sourceType, chunk.path, trustScore);

    // Extract entities and relations from chunk text
    const result = await extractFromChunk(chunk.id, chunk.text, {
      db,
      sourceType,
      trustScore,
    });

    // Persist extracted entities (creates entity_mentions linking to chunk)
    if (result.entities.length > 0) {
      persistEntities(db, result.entities, chunk.id, sourceType, trustScore);
    }

    // Persist extracted relations
    if (result.relations.length > 0) {
      persistRelations(db, result.relations, chunk.id, sourceType, trustScore);
    }
  }
}
