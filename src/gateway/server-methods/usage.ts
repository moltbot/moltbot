import { loadConfig } from "../../config/config.js";
import type {
  CostUsageDailyEntry,
  CostUsageSummary,
  CostUsageTotals,
} from "../../infra/session-cost-usage.js";
import { loadCostUsageSummary } from "../../infra/session-cost-usage.js";
import { loadProviderUsageSummary } from "../../infra/provider-usage.js";
import type { GatewayRequestHandlers } from "./types.js";

const COST_USAGE_CACHE_TTL_MS = 30_000;

type CostUsageCacheEntry = {
  summary?: CostUsageSummary;
  updatedAt?: number;
  inFlight?: Promise<CostUsageSummary>;
};

const costUsageCache = new Map<string, CostUsageCacheEntry>();

const parseDays = (raw: unknown): number => {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.floor(raw);
  }
  if (typeof raw === "string" && raw.trim() !== "") {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) {
      return Math.floor(parsed);
    }
  }
  return 30;
};

const emptyTotals = (): CostUsageTotals => ({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  totalCost: 0,
  missingCostEntries: 0,
});

const addTotals = (target: CostUsageTotals, source: CostUsageTotals) => {
  target.input += source.input;
  target.output += source.output;
  target.cacheRead += source.cacheRead;
  target.cacheWrite += source.cacheWrite;
  target.totalTokens += source.totalTokens;
  target.totalCost += source.totalCost;
  target.missingCostEntries += source.missingCostEntries;
};

/**
 * Merge summaries from multiple agents into a single aggregate.
 */
function mergeCostUsageSummaries(summaries: CostUsageSummary[], days: number): CostUsageSummary {
  const totals = emptyTotals();
  const dailyMap = new Map<string, CostUsageTotals>();

  for (const summary of summaries) {
    addTotals(totals, summary.totals);
    for (const entry of summary.daily) {
      const existing = dailyMap.get(entry.date) ?? emptyTotals();
      addTotals(existing, entry);
      dailyMap.set(entry.date, existing);
    }
  }

  const daily: CostUsageDailyEntry[] = Array.from(dailyMap.entries())
    .map(([date, bucket]) => Object.assign({ date }, bucket))
    .toSorted((a, b) => a.date.localeCompare(b.date));

  return { updatedAt: Date.now(), days, daily, totals };
}

function resolveAgentIds(config: ReturnType<typeof loadConfig>): string[] {
  const agents = config?.agents?.list;
  if (!Array.isArray(agents) || agents.length === 0) {
    return []; // falls back to default in loadCostUsageSummary
  }
  return agents.map((a: { id?: string }) => a.id?.trim()).filter((id): id is string => Boolean(id));
}

async function loadCostUsageSummaryCached(params: {
  days: number;
  config: ReturnType<typeof loadConfig>;
}): Promise<CostUsageSummary> {
  const days = Math.max(1, params.days);
  const cacheKey = `all:${days}`;
  const now = Date.now();
  const cached = costUsageCache.get(cacheKey);
  if (cached?.summary && cached.updatedAt && now - cached.updatedAt < COST_USAGE_CACHE_TTL_MS) {
    return cached.summary;
  }

  if (cached?.inFlight) {
    if (cached.summary) {
      return cached.summary;
    }
    return await cached.inFlight;
  }

  const agentIds = resolveAgentIds(params.config);

  const entry: CostUsageCacheEntry = cached ?? {};
  const inFlight = (async () => {
    if (agentIds.length === 0) {
      // No agents configured — use default path
      return loadCostUsageSummary({ days, config: params.config });
    }
    const summaries = await Promise.all(
      agentIds.map((agentId) => loadCostUsageSummary({ days, config: params.config, agentId })),
    );
    return mergeCostUsageSummaries(summaries, days);
  })()
    .then((summary) => {
      costUsageCache.set(cacheKey, { summary, updatedAt: Date.now() });
      return summary;
    })
    .catch((err) => {
      if (entry.summary) {
        return entry.summary;
      }
      throw err;
    })
    .finally(() => {
      const current = costUsageCache.get(cacheKey);
      if (current?.inFlight === inFlight) {
        current.inFlight = undefined;
        costUsageCache.set(cacheKey, current);
      }
    });

  entry.inFlight = inFlight;
  costUsageCache.set(cacheKey, entry);

  if (entry.summary) {
    return entry.summary;
  }
  return await inFlight;
}

export const usageHandlers: GatewayRequestHandlers = {
  "usage.status": async ({ respond }) => {
    const summary = await loadProviderUsageSummary();
    respond(true, summary, undefined);
  },
  "usage.cost": async ({ respond, params }) => {
    const config = loadConfig();
    const days = parseDays(params?.days);
    const summary = await loadCostUsageSummaryCached({ days, config });
    respond(true, summary, undefined);
  },
};
