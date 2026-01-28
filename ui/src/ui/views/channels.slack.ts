import { html, nothing } from "lit";

import { formatAgo } from "../format";
import type { SlackStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { renderChannelConfigSection } from "./channels.config";

export function renderSlackCard(params: {
  props: ChannelsProps;
  slack?: SlackStatus | null;
  accountCountLabel: unknown;
}) {
  const { props, slack, accountCountLabel } = params;
  const configDisabled = props.configSaving || props.configSchemaLoading;

  return html`
    <div class="card card--channel">
      <div class="card-content">
        <div class="card-title">Slack</div>
        <div class="card-sub">Socket mode status and channel configuration.</div>
        ${accountCountLabel}

        <div class="status-list" style="margin-top: 16px;">
          <div>
            <span class="label">Configured</span>
            <span>${slack?.configured ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Running</span>
            <span>${slack?.running ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Last start</span>
            <span>${slack?.lastStartAt ? formatAgo(slack.lastStartAt) : "n/a"}</span>
          </div>
          <div>
            <span class="label">Last probe</span>
            <span>${slack?.lastProbeAt ? formatAgo(slack.lastProbeAt) : "n/a"}</span>
          </div>
        </div>

        ${slack?.probe
          ? html`<div class="callout" style="margin-top: 12px;">
              Probe ${slack.probe.ok ? "ok" : "failed"} ·
              ${slack.probe.status ?? ""} ${slack.probe.error ?? ""}
            </div>`
          : nothing}

        ${renderChannelConfigSection({ channelId: "slack", props })}
      </div>

      <div class="card-footer">
        ${slack?.lastError
          ? html`<div class="callout danger" style="margin-bottom: 12px;">
              ${slack.lastError}
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
