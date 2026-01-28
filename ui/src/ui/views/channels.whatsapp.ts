import { html, nothing } from "lit";

import { formatAgo } from "../format";
import type { WhatsAppStatus } from "../types";
import type { ChannelsProps } from "./channels.types";
import { renderChannelConfigSection } from "./channels.config";
import { formatDuration } from "./channels.shared";
import "../components/dropdown-menu";

export function renderWhatsAppCard(params: {
  props: ChannelsProps;
  whatsapp?: WhatsAppStatus;
  accountCountLabel: unknown;
}) {
  const { props, whatsapp, accountCountLabel } = params;

  const menuItems = [
    { label: "Relink", value: "relink", disabled: props.whatsappBusy },
    { label: "Wait for scan", value: "wait", disabled: props.whatsappBusy },
    { label: "Logout", value: "logout", variant: "danger" as const, disabled: props.whatsappBusy },
  ];

  const handleMenuSelect = (e: CustomEvent) => {
    const { value } = e.detail;
    switch (value) {
      case "relink":
        props.onWhatsAppStart(true);
        break;
      case "wait":
        props.onWhatsAppWait();
        break;
      case "logout":
        props.onWhatsAppLogout();
        break;
    }
  };

  const configDisabled = props.configSaving || props.configSchemaLoading;

  return html`
    <div class="card card--channel">
      <div class="card-content">
        <div class="card-title">WhatsApp</div>
        <div class="card-sub">Link WhatsApp Web and monitor connection health.</div>
        ${accountCountLabel}

        <div class="status-list" style="margin-top: 16px;">
          <div>
            <span class="label">Configured</span>
            <span>${whatsapp?.configured ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Linked</span>
            <span>${whatsapp?.linked ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Running</span>
            <span>${whatsapp?.running ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Connected</span>
            <span>${whatsapp?.connected ? "Yes" : "No"}</span>
          </div>
          <div>
            <span class="label">Last connect</span>
            <span>
              ${whatsapp?.lastConnectedAt
                ? formatAgo(whatsapp.lastConnectedAt)
                : "n/a"}
            </span>
          </div>
          <div>
            <span class="label">Last message</span>
            <span>
              ${whatsapp?.lastMessageAt ? formatAgo(whatsapp.lastMessageAt) : "n/a"}
            </span>
          </div>
          <div>
            <span class="label">Auth age</span>
            <span>
              ${whatsapp?.authAgeMs != null
                ? formatDuration(whatsapp.authAgeMs)
                : "n/a"}
            </span>
          </div>
        </div>

        ${props.whatsappMessage
          ? html`<div class="callout" style="margin-top: 12px;">
              ${props.whatsappMessage}
            </div>`
          : nothing}

        ${props.whatsappQrDataUrl
          ? html`<div class="qr-wrap">
              <img src=${props.whatsappQrDataUrl} alt="WhatsApp QR" />
            </div>`
          : nothing}

        ${renderChannelConfigSection({ channelId: "whatsapp", props })}
      </div>

      <div class="card-footer">
        ${whatsapp?.lastError
          ? html`<div class="callout danger" style="margin-bottom: 12px;">
              ${whatsapp.lastError}
            </div>`
          : nothing}

        <div class="row" style="gap: 8px; align-items: center; flex-wrap: wrap;">
          <ui-button
            variant="primary"
            ?disabled=${props.whatsappBusy}
            @click=${() => props.onWhatsAppStart(false)}
          >
            ${props.whatsappBusy ? "Working…" : "Show QR"}
          </ui-button>
          <ui-button @click=${() => props.onRefresh(true)}>
            Refresh
          </ui-button>
          <ui-dropdown-menu
            .items=${menuItems}
            ?disabled=${props.whatsappBusy}
            @select=${handleMenuSelect}
          ></ui-dropdown-menu>
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
