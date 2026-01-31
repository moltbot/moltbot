import type { ModelDefinitionConfig } from "../config/types.models.js";
import {
  CHUTES_BASE_URL,
  CHUTES_DEFAULT_COST,
  CHUTES_DEFAULT_MODEL_ID,
  CHUTES_DEFAULT_MODEL_REF,
  CHUTES_MODEL_CATALOG,
} from "../commands/onboard-auth.models.js";

export {
  CHUTES_BASE_URL,
  CHUTES_DEFAULT_COST,
  CHUTES_DEFAULT_MODEL_ID,
  CHUTES_DEFAULT_MODEL_REF,
  CHUTES_MODEL_CATALOG,
};

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
  // Skip dynamic fetching in test environments to avoid network issues and timeouts.
  if (
    process.env.VITEST ||
    process.env.NODE_ENV === "test" ||
    process.env.OPENCLAW_SKIP_DYNAMIC_MODELS === "1"
  ) {
    return [];
  }
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

/** Convert a catalog entry to a mutable ModelDefinitionConfig */
function catalogEntryToDefinition(
  entry: (typeof CHUTES_MODEL_CATALOG)[number],
): ModelDefinitionConfig {
  return {
    id: entry.id,
    name: entry.name,
    reasoning: entry.reasoning,
    input: [...entry.input], // spread to make mutable
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
    cost: CHUTES_DEFAULT_COST,
    confidentialCompute: "confidentialCompute" in entry ? entry.confidentialCompute : undefined,
  };
}

export async function discoverChutesModels(opts?: {
  teeOnly?: boolean;
}): Promise<ModelDefinitionConfig[]> {
  const catalogModels = CHUTES_MODEL_CATALOG.map(catalogEntryToDefinition);

  const apiModels = await fetchChutesModels();
  if (apiModels.length === 0) {
    if (opts?.teeOnly) {
      return catalogModels.filter((m) => m.confidentialCompute === true);
    }
    return catalogModels;
  }

  // Merge discovered models with catalog metadata
  const catalogById = new Map<string, (typeof CHUTES_MODEL_CATALOG)[number]>(
    CHUTES_MODEL_CATALOG.map((m) => [m.id, m]),
  );
  const models: ModelDefinitionConfig[] = [];

  for (const apiModel of apiModels) {
    const catalogEntry = catalogById.get(apiModel.id);
    if (catalogEntry) {
      // Use catalog metadata for known models, but respect API's confidential_compute
      const def = catalogEntryToDefinition(catalogEntry);
      def.confidentialCompute =
        apiModel.confidential_compute ??
        ("confidentialCompute" in catalogEntry ? catalogEntry.confidentialCompute : undefined);
      models.push(def);
    } else {
      // Create definition for newly discovered models not in catalog
      models.push(mapChutesModelToDefinition(apiModel));
    }
  }

  let filtered = models;
  if (opts?.teeOnly) {
    filtered = models.filter((model) => model.confidentialCompute === true);
  }

  return filtered.length > 0 ? filtered : catalogModels;
}
