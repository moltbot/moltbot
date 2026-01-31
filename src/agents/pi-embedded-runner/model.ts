import type { Api, Model } from "@mariozechner/pi-ai";
import { discoverAuthStorage, discoverModels } from "@mariozechner/pi-coding-agent";

import type { OpenClawConfig } from "../../config/config.js";
import type { ModelDefinitionConfig } from "../../config/types.js";
import { resolveOpenClawAgentDir } from "../agent-paths.js";
import { DEFAULT_CONTEXT_TOKENS } from "../defaults.js";
import { normalizeModelCompat } from "../model-compat.js";
import { normalizeProviderId } from "../model-selection.js";

type InlineModelEntry = ModelDefinitionConfig & { provider: string; baseUrl?: string };
type InlineProviderConfig = {
  baseUrl?: string;
  api?: ModelDefinitionConfig["api"];
  models?: ModelDefinitionConfig[];
};

function isCloudflareAiGatewayUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === "gateway.ai.cloudflare.com";
  } catch {
    return false;
  }
}

/**
 * Optional Cloudflare AI Gateway auth support.
 *
 * When routing OpenRouter traffic via Cloudflare AI Gateway with "Authenticated Gateway"
 * enabled, Cloudflare requires a `cf-aig-authorization` header.
 *
 * We inject it at runtime from `CLOUDFLARE_AIG_TOKEN` (if set) so it never needs to be
 * written to `openclaw.json` or `models.json`.
 */
export function maybeInjectCloudflareAiGatewayAuthHeader<TApi extends Api>(
  model: Model<TApi>,
  env: NodeJS.ProcessEnv = process.env,
): Model<TApi> {
  const token = String(env.CLOUDFLARE_AIG_TOKEN ?? "").trim();
  if (!token) return model;

  const baseUrl = String((model as { baseUrl?: unknown }).baseUrl ?? "").trim();
  if (!baseUrl || !isCloudflareAiGatewayUrl(baseUrl)) return model;

  // Cloudflare's OpenRouter provider endpoint is `.../openrouter...`.
  // We scope this to OpenRouter to avoid surprising behavior for other providers.
  const provider = String((model as { provider?: unknown }).provider ?? "").trim().toLowerCase();
  if (provider !== "openrouter") return model;

  const existingHeaders = (model as { headers?: Record<string, string> }).headers;
  if (existingHeaders?.["cf-aig-authorization"]) return model;

  return {
    ...model,
    headers: {
      ...(existingHeaders ?? {}),
      "cf-aig-authorization": `Bearer ${token}`,
    },
  };
}

export function buildInlineProviderModels(
  providers: Record<string, InlineProviderConfig>,
): InlineModelEntry[] {
  return Object.entries(providers).flatMap(([providerId, entry]) => {
    const trimmed = providerId.trim();
    if (!trimmed) return [];
    return (entry?.models ?? []).map((model) => ({
      ...model,
      provider: trimmed,
      baseUrl: entry?.baseUrl,
      api: model.api ?? entry?.api,
    }));
  });
}

export function buildModelAliasLines(cfg?: OpenClawConfig) {
  const models = cfg?.agents?.defaults?.models ?? {};
  const entries: Array<{ alias: string; model: string }> = [];
  for (const [keyRaw, entryRaw] of Object.entries(models)) {
    const model = String(keyRaw ?? "").trim();
    if (!model) continue;
    const alias = String((entryRaw as { alias?: string } | undefined)?.alias ?? "").trim();
    if (!alias) continue;
    entries.push({ alias, model });
  }
  return entries
    .sort((a, b) => a.alias.localeCompare(b.alias))
    .map((entry) => `- ${entry.alias}: ${entry.model}`);
}

export function resolveModel(
  provider: string,
  modelId: string,
  agentDir?: string,
  cfg?: OpenClawConfig,
): {
  model?: Model<Api>;
  error?: string;
  authStorage: ReturnType<typeof discoverAuthStorage>;
  modelRegistry: ReturnType<typeof discoverModels>;
} {
  const resolvedAgentDir = agentDir ?? resolveOpenClawAgentDir();
  const authStorage = discoverAuthStorage(resolvedAgentDir);
  const modelRegistry = discoverModels(authStorage, resolvedAgentDir);
  const model = modelRegistry.find(provider, modelId) as Model<Api> | null;
  if (!model) {
    const providers = cfg?.models?.providers ?? {};
    const inlineModels = buildInlineProviderModels(providers);
    const normalizedProvider = normalizeProviderId(provider);
    const inlineMatch = inlineModels.find(
      (entry) => normalizeProviderId(entry.provider) === normalizedProvider && entry.id === modelId,
    );
    if (inlineMatch) {
      const normalized = maybeInjectCloudflareAiGatewayAuthHeader(
        normalizeModelCompat(inlineMatch as Model<Api>),
      );
      return {
        model: normalized,
        authStorage,
        modelRegistry,
      };
    }
    const providerCfg = providers[provider];
    if (providerCfg || modelId.startsWith("mock-")) {
      const fallbackModel: Model<Api> = maybeInjectCloudflareAiGatewayAuthHeader(
        normalizeModelCompat({
        id: modelId,
        name: modelId,
        api: providerCfg?.api ?? "openai-responses",
        provider,
        baseUrl: providerCfg?.baseUrl,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: providerCfg?.models?.[0]?.contextWindow ?? DEFAULT_CONTEXT_TOKENS,
        maxTokens: providerCfg?.models?.[0]?.maxTokens ?? DEFAULT_CONTEXT_TOKENS,
        } as Model<Api>),
      );
      return { model: fallbackModel, authStorage, modelRegistry };
    }
    return {
      error: `Unknown model: ${provider}/${modelId}`,
      authStorage,
      modelRegistry,
    };
  }
  return {
    model: maybeInjectCloudflareAiGatewayAuthHeader(normalizeModelCompat(model)),
    authStorage,
    modelRegistry,
  };
}
