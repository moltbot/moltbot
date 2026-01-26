import type { ModelDefinitionConfig } from "../config/types.models.js";

export const CHUTES_BASE_URL = "https://llm.chutes.ai/v1";
export const CHUTES_DEFAULT_MODEL_ID = "zai-org/GLM-4.7-Flash";
export const CHUTES_DEFAULT_MODEL_REF = `chutes/${CHUTES_DEFAULT_MODEL_ID}`;

export interface ChutesModelEntry {
  id: string;
  name?: string;
  context_length?: number;
  max_output_length?: number;
  confidential_compute?: boolean;
  pricing?: { prompt: number; completion: number };
  supported_features?: string[];
}

export async function fetchChutesModels(): Promise<ChutesModelEntry[]> {
  try {
    const response = await fetch(`${CHUTES_BASE_URL}/models`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch Chutes models: ${response.statusText}`);
    }
    const data = (await response.json()) as { data: ChutesModelEntry[] };
    return data.data || [];
  } catch (error) {
    console.warn(`[chutes-models] Failed to fetch models: ${String(error)}`);
    return [];
  }
}

export function mapChutesModelToDefinition(entry: ChutesModelEntry): ModelDefinitionConfig {
  return {
    id: entry.id,
    name: entry.name || entry.id,
    reasoning: entry.supported_features?.includes("reasoning") ?? false,
    input: ["text"],
    cost: {
      input: entry.pricing?.prompt ?? 0,
      output: entry.pricing?.completion ?? 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    contextWindow: entry.context_length || 128000,
    maxTokens: entry.max_output_length || 4096,
    confidentialCompute: entry.confidential_compute,
  };
}

export async function discoverChutesModels(opts?: {
  teeOnly?: boolean;
}): Promise<ModelDefinitionConfig[]> {
  const models = await fetchChutesModels();
  if (models.length === 0) {
    // Fallback to minimal list
    return [
      {
        id: CHUTES_DEFAULT_MODEL_ID,
        name: "GLM 4.7 Flash",
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128000,
        maxTokens: 4096,
      },
    ];
  }

  let filtered = models;
  if (opts?.teeOnly) {
    filtered = models.filter((m) => m.confidential_compute === true);
  }

  return filtered.map(mapChutesModelToDefinition);
}
