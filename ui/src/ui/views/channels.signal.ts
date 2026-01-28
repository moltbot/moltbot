import { html, nothing } from "lit";

import { formatAgo } from "../format";
import type { SignalStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { renderChannelConfigSection } from "./channels.config";

export function renderSignalCard(params: {
  props: ChannelsProps;
  signal?: SignalStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, signal, accountCountLabel } = params;
  const configDisabled = props.configSaving || props.configSchemaLoading;

  return html`
    <div class="card card--channel">
      <div class="card-content">
        <div class="card-title">Signal</div>
        <div class="card-sub">signal-cli status and channel configuration.</div>
        ${accountCountLabel}

        <div class="status-list" style="margin-top: 16px;">
          <div>
            <span class="label">Configured</span>
            <span>${signal?.configured ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Running</span>
            <span>${signal?.running ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Base URL</span>
            <span>${signal?.baseUrl ?? "n/a"}</span>
          </div>
          <div>
            <span class="label">Last start</span>
            <span>${signal?.lastStartAt ? formatAgo(signal.lastStartAt) : "n/a"}</span>
          </div>
          <div>
            <span class="label">Last probe</span>
            <span>${signal?.lastProbeAt ? formatAgo(signal.lastProbeAt) : "n/a"}</span>
          </div>
        </div>

        ${signal?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
              Probe ${signal.probe.ok ? "ok" : "failed"} ·
              ${signal.probe.status ?? ""} ${signal.probe.error ?? ""}
            </div>`
          : nothing}

        ${renderChannelConfigSection({ channelId: "signal", props })}
      </div>

      <div class="card-footer">
        ${signal?.lastError
          ? html`<div class="callout danger" style="margin-bottom: 12px;">
              ${signal.lastError}
            </div>`
          : nothing}

        <div class="row" style="gap: 8px; align-items: center; flex-wrap: wrap;">
          <ui-button @click=${() => props.onRefresh(true)}>
            Probe
          </ui-button>
          <div style="margin-left: auto; display: flex; gap: 8px;">
            <ui-button
              variant="primary"
              ?disabled=${configDisabled || !props.configFormDirty}
              @click=${() => props.onConfigSave()}
            >
              ${props.configSaving ? "Saving…" : "Save Config"}
            </ui-button>
            <ui-button
              ?disabled=${configDisabled}
              @click=${() => props.onConfigReload()}
            >
              Reload
            </ui-button>
          </div>
        </div>
      </div>
    </div>
  `;
}
