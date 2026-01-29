import type { ModelDefinitionConfig } from "../config/types.js";

export const SHENGSUANYUN_BASE_URL = "https://router.shengsuanyun.com/api/v1";
export const SHENGSUANYUN_MODALITIES_BASE_URL = "https://api.shengsuanyun.com/modelrouter";

// ShengSuanYun uses credit-based pricing. Set to 0 as costs vary by model.
export const SHENGSUANYUN_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

// ShengSuanYun API response types for LLM models
interface ShengSuanYunModel {
  id: string;
  company: string;
  name: string;
  api_name: string;
  description: string;
  max_tokens: number;
  context_window: number;
  supports_prompt_cache: boolean;
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type: string | null;
  };
  pricing: {
    prompt: string;
    completion: string;
    request: string;
    image?: string;
    tts?: string;
  };
  support_apis: string[];
}

interface ShengSuanYunModelsResponse {
  data: ShengSuanYunModel[];
  object: string;
  success: boolean;
}

// ShengSuanYun multimodal API response types
interface ShengSuanYunModalityModel {
  id: number;
  model_name: string;
  company_name: string;
  class_name: string;
  class_names: string[];
  desc: string;
  preview_img: string;
  preview_video?: string;
  usage: number;
  pricing: {
    input_price: number;
    output_price: number;
    currency: string;
  };
}

interface ShengSuanYunModalitiesResponse {
  code: number;
  data: {
    infos: ShengSuanYunModalityModel[];
  };
}

/**
 * Determine if a model supports reasoning based on its name and description.
 */
function isReasoningModel(model: ShengSuanYunModel): boolean {
  const lowerName = (model.name ?? "").toLowerCase();
  const lowerId = (model.id ?? "").toLowerCase();
  const lowerDesc = (model.description ?? "").toLowerCase();

  return (
    lowerName.includes("thinking") ||
    lowerName.includes("reasoning") ||
    lowerName.includes("reason") ||
    lowerName.includes("r1") ||
    lowerId.includes("thinking") ||
    lowerId.includes("reasoning") ||
    lowerId.includes("r1") ||
    lowerDesc.includes("reasoning") ||
    lowerDesc.includes("thinking")
  );
}

/**
 * Determine if a model supports vision/image inputs.
 */
function supportsVision(model: ShengSuanYunModel): boolean {
  const modality = (model.architecture?.modality ?? "").toLowerCase();
  return (
    modality.includes("image") || modality.includes("vision") || modality === "text+image->text"
  );
}

/**
 * Build a ModelDefinitionConfig from a ShengSuanYun API model.
 */
function buildShengSuanYunModelDefinition(model: ShengSuanYunModel): ModelDefinitionConfig {
  const hasVision = supportsVision(model);
  const reasoning = isReasoningModel(model);

  return {
    id: model.id,
    name: model.name,
    reasoning,
    input: hasVision ? ["text", "image"] : ["text"],
    cost: SHENGSUANYUN_DEFAULT_COST,
    contextWindow: model.context_window || 128000,
    maxTokens: model.max_tokens || 8192,
  };
}

/**
 * Discover models from ShengSuanYun API.
 * The /models endpoint is public and doesn't require authentication.
 */
export async function discoverShengSuanYunModels(): Promise<ModelDefinitionConfig[]> {
  // Skip API discovery in test environment
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return [];
  }

  try {
    const response = await fetch(`${SHENGSUANYUN_BASE_URL}/models`, {
      signal: AbortSignal.timeout(10000), // 10s timeout for large model list
    });

    if (!response.ok) {
      // console.warn(
      //   `[shengsuanyun-models] Failed to discover models: HTTP ${response.status}`,
      // );
      return [];
    }

    const data = (await response.json()) as ShengSuanYunModelsResponse;

    if (!data.success || !Array.isArray(data.data) || data.data.length === 0) {
      // console.warn("[shengsuanyun-models] No models found from API");
      return [];
    }

    const models: ModelDefinitionConfig[] = [];
    for (const apiModel of data.data) {
      // Only include models that support at least one compatible API
      const supportApis = apiModel.support_apis;
      if (!Array.isArray(supportApis)) {
        continue;
      }

      const hasCompatibleApi = supportApis.some(
        (api) =>
          api === "/v1/chat/completions" || api === "/v1/messages" || api === "/v1/responses",
      );

      if (!hasCompatibleApi) {
        continue;
      }

      models.push(buildShengSuanYunModelDefinition(apiModel));
    }

    // console.log(`[shengsuanyun-models] Discovered ${models.length} LLM models`);
    return models;
  } catch {
    // console.warn(`[shengsuanyun-models] Discovery failed: ${String(error)}`);
    return [];
  }
}

/**
 * Determine modality input types from class names.
 */
function getModalityInputTypes(classNames: string[]): Array<"text" | "image"> {
  if (!Array.isArray(classNames)) return ["text"];

  const hasText = classNames.some((name) => name && (name.includes("text") || name.includes("文")));
  const hasImage = classNames.some(
    (name) =>
      name &&
      (name.includes("image") ||
        name.includes("图") ||
        name.includes("video") ||
        name.includes("视频")),
  );

  const inputs: Array<"text" | "image"> = [];
  if (hasText) inputs.push("text");
  if (hasImage) inputs.push("image");

  // Default to text if no clear input type
  return inputs.length > 0 ? inputs : ["text"];
}

function buildShengSuanYunModalityModelDefinition(
  model: ShengSuanYunModalityModel,
): ModelDefinitionConfig {
  const inputs = getModalityInputTypes(model.class_names);

  return {
    id: `modality/${model.id}`,
    name: `${model.model_name} (${model.company_name})`,
    reasoning: false, // Multimodal models typically don't do reasoning
    input: inputs,
    cost: SHENGSUANYUN_DEFAULT_COST,
    contextWindow: 128000, // Default context window for multimodal models
    maxTokens: 8192,
  };
}

export async function discoverShengSuanYunModalityModels(): Promise<ModelDefinitionConfig[]> {
  // Skip API discovery in test environment
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    return [];
  }

  try {
    const response = await fetch(
      `${SHENGSUANYUN_MODALITIES_BASE_URL}/modalities/list?page=1&page_size=200`,
      {
        signal: AbortSignal.timeout(10000), // 10s timeout
      },
    );

    if (!response.ok) {
      // console.warn(
      //   `[shengsuanyun-modalities] Failed to discover modality models: HTTP ${response.status}`,
      // );
      return [];
    }

    const data = (await response.json()) as ShengSuanYunModalitiesResponse;

    if (data.code !== 0 || !Array.isArray(data.data.infos) || data.data.infos.length === 0) {
      // console.warn("[shengsuanyun-modalities] No modality models found from API");
      return [];
    }

    const models: ModelDefinitionConfig[] = data.data.infos.map(
      buildShengSuanYunModalityModelDefinition,
    );

    // console.log(`[shengsuanyun-modalities] Discovered ${models.length} modality models`);
    return models;
  } catch {
    // console.warn(`[shengsuanyun-modalities] Discovery failed: ${String(error)}`);
    return [];
  }
}

/**
 * Discover all ShengSuanYun models (LLM + multimodal).
 */
export async function discoverAllShengSuanYunModels(): Promise<ModelDefinitionConfig[]> {
  const [llmModels, modalityModels] = await Promise.all([
    discoverShengSuanYunModels(),
    discoverShengSuanYunModalityModels(),
  ]);

  const allModels = [...llmModels, ...modalityModels];
  // console.log(
  //   `[shengsuanyun] Discovered ${allModels.length} total models (${llmModels.length} LLM, ${modalityModels.length} multimodal)`
  // );
  return allModels;
}
