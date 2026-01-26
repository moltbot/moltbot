import type { ModelDefinitionConfig } from "../config/types.models.js";

export const TOGETHER_BASE_URL = "https://api.together.xyz/v1";

// Together AI uses token-based pricing
// Default costs when specific pricing is not available
export const TOGETHER_DEFAULT_COST = {
  input: 0.5,
  output: 0.5,
  cacheRead: 0.5,
  cacheWrite: 0.5,
};

// Together AI API response types
interface TogetherModel {
  id: string;
  name?: string;
  display_name?: string;
  description?: string;
  context_length?: number;
  tokenizer?: string;
  type?: string;
  capabilities?: {
    vision?: boolean;
    function_calling?: boolean;
    tool_use?: boolean;
  };
  pricing?: {
    input?: number;
    output?: number;
  };
}

/**
 * Discover models from Together AI API.
 * The /models endpoint requires authentication via API key.
 */
export async function discoverTogetherModels(apiKey?: string): Promise<ModelDefinitionConfig[]> {
  // Skip API discovery in test environment
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return [];
  }

  console.log("[together-models] Starting model discovery from Together AI API...");
  console.log(`[together-models] Fetching from: ${TOGETHER_BASE_URL}/models`);
  console.log(`[together-models] API key provided: ${apiKey ? "Yes" : "No"}`);

  try {
    // Together AI requires authentication for /models endpoint
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    const response = await fetch(`${TOGETHER_BASE_URL}/models`, {
      signal: AbortSignal.timeout(5000),
      headers,
    });

    console.log(`[together-models] Response status: ${response.status} ${response.statusText}`);
    console.log(
      `[together-models] Response headers:`,
      Object.fromEntries(response.headers.entries()),
    );

    if (!response.ok) {
      console.warn(`[together-models] Failed to discover models: HTTP ${response.status}`);

      // Try to get error details from response
      try {
        const errorText = await response.text();
        console.warn(`[together-models] Error response body: ${errorText}`);
      } catch (e) {
        console.warn(`[together-models] Could not read error response body: ${String(e)}`);
      }

      return [];
    }

    const rawResponse = await response.text();
    console.log(
      `[together-models] Raw response (first 500 chars): ${rawResponse.substring(0, 500)}`,
    );

    let models: TogetherModel[];
    try {
      const parsed = JSON.parse(rawResponse);

      // Together AI returns array directly, not { data: array }
      if (Array.isArray(parsed)) {
        models = parsed as TogetherModel[];
        console.log(`[together-models] Response is direct array with ${models.length} models`);
      } else if (parsed.data && Array.isArray(parsed.data)) {
        models = parsed.data as TogetherModel[];
        console.log(`[together-models] Response has data array with ${models.length} models`);
      } else {
        console.error(`[together-models] Unexpected response format:`, parsed);
        return [];
      }
    } catch (e) {
      console.error(`[together-models] Failed to parse JSON: ${String(e)}`);
      console.error(`[together-models] Raw response: ${rawResponse}`);
      return [];
    }

    if (!Array.isArray(models) || models.length === 0) {
      console.warn("[together-models] No models found from API");
      return [];
    }

    // Filter for chat models only and map to ModelDefinitionConfig
    const chatModels = models.filter((model) => model.type === "chat");
    console.log(
      `[together-models] Found ${models.length} total models, ${chatModels.length} chat models`,
    );

    return chatModels.map((model: TogetherModel, index: number) => {
      console.log(`[together-models] Processing model ${index + 1}/${chatModels.length}:`, {
        id: model.id,
        name: model.name,
        display_name: model.display_name,
        type: model.type,
        context_length: model.context_length,
        capabilities: model.capabilities,
        pricing: model.pricing,
      });
      const modelId = model.id;
      const displayName = model.display_name || model.name || modelId;

      // Determine if model supports reasoning
      const isReasoning =
        modelId.toLowerCase().includes("reason") ||
        modelId.toLowerCase().includes("r1") ||
        modelId.toLowerCase().includes("thinking") ||
        model.description?.toLowerCase().includes("reasoning") ||
        false;

      // Determine input types
      const hasVision =
        model.capabilities?.vision ||
        modelId.toLowerCase().includes("vision") ||
        modelId.toLowerCase().includes("vl") ||
        model.description?.toLowerCase().includes("vision") ||
        false;

      // Use pricing from API if available, otherwise use defaults
      const cost = model.pricing
        ? {
            input: model.pricing.input || TOGETHER_DEFAULT_COST.input,
            output: model.pricing.output || TOGETHER_DEFAULT_COST.output,
            cacheRead: model.pricing.input || TOGETHER_DEFAULT_COST.cacheRead,
            cacheWrite: model.pricing.output || TOGETHER_DEFAULT_COST.cacheWrite,
          }
        : TOGETHER_DEFAULT_COST;

      return {
        id: modelId,
        name: displayName,
        reasoning: isReasoning,
        input: hasVision ? ["text", "image"] : ["text"],
        cost,
        contextWindow: model.context_length || 131072,
        maxTokens: 8192, // Default max tokens for most models
      };
    });
  } catch (error) {
    console.warn(`[together-models] Discovery failed: ${String(error)}`);
    if (error instanceof Error) {
      console.warn(`[together-models] Error name: ${error.name}`);
      console.warn(`[together-models] Error message: ${error.message}`);
      console.warn(`[together-models] Error stack: ${error.stack}`);
    }
    return [];
  }
}
