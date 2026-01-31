import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Api, Model, SimpleStreamOptions } from "@mariozechner/pi-ai";
import { streamSimple } from "@mariozechner/pi-ai";

import type { OpenClawConfig } from "../../config/config.js";
import type { ModelProviderConfig } from "../../config/types.js";
import { normalizeProviderId } from "../model-selection.js";
import { log } from "./logger.js";

/**
 * Resolve provider config from OpenClaw config.
 */
function resolveProviderConfig(
  cfg: OpenClawConfig | undefined,
  provider: string,
): ModelProviderConfig | undefined {
  const providers = cfg?.models?.providers ?? {};
  const direct = providers[provider] as ModelProviderConfig | undefined;
  if (direct) return direct;
  const normalized = normalizeProviderId(provider);
  if (normalized === provider) {
    const matched = Object.entries(providers).find(
      ([key]) => normalizeProviderId(key) === normalized,
    );
    return matched?.[1] as ModelProviderConfig | undefined;
  }
  return (
    (providers[normalized] as ModelProviderConfig | undefined) ??
    (Object.entries(providers).find(([key]) => normalizeProviderId(key) === normalized)?.[1] as
      | ModelProviderConfig
      | undefined)
  );
}

/**
 * Resolve provider-specific extra params from model config.
 * Used to pass through stream params like temperature/maxTokens.
 *
 * @internal Exported for testing only
 */
export function resolveExtraParams(params: {
  cfg: OpenClawConfig | undefined;
  provider: string;
  modelId: string;
}): Record<string, unknown> | undefined {
  const modelKey = `${params.provider}/${params.modelId}`;
  const modelConfig = params.cfg?.agents?.defaults?.models?.[modelKey];
  return modelConfig?.params ? { ...modelConfig.params } : undefined;
}

type CacheControlTtl = "5m" | "1h";

function resolveCacheControlTtl(
  extraParams: Record<string, unknown> | undefined,
  provider: string,
  modelId: string,
): CacheControlTtl | undefined {
  const raw = extraParams?.cacheControlTtl;
  if (raw !== "5m" && raw !== "1h") return undefined;
  if (provider === "anthropic") return raw;
  if (provider === "openrouter" && modelId.startsWith("anthropic/")) return raw;
  return undefined;
}

function createStreamFnWithExtraParams(
  baseStreamFn: StreamFn | undefined,
  extraParams: Record<string, unknown> | undefined,
  provider: string,
  modelId: string,
  enableMeta?: boolean,
): StreamFn | undefined {
  const streamParams: Partial<SimpleStreamOptions> & {
    cacheControlTtl?: CacheControlTtl;
    enableMeta?: boolean;
  } = {};

  if (extraParams) {
    if (typeof extraParams.temperature === "number") {
      streamParams.temperature = extraParams.temperature;
    }
    if (typeof extraParams.maxTokens === "number") {
      streamParams.maxTokens = extraParams.maxTokens;
    }
    const cacheControlTtl = resolveCacheControlTtl(extraParams, provider, modelId);
    if (cacheControlTtl) {
      streamParams.cacheControlTtl = cacheControlTtl;
    }
  }

  // Add enableMeta for Anthropic provider cache features
  log.info(`enableMeta check: enableMeta=${enableMeta}, provider=${provider}`);
  if (enableMeta && provider === "anthropic") {
    streamParams.enableMeta = true;
    log.info(`enableMeta enabled for ${provider}/${modelId}`);
  }

  if (Object.keys(streamParams).length === 0) {
    return undefined;
  }

  log.debug(`creating streamFn wrapper with params: ${JSON.stringify(streamParams)}`);

  const underlying = baseStreamFn ?? streamSimple;
  const wrappedStreamFn: StreamFn = (model, context, options) =>
    underlying(model as Model<Api>, context, {
      ...streamParams,
      ...options,
    });

  return wrappedStreamFn;
}

/**
 * Apply extra params (like temperature) to an agent's streamFn.
 *
 * @internal Exported for testing
 */
export function applyExtraParamsToAgent(
  agent: { streamFn?: StreamFn },
  cfg: OpenClawConfig | undefined,
  provider: string,
  modelId: string,
  extraParamsOverride?: Record<string, unknown>,
): void {
  const extraParams = resolveExtraParams({
    cfg,
    provider,
    modelId,
  });
  const override =
    extraParamsOverride && Object.keys(extraParamsOverride).length > 0
      ? Object.fromEntries(
          Object.entries(extraParamsOverride).filter(([, value]) => value !== undefined),
        )
      : undefined;
  const merged = Object.assign({}, extraParams, override);

  // Get enableMeta from provider config
  const providerConfig = resolveProviderConfig(cfg, provider);
  const enableMeta = providerConfig?.enableMeta;

  const wrappedStreamFn = createStreamFnWithExtraParams(
    agent.streamFn,
    merged,
    provider,
    modelId,
    enableMeta,
  );

  if (wrappedStreamFn) {
    log.debug(`applying extraParams to agent streamFn for ${provider}/${modelId}`);
    agent.streamFn = wrappedStreamFn;
  }
}
