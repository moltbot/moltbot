import type { GatewayBrowserClient } from "../gateway";

// ── Types matching server-side shapes ────────────────────────

export type CostUsageTotals = {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
  missingCostEntries: number;
};

export type CostUsageDailyEntry = CostUsageTotals & {
  date: string;
};

export type CostUsageSummary = {
  updatedAt: number;
  days: number;
  daily: CostUsageDailyEntry[];
  totals: CostUsageTotals;
};

export type UsageWindow = {
  label: string;
  usedPercent: number;
  resetAt?: number;
};

export type ProviderUsageSnapshot = {
  provider: string;
  displayName: string;
  windows: UsageWindow[];
  plan?: string;
  error?: string;
};

export type UsageProviderSummary = {
  updatedAt: number;
  providers: ProviderUsageSnapshot[];
};

// ── Controller state ─────────────────────────────────────────

export type UsageState = {
  client: GatewayBrowserClient | null;
  connected: boolean;
  usageLoading: boolean;
  usageError: string | null;
  usageCostSummary: CostUsageSummary | null;
  usageProviderSummary: UsageProviderSummary | null;
  usageDays: number;
};

// ── Loaders ──────────────────────────────────────────────────

export async function loadUsage(state: UsageState) {
  if (!state.client || !state.connected) return;
  if (state.usageLoading) return;
  state.usageLoading = true;
  state.usageError = null;
  try {
    const [costRes, statusRes] = await Promise.all([
      state.client.request<CostUsageSummary>("usage.cost", {
        days: state.usageDays,
      }),
      state.client.request<UsageProviderSummary>("usage.status", {}),
    ]);
    state.usageCostSummary = costRes;
    state.usageProviderSummary = statusRes;
  } catch (err) {
    state.usageError = String(err);
  } finally {
    state.usageLoading = false;
  }
}
