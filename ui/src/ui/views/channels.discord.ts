import { html, nothing } from "lit";

import { formatAgo } from "../format";
import type { DiscordStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { renderChannelConfigSection } from "./channels.config";

export function renderDiscordCard(params: {
  props: ChannelsProps;
  discord?: DiscordStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, discord, accountCountLabel } = params;
  const configDisabled = props.configSaving || props.configSchemaLoading;

  return html`
    <div class="card card--channel">
      <div class="card-content">
        <div class="card-title">Discord</div>
        <div class="card-sub">Bot status and channel configuration.</div>
        ${accountCountLabel}

        <div class="status-list" style="margin-top: 16px;">
          <div>
            <span class="label">Configured</span>
            <span>${discord?.configured ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Running</span>
            <span>${discord?.running ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Last start</span>
            <span>${discord?.lastStartAt ? formatAgo(discord.lastStartAt) : "n/a"}</span>
          </div>
          <div>
            <span class="label">Last probe</span>
            <span>${discord?.lastProbeAt ? formatAgo(discord.lastProbeAt) : "n/a"}</span>
          </div>
        </div>

        ${discord?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
              Probe ${discord.probe.ok ? "ok" : "failed"} ·
              ${discord.probe.status ?? ""} ${discord.probe.error ?? ""}
            </div>`
          : nothing}

        ${renderChannelConfigSection({ channelId: "discord", props })}
      </div>

      <div class="card-footer">
        ${discord?.lastError
          ? html`<div class="callout danger" style="margin-bottom: 12px;">
              ${discord.lastError}
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
