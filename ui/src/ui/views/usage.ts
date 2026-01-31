import { html, nothing } from "lit";

import { formatAgo } from "../format";
import type {
  CostUsageDailyEntry,
  CostUsageSummary,
  CostUsageTotals,
  ProviderUsageSnapshot,
  UsageProviderSummary,
} from "../controllers/usage";

// ── Props ────────────────────────────────────────────────────

export type UsageProps = {
  loading: boolean;
  error: string | null;
  costSummary: CostUsageSummary | null;
  providerSummary: UsageProviderSummary | null;
  days: number;
  onDaysChange: (days: number) => void;
  onRefresh: () => void;
};

// ── Helpers ──────────────────────────────────────────────────

const PERIOD_OPTIONS = [7, 14, 30, 90] as const;

function formatCost(value: number): string {
  if (value === 0) return "$0.00";
  if (value < 0) return `-${formatCost(Math.abs(value))}`;
  if (value < 0.01) return `$${value.toFixed(4)}`;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatTokens(value: number): string {
  if (value === 0) return "0";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

function formatResetAt(ms?: number): string {
  if (!ms) return "";
  const diff = ms - Date.now();
  if (diff <= 0) return "reset due";
  const hours = Math.floor(diff / 3_600_000);
  const minutes = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 0) return `resets in ${hours}h ${minutes}m`;
  return `resets in ${minutes}m`;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function barColor(percent: number): string {
  if (percent >= 90) return "var(--color-danger, #ef4444)";
  if (percent >= 70) return "var(--color-warning, #f59e0b)";
  return "var(--color-accent, #3b82f6)";
}

function costBarColor(index: number): string {
  const palette = [
    "var(--color-accent, #3b82f6)",
    "var(--color-info, #06b6d4)",
    "var(--color-success, #22c55e)",
    "var(--color-warning, #f59e0b)",
  ];
  return palette[index % palette.length];
}

// ── Provider quota section ───────────────────────────────────

function renderProviderCard(provider: ProviderUsageSnapshot) {
  if (provider.error) {
    return html`
      <div class="card" style="margin-bottom: 12px;">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div>
            <strong>${provider.displayName}</strong>
            ${
              provider.plan
                ? html`<span class="muted" style="margin-left: 8px;">${provider.plan}</span>`
                : nothing
            }
          </div>
          <span class="muted">${provider.error}</span>
        </div>
      </div>
    `;
  }

  if (!provider.windows.length) {
    return html`
      <div class="card" style="margin-bottom: 12px;">
        <div class="row" style="justify-content: space-between; align-items: center;">
          <div>
            <strong>${provider.displayName}</strong>
            ${
              provider.plan
                ? html`<span class="muted" style="margin-left: 8px;">${provider.plan}</span>`
                : nothing
            }
          </div>
          <span class="muted">No usage windows</span>
        </div>
      </div>
    `;
  }

  return html`
    <div class="card" style="margin-bottom: 12px;">
      <div style="margin-bottom: 8px;">
        <strong>${provider.displayName}</strong>
        ${
          provider.plan
            ? html`<span class="muted" style="margin-left: 8px;">${provider.plan}</span>`
            : nothing
        }
      </div>
      ${provider.windows.map((w) => {
        const pct = clampPercent(w.usedPercent);
        return html`
          <div style="margin-bottom: 8px;">
            <div class="row" style="justify-content: space-between; font-size: 0.85em; margin-bottom: 4px;">
              <span>${w.label}</span>
              <span>
                <strong>${pct.toFixed(0)}%</strong>
                ${
                  w.resetAt
                    ? html`<span class="muted" style="margin-left: 6px;">${formatResetAt(w.resetAt)}</span>`
                    : nothing
                }
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow=${pct}
              aria-valuemin="0"
              aria-valuemax="100"
              aria-label="${w.label} usage"
              style="
                height: 8px;
                background: var(--color-surface-alt, #1e293b);
                border-radius: 4px;
                overflow: hidden;
            ">
              <div style="
                height: 100%;
                width: ${pct}%;
                background: ${barColor(pct)};
                border-radius: 4px;
                transition: width 0.3s ease;
              "></div>
            </div>
          </div>
        `;
      })}
    </div>
  `;
}

function renderProviderQuotas(summary: UsageProviderSummary | null) {
  if (!summary || !summary.providers.length) {
    return html`
      <div class="card">
        <div class="card-title">Provider Quotas</div>
        <div class="card-sub">No provider usage data available.</div>
        <div class="muted" style="margin-top: 12px; font-size: 0.85em">
          Using Claude Code OAuth? Plan quota is not available programmatically.
          <a
            href="https://claude.ai/settings/usage"
            target="_blank"
            rel="noopener"
            style="color: var(--color-accent, #3b82f6)"
          >
            Check your usage at claude.ai →
          </a>
        </div>
      </div>
    `;
  }

  const active = summary.providers.filter((p) => !p.error);
  const errored = summary.providers.filter((p) => p.error);

  return html`
    <div class="card">
      <div class="card-title">Provider Quotas</div>
      <div class="card-sub">Current usage windows across configured providers.</div>
      <div style="margin-top: 16px;">
        ${active.map((p) => renderProviderCard(p))}
        ${
          errored.length
            ? html`
              <details style="margin-top: 8px;">
                <summary class="muted" style="cursor: pointer; font-size: 0.85em;">
                  ${errored.length} unavailable provider${errored.length > 1 ? "s" : ""}
                </summary>
                <div style="margin-top: 8px;">
                  ${errored.map((p) => renderProviderCard(p))}
                </div>
              </details>
            `
            : nothing
        }
      </div>
    </div>
  `;
}

// ── Cost totals section ──────────────────────────────────────

function renderTotals(totals: CostUsageTotals, days: number) {
  return html`
    <div class="card">
      <div class="card-title">Cost Summary</div>
      <div class="card-sub">Aggregate token usage and estimated cost over the last ${days} days.</div>
      <div class="stat-grid" style="margin-top: 16px;">
        <div class="stat">
          <div class="stat-label">Total Cost</div>
          <div class="stat-value">${formatCost(totals.totalCost)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Total Tokens</div>
          <div class="stat-value">${formatTokens(totals.totalTokens)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Input</div>
          <div class="stat-value">${formatTokens(totals.input)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Output</div>
          <div class="stat-value">${formatTokens(totals.output)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Cache Read</div>
          <div class="stat-value">${formatTokens(totals.cacheRead)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">Cache Write</div>
          <div class="stat-value">${formatTokens(totals.cacheWrite)}</div>
        </div>
      </div>
      ${
        totals.missingCostEntries > 0
          ? html`
            <div class="muted" style="margin-top: 12px; font-size: 0.85em;">
              ⚠ ${totals.missingCostEntries} entries missing cost data — totals are estimates.
            </div>
          `
          : nothing
      }
    </div>
  `;
}

// ── Daily cost bar chart ─────────────────────────────────────

function renderDailyChart(daily: CostUsageDailyEntry[]) {
  if (!daily.length) {
    return html`
      <div class="card">
        <div class="card-title">Daily Cost</div>
        <div class="card-sub">No daily cost data for this period.</div>
      </div>
    `;
  }

  const maxCost = Math.max(...daily.map((d) => d.totalCost), 0.01);
  const labelStride = Math.ceil(daily.length / 12);

  return html`
    <div class="card">
      <div class="card-title">Daily Cost</div>
      <div class="card-sub">Estimated cost per day.</div>
      <div style="
        margin-top: 16px;
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 160px;
        padding-bottom: 24px;
        position: relative;
      ">
        ${daily.map((d, i) => {
          const pct = (d.totalCost / maxCost) * 100;
          const barHeight = Math.max(pct, 1);
          const label = d.date.slice(5); /* MM-DD */
          return html`
            <div style="
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              height: 100%;
              justify-content: flex-end;
              position: relative;
            " title="${d.date}: ${formatCost(d.totalCost)} — ${formatTokens(d.totalTokens)} tokens">
              <div style="
                width: 100%;
                max-width: 32px;
                height: ${barHeight}%;
                min-height: 2px;
                background: ${costBarColor(i)};
                border-radius: 3px 3px 0 0;
                transition: height 0.3s ease;
              "></div>
              <div style="
                position: absolute;
                bottom: -20px;
                font-size: 0.65em;
                color: var(--color-muted, #94a3b8);
                white-space: nowrap;
                transform: rotate(-45deg);
                transform-origin: top left;
              ">${i % labelStride === 0 ? label : ""}</div>
            </div>
          `;
        })}
      </div>
      <div class="row" style="justify-content: space-between; margin-top: 8px; font-size: 0.8em;">
        <span class="muted">${daily[0]?.date ?? ""}</span>
        <span class="muted">max: ${formatCost(maxCost)}</span>
        <span class="muted">${daily[daily.length - 1]?.date ?? ""}</span>
      </div>
    </div>
  `;
}

// ── Daily token breakdown chart ──────────────────────────────

function renderTokenBreakdown(daily: CostUsageDailyEntry[]) {
  if (!daily.length) return nothing;

  const maxTokens = Math.max(...daily.map((d) => d.totalTokens), 1);
  const tokenLabelStride = Math.ceil(daily.length / 12);

  return html`
    <div class="card">
      <div class="card-title">Daily Tokens</div>
      <div class="card-sub">Token volume per day — input, output, and cache.</div>
      <div style="
        margin-top: 16px;
        display: flex;
        align-items: flex-end;
        gap: 2px;
        height: 120px;
        padding-bottom: 24px;
        position: relative;
      ">
        ${daily.map((d, i) => {
          const totalPct = (d.totalTokens / maxTokens) * 100;
          const inputPct = d.totalTokens > 0 ? (d.input / d.totalTokens) * totalPct : 0;
          const outputPct = d.totalTokens > 0 ? (d.output / d.totalTokens) * totalPct : 0;
          const cachePct = Math.max(totalPct - inputPct - outputPct, 0);
          const label = d.date.slice(5);
          return html`
            <div style="
              flex: 1;
              display: flex;
              flex-direction: column;
              align-items: center;
              height: 100%;
              justify-content: flex-end;
              position: relative;
            " title="${d.date}: ${formatTokens(d.totalTokens)} tokens (in: ${formatTokens(d.input)}, out: ${formatTokens(d.output)})">
              <div style="
                width: 100%;
                max-width: 32px;
                display: flex;
                flex-direction: column;
                justify-content: flex-end;
                height: ${Math.max(totalPct, 1)}%;
                min-height: 2px;
                border-radius: 3px 3px 0 0;
                overflow: hidden;
              ">
                <div style="height: ${cachePct}%; background: var(--color-success, #22c55e); min-height: 0;"></div>
                <div style="height: ${outputPct}%; background: var(--color-warning, #f59e0b); min-height: 0;"></div>
                <div style="height: ${inputPct}%; background: var(--color-accent, #3b82f6); min-height: 0;"></div>
              </div>
              <div style="
                position: absolute;
                bottom: -20px;
                font-size: 0.65em;
                color: var(--color-muted, #94a3b8);
                white-space: nowrap;
                transform: rotate(-45deg);
                transform-origin: top left;
              ">${i % tokenLabelStride === 0 ? label : ""}</div>
            </div>
          `;
        })}
      </div>
      <div class="row" style="gap: 16px; margin-top: 8px; font-size: 0.8em;">
        <span style="display: flex; align-items: center; gap: 4px;">
          <span style="width: 10px; height: 10px; border-radius: 2px; background: var(--color-accent, #3b82f6);"></span>
          Input
        </span>
        <span style="display: flex; align-items: center; gap: 4px;">
          <span style="width: 10px; height: 10px; border-radius: 2px; background: var(--color-warning, #f59e0b);"></span>
          Output
        </span>
        <span style="display: flex; align-items: center; gap: 4px;">
          <span style="width: 10px; height: 10px; border-radius: 2px; background: var(--color-success, #22c55e);"></span>
          Cache
        </span>
      </div>
    </div>
  `;
}

// ── Main render ──────────────────────────────────────────────

export function renderUsage(props: UsageProps) {
  return html`
    <section>
      <!-- Toolbar -->
      <div class="card" style="margin-bottom: 16px;">
        <div class="row" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
          <div class="row" style="gap: 8px; align-items: center;">
            <span style="font-weight: 500;">Period:</span>
            ${PERIOD_OPTIONS.map(
              (d) => html`
                <button
                  class="btn ${props.days === d ? "primary" : ""}"
                  aria-pressed=${props.days === d}
                  @click=${() => props.onDaysChange(d)}
                >${d}d</button>
              `,
            )}
          </div>
          <div class="row" style="gap: 8px; align-items: center;">
            ${
              props.costSummary || props.providerSummary
                ? html`<span class="muted" style="font-size: 0.85em;">
                  Updated ${formatAgo(
                    Math.max(
                      props.costSummary?.updatedAt ?? 0,
                      props.providerSummary?.updatedAt ?? 0,
                    ),
                  )}
                </span>`
                : nothing
            }
            <button
              class="btn"
              @click=${props.onRefresh}
              ?disabled=${props.loading}
            >${props.loading ? "Loading…" : "Refresh"}</button>
          </div>
        </div>
      </div>

      ${
        props.error
          ? html`<div class="card" style="margin-bottom: 16px;">
            <div class="pill danger">${props.error}</div>
          </div>`
          : nothing
      }

      ${
        props.loading && !props.costSummary && !props.providerSummary
          ? html`
              <div class="card"><div class="muted">Loading usage data…</div></div>
            `
          : nothing
      }

      <!-- Provider Quotas -->
      ${renderProviderQuotas(props.providerSummary)}

      <!-- Cost Summary -->
      ${
        props.costSummary
          ? html`
            <div style="margin-top: 16px;">
              ${renderTotals(props.costSummary.totals, props.costSummary.days)}
            </div>
          `
          : nothing
      }

      <!-- Daily Cost Chart -->
      ${
        props.costSummary
          ? html`
            <div class="grid grid-cols-2" style="margin-top: 16px;">
              ${renderDailyChart(props.costSummary.daily)}
              ${renderTokenBreakdown(props.costSummary.daily)}
            </div>
          `
          : nothing
      }
    </section>
  `;
}
