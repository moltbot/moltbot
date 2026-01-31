import { fetchJson } from "./provider-usage.fetch.shared.js";
import { clampPercent, PROVIDER_LABELS } from "./provider-usage.shared.js";
import type {
  ProviderUsageSnapshot,
  UsageProviderId,
  UsageWindow,
} from "./provider-usage.types.js";

type ZaiUsageResponse = {
  success?: boolean;
  code?: number;
  msg?: string;
  data?: {
    planName?: string;
    plan?: string;
    limits?: Array<{
      type?: string;
      percentage?: number;
      unit?: number;
      number?: number;
      nextResetTime?: string;
    }>;
  };
};

type GlmUsageProviderId = "zai" | "zai-coding" | "zhipu" | "zhipu-coding";

const GLM_USAGE_URLS: Record<GlmUsageProviderId, string> = {
  zai: "https://api.z.ai/api/monitor/usage/quota/limit",
  "zai-coding": "https://api.z.ai/api/monitor/usage/quota/limit",
  zhipu: "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
  "zhipu-coding": "https://open.bigmodel.cn/api/monitor/usage/quota/limit",
};

export async function fetchGlmUsage(
  provider: GlmUsageProviderId,
  apiKey: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<ProviderUsageSnapshot> {
  const url = GLM_USAGE_URLS[provider];
  const res = await fetchJson(
    url,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    },
    timeoutMs,
    fetchFn,
  );

  if (!res.ok) {
    return {
      provider: provider as UsageProviderId,
      displayName: PROVIDER_LABELS[provider],
      windows: [],
      error: `HTTP ${res.status}`,
    };
  }

  const data = (await res.json()) as ZaiUsageResponse;
  if (!data.success || data.code !== 200) {
    return {
      provider: provider as UsageProviderId,
      displayName: PROVIDER_LABELS[provider],
      windows: [],
      error: data.msg || "API error",
    };
  }

  const windows: UsageWindow[] = [];
  const limits = data.data?.limits || [];

  for (const limit of limits) {
    const percent = clampPercent(limit.percentage || 0);
    const nextReset = limit.nextResetTime ? new Date(limit.nextResetTime).getTime() : undefined;
    let windowLabel = "Limit";
    if (limit.unit === 1) {
      windowLabel = `${limit.number}d`;
    } else if (limit.unit === 3) {
      windowLabel = `${limit.number}h`;
    } else if (limit.unit === 5) {
      windowLabel = `${limit.number}m`;
    }

    if (limit.type === "TOKENS_LIMIT") {
      windows.push({
        label: `Tokens (${windowLabel})`,
        usedPercent: percent,
        resetAt: nextReset,
      });
    } else if (limit.type === "TIME_LIMIT") {
      windows.push({
        label: "Monthly",
        usedPercent: percent,
        resetAt: nextReset,
      });
    }
  }

  const planName = data.data?.planName || data.data?.plan || undefined;
  return {
    provider: provider as UsageProviderId,
    displayName: PROVIDER_LABELS[provider],
    windows,
    plan: planName,
  };
}

/** @deprecated Use fetchGlmUsage instead */
export async function fetchZaiUsage(
  apiKey: string,
  timeoutMs: number,
  fetchFn: typeof fetch,
): Promise<ProviderUsageSnapshot> {
  return fetchGlmUsage("zai", apiKey, timeoutMs, fetchFn);
}
