/**
 * OpenCode Server model catalog with dynamic fetching, caching, and static fallback.
 *
 * OpenCode Server is a local HTTP server (via `opencode serve`) that provides
 * access to multiple AI models through a single endpoint.
 *
 * Default endpoint: http://127.0.0.1:4096
 * Docs: https://opencode.ai/docs/server/
 */

import type { ModelApi, ModelDefinitionConfig } from "../config/types.js";

export const OPENCODE_SERVER_DEFAULT_URL = "http://127.0.0.1:4096";
export const OPENCODE_SERVER_DEFAULT_PORT = 4096;

// Cache for fetched models (1 hour TTL)
let cachedModels: ModelDefinitionConfig[] | null = null;
let cacheTimestamp = 0;
let cachedBaseUrl: string | null = null;
let cachedAuthKey: string | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Model aliases for convenient shortcuts.
 * Users can use "opus" instead of "claude-opus-4-5", etc.
 */
export const OPENCODE_SERVER_MODEL_ALIASES: Record<string, string> = {
  // Claude
  opus: "claude-opus-4-5",
  "opus-4.5": "claude-opus-4-5",
  "opus-4": "claude-opus-4-5",
  sonnet: "claude-sonnet-4",
  "sonnet-4": "claude-sonnet-4",
  haiku: "claude-haiku-3.5",
  "haiku-3.5": "claude-haiku-3.5",

  // GPT
  gpt4: "gpt-4-turbo",
  "gpt-4": "gpt-4-turbo",
  gpt5: "gpt-5",
  "gpt-5": "gpt-5",

  // Gemini
  gemini: "gemini-2.5-pro",
  "gemini-pro": "gemini-2.5-pro",
  flash: "gemini-2.5-flash",
  "gemini-flash": "gemini-2.5-flash",
};

/**
 * Resolve a model alias to its full model ID.
 * Returns the input if no alias exists.
 */
export function resolveOpencodeServerAlias(modelIdOrAlias: string): string {
  const normalized = modelIdOrAlias.toLowerCase().trim();
  return OPENCODE_SERVER_MODEL_ALIASES[normalized] ?? modelIdOrAlias;
}

/**
 * OpenCode Server routes models to specific API shapes by family.
 * This mirrors the logic from opencode-zen-models.ts for consistency.
 */
export function resolveOpencodeServerModelApi(modelId: string): ModelApi {
  const lower = modelId.toLowerCase();
  if (lower.startsWith("gpt-") || lower.startsWith("o1-") || lower.startsWith("o3-")) {
    return "openai-responses";
  }
  if (lower.startsWith("claude-") || lower.startsWith("minimax-")) {
    return "anthropic-messages";
  }
  if (lower.startsWith("gemini-")) {
    return "google-generative-ai";
  }
  return "openai-completions";
}

/**
 * Check if a model supports image input.
 */
function supportsImageInput(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  if (lower.includes("glm") || lower.includes("minimax")) {
    return false;
  }
  return true;
}

const DEFAULT_COST = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const DEFAULT_CONTEXT_WINDOW = 128000;
const DEFAULT_MAX_TOKENS = 8192;

/**
 * Build a ModelDefinitionConfig from a model ID.
 */
function buildModelDefinition(modelId: string): ModelDefinitionConfig {
  return {
    id: modelId,
    name: formatModelName(modelId),
    api: resolveOpencodeServerModelApi(modelId),
    reasoning: isReasoningModel(modelId),
    input: supportsImageInput(modelId) ? ["text", "image"] : ["text"],
    cost: DEFAULT_COST,
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
  };
}

/**
 * Check if a model is a reasoning model based on ID.
 */
function isReasoningModel(modelId: string): boolean {
  const lower = modelId.toLowerCase();
  return (
    lower.includes("o1") ||
    lower.includes("o3") ||
    lower.includes("reasoning") ||
    lower.includes("think")
  );
}

/**
 * Format a model ID into a human-readable name.
 */
function formatModelName(modelId: string): string {
  return modelId
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * Static fallback models when server is unreachable.
 */
export function getOpencodeServerStaticFallbackModels(): ModelDefinitionConfig[] {
  const modelIds = [
    "claude-opus-4-5",
    "claude-sonnet-4",
    "gpt-4-turbo",
    "gpt-4o",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
  ];

  return modelIds.map(buildModelDefinition);
}

/**
 * Response shape from OpenCode Server /provider endpoint.
 * The response is an array of providers, each with a `models` object (key-value).
 * Also includes `default` and `connected` fields at the end.
 */
interface ProviderModel {
  id: string;
  providerID: string;
  name: string;
  family?: string;
  api?: {
    id: string;
    url?: string;
    npm?: string;
  };
  status?: string;
  cost?: {
    input: number;
    output: number;
    cache?: { read: number; write: number };
  };
  limit?: {
    context: number;
    output: number;
  };
  capabilities?: {
    reasoning?: boolean;
    input?: {
      text?: boolean;
      image?: boolean;
    };
  };
}

interface ProviderEntry {
  id: string;
  name: string;
  source?: string;
  models: Record<string, ProviderModel>;
}

/**
 * Response shape from OpenCode Server /provider endpoint.
 * The response is { all: [...providers], default: {...}, connected: [...] }
 */
interface ProviderListResponse {
  all: ProviderEntry[];
  default?: Record<string, string>;
  connected?: string[];
}

export interface OpencodeServerAuth {
  username?: string;
  password?: string;
}

/**
 * Build Authorization header for HTTP Basic Auth.
 */
function buildAuthHeader(auth?: OpencodeServerAuth): Record<string, string> {
  if (!auth?.password) {
    return {};
  }
  const username = auth.username ?? "opencode";
  const credentials = Buffer.from(`${username}:${auth.password}`).toString("base64");
  return { Authorization: `Basic ${credentials}` };
}

/**
 * Resolve ModelApi from the API npm package name.
 */
function resolveApiFromNpm(npm?: string): ModelApi | undefined {
  if (!npm) {
    return undefined;
  }
  if (npm.includes("anthropic")) {
    return "anthropic-messages";
  }
  if (npm.includes("openai")) {
    return "openai-responses";
  }
  if (npm.includes("google") || npm.includes("gemini")) {
    return "google-generative-ai";
  }
  return undefined;
}

/**
 * Build a ModelDefinitionConfig from a ProviderModel.
 */
function buildModelDefinitionFromProvider(model: ProviderModel): ModelDefinitionConfig {
  const apiFromNpm = resolveApiFromNpm(model.api?.npm);
  const api = apiFromNpm ?? resolveOpencodeServerModelApi(model.id);

  const supportsImage = model.capabilities?.input?.image ?? supportsImageInput(model.id);
  const reasoning = model.capabilities?.reasoning ?? isReasoningModel(model.id);

  return {
    id: model.id,
    name: model.name || formatModelName(model.id),
    api,
    reasoning,
    input: supportsImage ? ["text", "image"] : ["text"],
    cost: {
      input: model.cost?.input ?? 0,
      output: model.cost?.output ?? 0,
      cacheRead: model.cost?.cache?.read ?? 0,
      cacheWrite: model.cost?.cache?.write ?? 0,
    },
    contextWindow: model.limit?.context ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: model.limit?.output ?? DEFAULT_MAX_TOKENS,
  };
}

/**
 * Fetch models from the OpenCode Server.
 * Uses caching with 1-hour TTL.
 *
 * @param baseUrl - OpenCode Server URL (default: http://127.0.0.1:4096)
 * @param auth - Optional authentication credentials
 * @returns Array of model definitions, or static fallback on failure
 */
export async function fetchOpencodeServerModels(
  baseUrl: string = OPENCODE_SERVER_DEFAULT_URL,
  auth?: OpencodeServerAuth,
): Promise<ModelDefinitionConfig[]> {
  // Create auth key for cache discrimination (includes password hash for security)
  const authKey = auth?.password ? `${auth.username ?? "opencode"}:${auth.password.length}` : "";

  // Return cached models if still valid, same base URL, and same auth
  const now = Date.now();
  if (
    cachedModels &&
    cachedBaseUrl === baseUrl &&
    cachedAuthKey === authKey &&
    now - cacheTimestamp < CACHE_TTL_MS
  ) {
    return cachedModels;
  }

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...buildAuthHeader(auth),
    };

    const response = await fetch(`${baseUrl}/provider`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}: ${response.statusText}`);
    }

    const rawData = (await response.json()) as ProviderListResponse;

    // The response is { all: [...providers], default: {...}, connected: [...] }
    const connectedProviders = new Set<string>(rawData.connected ?? []);

    // Get providers from the 'all' array
    const allProviders = rawData.all;
    if (!Array.isArray(allProviders)) {
      throw new Error("Invalid response format: expected 'all' to be an array");
    }

    const providers: ProviderEntry[] = allProviders.filter(
      (item: unknown): item is ProviderEntry =>
        typeof item === "object" && item !== null && "id" in item && "models" in item,
    );

    const models: ModelDefinitionConfig[] = [];
    const seenModelIds = new Set<string>();

    // Extract models from connected providers first
    for (const provider of providers) {
      if (!connectedProviders.has(provider.id)) {
        continue;
      }

      if (provider.models && typeof provider.models === "object") {
        for (const model of Object.values(provider.models)) {
          if (!seenModelIds.has(model.id)) {
            seenModelIds.add(model.id);
            models.push(buildModelDefinitionFromProvider(model));
          }
        }
      }
    }

    // If no connected providers or no models, try all providers
    if (models.length === 0) {
      for (const provider of providers) {
        if (provider.models && typeof provider.models === "object") {
          for (const model of Object.values(provider.models)) {
            if (!seenModelIds.has(model.id)) {
              seenModelIds.add(model.id);
              models.push(buildModelDefinitionFromProvider(model));
            }
          }
        }
      }
    }

    if (models.length === 0) {
      throw new Error("No models found in provider response");
    }

    cachedModels = models;
    cacheTimestamp = now;
    cachedBaseUrl = baseUrl;
    cachedAuthKey = authKey;

    return models;
  } catch (error) {
    console.warn(
      `[opencode-server] Failed to fetch models, using static fallback: ${String(error)}`,
    );
    return getOpencodeServerStaticFallbackModels();
  }
}

/**
 * Clear the model cache (useful for testing or forcing refresh).
 */
export function clearOpencodeServerModelCache(): void {
  cachedModels = null;
  cacheTimestamp = 0;
  cachedBaseUrl = null;
  cachedAuthKey = null;
}

/**
 * Check if the OpenCode server is running and reachable.
 */
export async function isOpencodeServerRunning(
  baseUrl: string = OPENCODE_SERVER_DEFAULT_URL,
  auth?: OpencodeServerAuth,
): Promise<boolean> {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...buildAuthHeader(auth),
    };

    const response = await fetch(`${baseUrl}/global/health`, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(3000), // 3 second timeout
    });

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { healthy?: boolean };
    return data.healthy === true;
  } catch {
    return false;
  }
}
