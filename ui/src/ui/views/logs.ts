import { html, nothing } from "lit";

import type { LogEntry, LogLevel } from "../types";
import "../components/button";
import "../components/input";
import "../components/checkbox";

const LEVELS: LogLevel[] = ["trace", "debug", "info", "warn", "error", "fatal"];

export type LogsProps = {
  loading: boolean;
  error: string | null;
  file: string | null;
  entries: LogEntry[];
  filterText: string;
  levelFilters: Record<LogLevel, boolean>;
  autoFollow: boolean;
  truncated: boolean;
  onFilterTextChange: (next: string) => void;
  onLevelToggle: (level: LogLevel, enabled: boolean) => void;
  onToggleAutoFollow: (next: boolean) => void;
  onRefresh: () => void;
  onExport: (lines: string[], label: string) => void;
  onScroll: (event: Event) => void;
};

function formatTime(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString();
}

function matchesFilter(entry: LogEntry, needle: string) {
  if (!needle) return true;
  const haystack = [entry.message, entry.subsystem, entry.raw]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(needle);
}

export function renderLogs(props: LogsProps) {
  const needle = props.filterText.trim().toLowerCase();
  const levelFiltered = LEVELS.some((level) => !props.levelFilters[level]);
  const filtered = props.entries.filter((entry) => {
    if (entry.level && !props.levelFilters[entry.level]) return false;
    return matchesFilter(entry, needle);
  });
  const exportLabel = needle || levelFiltered ? "filtered" : "visible";

  return html`
    <section class="card">
      <div class="row" style="justify-content: space-between;">
        <div>
          <div class="card-title">Logs</div>
          <div class="card-sub">Gateway file logs (JSONL).</div>
        </div>
        <div class="row" style="gap: 8px;">
          <ui-button ?disabled=${props.loading} @click=${props.onRefresh}>
            ${props.loading ? "Loading…" : "Refresh"}
          </ui-button>
          <ui-button
            ?disabled=${filtered.length === 0}
            @click=${() => props.onExport(filtered.map((entry) => entry.raw), exportLabel)}
          >
            Export ${exportLabel}
          </ui-button>
        </div>
      </div>

      <div style="margin-top: 16px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap;">
        <ui-input
          label="Filter"
          .value=${props.filterText}
          @input=${(e: CustomEvent) => props.onFilterTextChange(e.detail.value)}
          placeholder="Search logs"
          style="width: 240px;"
        ></ui-input>
        <div style="margin-top: 19px;">
          <ui-checkbox
            label="Auto-follow"
            .checked=${props.autoFollow}
            @change=${(e: CustomEvent) => props.onToggleAutoFollow(e.detail.checked)}
          ></ui-checkbox>
        </div>
      </div>

      <div style="margin-top: 16px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
        ${LEVELS.map(
        (level) => html`
            <label class="log-level-filter log-level-filter--${level}" style="display: inline-flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;">
              <input
                type="checkbox"
                .checked=${props.levelFilters[level]}
                @change=${(e: Event) =>
            props.onLevelToggle(level, (e.target as HTMLInputElement).checked)}
                style="display: none;"
              />
              <span class="log-level-filter__checkbox"></span>
              <span class="log-level-filter__label">${level}</span>
            </label>
          `,
      )}
      </div>

      ${props.file
      ? html`<div class="muted" style="margin-top: 12px;">File: ${props.file}</div>`
      : nothing}
      ${props.truncated
      ? html`<div class="callout" style="margin-top: 12px;">
            Log output truncated; showing latest chunk.
          </div>`
      : nothing}
      ${props.error
      ? html`<div class="callout danger" style="margin-top: 12px;">${props.error}</div>`
      : nothing}

      <div class="log-stream" style="margin-top: 16px;" @scroll=${props.onScroll}>
        ${filtered.length === 0
      ? html`<div class="muted" style="padding: 12px;">No log entries.</div>`
      : filtered.map(
        (entry) => html`
                <div class="log-row">
                  <div class="log-time mono">${formatTime(entry.time)}</div>
                  <div class="log-level ${entry.level ?? ""}">${entry.level ?? ""}</div>
                  <div class="log-subsystem mono">${entry.subsystem ?? ""}</div>
                  <div class="log-message mono">${entry.message ?? entry.raw}</div>
                </div>
              `,
      )}
      </div>
    </section>
  `;
}
