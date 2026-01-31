import type { ModelDefinitionConfig } from "../config/types.js";
import { listCopilotModels, type CopilotModelInfo } from "./github-copilot-sdk.js";

const DEFAULT_CONTEXT_WINDOW = 128_000;
const DEFAULT_MAX_TOKENS = 8192;

// Fallback model ids if SDK model discovery fails
const FALLBACK_MODEL_IDS = ["gpt-4o", "gpt-4.1", "gpt-5-mini", "grok-code-fast-1"] as const;

/**
 * Get available model IDs from the Copilot SDK.
 * Falls back to hardcoded list if SDK discovery fails.
 */
export async function getDefaultCopilotModelIds(): Promise<string[]> {
  try {
    const models = await listCopilotModels();
    if (models.length > 0) {
      return models.map((m) => m.id);
    }
  } catch {
    // Fall through to fallback list
  }
  return [...FALLBACK_MODEL_IDS];
}

/**
 * Get available model IDs synchronously (fallback list only).
 * Use getDefaultCopilotModelIds() for SDK-based discovery.
 */
export function getDefaultCopilotModelIdsSync(): string[] {
  return [...FALLBACK_MODEL_IDS];
}

/**
 * Build a model definition from SDK model info.
 */
export function buildCopilotModelDefinitionFromSdk(model: CopilotModelInfo): ModelDefinitionConfig {
  return {
    id: model.id,
    name: model.name,
    // The SDK manages API routing internally
    api: "openai-responses",
    reasoning: false,
    input: model.capabilities?.supports?.vision ? ["text", "image"] : ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: model.capabilities?.limits?.max_context_window_tokens ?? DEFAULT_CONTEXT_WINDOW,
    maxTokens: model.capabilities?.limits?.max_prompt_tokens ?? DEFAULT_MAX_TOKENS,
  };
}

export function buildCopilotModelDefinition(modelId: string): ModelDefinitionConfig {
  const id = modelId.trim();
  if (!id) throw new Error("Model id required");
  return {
    id,
    name: id,
    // pi-coding-agent's registry schema doesn't know about a "github-copilot" API.
    // We use OpenAI-compatible responses API, while keeping the provider id as
    // "github-copilot" (pi-ai uses that to attach Copilot-specific headers).
    api: "openai-responses",
    reasoning: false,
    input: ["text", "image"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    maxTokens: DEFAULT_MAX_TOKENS,
  };
}
