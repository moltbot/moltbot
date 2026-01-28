import { html, nothing } from "lit";

import { formatAgo } from "../format";
import type { IMessageStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { renderChannelConfigSection } from "./channels.config";

export function renderIMessageCard(params: {
  props: ChannelsProps;
  imessage?: IMessageStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, imessage, accountCountLabel } = params;
  const configDisabled = props.configSaving || props.configSchemaLoading;

  return html`
    <div class="card card--channel">
      <div class="card-content">
        <div class="card-title">iMessage</div>
        <div class="card-sub">macOS bridge status and channel configuration.</div>
        ${accountCountLabel}

        <div class="status-list" style="margin-top: 16px;">
          <div>
            <span class="label">Configured</span>
            <span>${imessage?.configured ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Running</span>
            <span>${imessage?.running ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Last start</span>
            <span>${imessage?.lastStartAt ? formatAgo(imessage.lastStartAt) : "n/a"}</span>
          </div>
          <div>
            <span class="label">Last probe</span>
            <span>${imessage?.lastProbeAt ? formatAgo(imessage.lastProbeAt) : "n/a"}</span>
          </div>
        </div>

        ${imessage?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
              Probe ${imessage.probe.ok ? "ok" : "failed"} ·
              ${imessage.probe.error ?? ""}
            </div>`
          : nothing}

        ${renderChannelConfigSection({ channelId: "imessage", props })}
      </div>

      <div class="card-footer">
        ${imessage?.lastError
          ? html`<div class="callout danger" style="margin-bottom: 12px;">
              ${imessage.lastError}
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
