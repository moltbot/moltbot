import { html } from "lit";

import type { GatewayHelloOk } from "../gateway";
import { formatAgo, formatDurationMs } from "../format";
import { formatNextRun } from "../presenter";
import type { UiSettings } from "../storage";
import "../components/button";
import "../components/input";
import "../components/card";
import "../components/badge";

export type OverviewProps = {
  connected: boolean;
  hello: GatewayHelloOk | null;
  settings: UiSettings;
  password: string;
  lastError: string | null;
  presenceCount: number;
  sessionsCount: number | null;
  cronEnabled: boolean | null;
  cronNext: number | null;
  lastChannelsRefresh: number | null;
  onSettingsChange: (next: UiSettings) => void;
  onPasswordChange: (next: string) => void;
  onSessionKeyChange: (next: string) => void;
  onConnect: () => void;
  onRefresh: () => void;
};

export function renderOverview(props: OverviewProps) {
  const snapshot = props.hello?.snapshot as
    | { uptimeMs?: number; policy?: { tickIntervalMs?: number } }
    | undefined;
  const uptime = snapshot?.uptimeMs ? formatDurationMs(snapshot.uptimeMs) : "n/a";
  const tick = snapshot?.policy?.tickIntervalMs
    ? `${snapshot.policy.tickIntervalMs}ms`
    : "n/a";
  const authHint = (() => {
    if (props.connected || !props.lastError) return null;
    const lower = props.lastError.toLowerCase();
    const authFailed = lower.includes("unauthorized") || lower.includes("connect failed");
    if (!authFailed) return null;
    const hasToken = Boolean(props.settings.token.trim());
    const hasPassword = Boolean(props.password.trim());
    if (!hasToken && !hasPassword) {
      return html`
        <div class="muted" style="margin-top: 8px;">
          This gateway requires auth. Add a token or password, then click Connect.
          <div style="margin-top: 6px;">
            <span class="mono">moltbot dashboard --no-open</span> → tokenized URL<br />
            <span class="mono">moltbot doctor --generate-gateway-token</span> → set token
          </div>
          <div style="margin-top: 6px;">
            <a
              class="session-link"
              href="https://docs.molt.bot/web/dashboard"
              target="_blank"
              rel="noreferrer"
              title="Control UI auth docs (opens in new tab)"
              >Docs: Control UI auth</a
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="muted" style="margin-top: 8px;">
        Auth failed. Re-copy a tokenized URL with
        <span class="mono">moltbot dashboard --no-open</span>, or update the token,
        then click Connect.
        <div style="margin-top: 6px;">
          <a
            class="session-link"
            href="https://docs.molt.bot/web/dashboard"
            target="_blank"
            rel="noreferrer"
            title="Control UI auth docs (opens in new tab)"
            >Docs: Control UI auth</a
          >
        </div>
      </div>
    `;
  })();
  const insecureContextHint = (() => {
    if (props.connected || !props.lastError) return null;
    const isSecureContext = typeof window !== "undefined" ? window.isSecureContext : true;
    if (isSecureContext !== false) return null;
    const lower = props.lastError.toLowerCase();
    if (!lower.includes("secure context") && !lower.includes("device identity required")) {
      return null;
    }
    return html`
      <div class="muted" style="margin-top: 8px;">
        This page is HTTP, so the browser blocks device identity. Use HTTPS (Tailscale Serve) or
        open <span class="mono">http://127.0.0.1:18789</span> on the gateway host.
        <div style="margin-top: 6px;">
          If you must stay on HTTP, set
          <span class="mono">gateway.controlUi.allowInsecureAuth: true</span> (token-only).
        </div>
        <div style="margin-top: 6px;">
          <a
            class="session-link"
            href="https://docs.molt.bot/gateway/tailscale"
            target="_blank"
            rel="noreferrer"
            title="Tailscale Serve docs (opens in new tab)"
            >Docs: Tailscale Serve</a
          >
          <span class="muted"> · </span>
          <a
            class="session-link"
            href="https://docs.molt.bot/web/control-ui#insecure-http"
            target="_blank"
            rel="noreferrer"
            title="Insecure HTTP docs (opens in new tab)"
            >Docs: Insecure HTTP</a
          >
        </div>
      </div>
    `;
  })();

  return html`
    <section class="grid grid-cols-2">
      <ui-card>
        <div slot="header">
          <div class="card-title">Gateway Access</div>
          <div class="card-desc">Where the dashboard connects and how it authenticates.</div>
        </div>
        <div class="form-grid">
          <ui-input
            label="WebSocket URL"
            .value=${props.settings.gatewayUrl}
            placeholder="ws://100.x.y.z:18789"
            @input=${(e: CustomEvent) => {
              props.onSettingsChange({ ...props.settings, gatewayUrl: e.detail.value });
            }}
          ></ui-input>
          <ui-input
            label="Gateway Token"
            .value=${props.settings.token}
            placeholder="CLAWDBOT_GATEWAY_TOKEN"
            @input=${(e: CustomEvent) => {
              props.onSettingsChange({ ...props.settings, token: e.detail.value });
            }}
          ></ui-input>
          <ui-input
            label="Password (not stored)"
            type="password"
            .value=${props.password}
            placeholder="system or shared password"
            @input=${(e: CustomEvent) => {
              props.onPasswordChange(e.detail.value);
            }}
          ></ui-input>
          <ui-input
            label="Default Session Key"
            .value=${props.settings.sessionKey}
            @input=${(e: CustomEvent) => {
              props.onSessionKeyChange(e.detail.value);
            }}
          ></ui-input>
        </div>
        <div class="row" style="margin-top: 14px;">
          <ui-button variant="primary" @click=${() => props.onConnect()}>Connect</ui-button>
          <ui-button variant="secondary" @click=${() => props.onRefresh()}>Refresh</ui-button>
          <span class="muted">Click Connect to apply connection changes.</span>
        </div>
      </ui-card>

      <ui-card>
        <div slot="header">
          <div class="card-title">Snapshot</div>
          <div class="card-desc">Latest gateway handshake information.</div>
        </div>
        <div class="stat-grid">
          <div class="stat">
            <div class="stat-label">Status</div>
            <div class="stat-value">
              <ui-badge variant=${props.connected ? "success" : "secondary"}>
                ${props.connected ? "Connected" : "Disconnected"}
              </ui-badge>
            </div>
          </div>
          <div class="stat">
            <div class="stat-label">Uptime</div>
            <div class="stat-value">${uptime}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Tick Interval</div>
            <div class="stat-value">${tick}</div>
          </div>
          <div class="stat">
            <div class="stat-label">Last Channels Refresh</div>
            <div class="stat-value">
              ${props.lastChannelsRefresh
                ? formatAgo(props.lastChannelsRefresh)
                : "n/a"}
            </div>
          </div>
        </div>
        ${props.lastError
          ? html`<div class="callout danger" style="margin-top: 14px;">
              <div>${props.lastError}</div>
              ${authHint ?? ""}
              ${insecureContextHint ?? ""}
            </div>`
          : html`<div class="callout" style="margin-top: 14px;">
              Use Channels to link WhatsApp, Telegram, Discord, Signal, or iMessage.
            </div>`}
      </ui-card>
    </section>

    <section class="grid grid-cols-3" style="margin-top: 18px;">
      <ui-card class="stat-card">
        <div class="stat-label">Instances</div>
        <div class="stat-value">${props.presenceCount}</div>
        <div class="muted">Presence beacons in the last 5 minutes.</div>
      </ui-card>
      <ui-card class="stat-card">
        <div class="stat-label">Sessions</div>
        <div class="stat-value">${props.sessionsCount ?? "n/a"}</div>
        <div class="muted">Recent session keys tracked by the gateway.</div>
      </ui-card>
      <ui-card class="stat-card">
        <div class="stat-label">Cron</div>
        <div class="stat-value">
          ${props.cronEnabled == null
            ? "n/a"
            : props.cronEnabled
              ? "Enabled"
              : "Disabled"}
        </div>
        <div class="muted">Next wake ${formatNextRun(props.cronNext)}</div>
      </ui-card>
    </section>

    <ui-card style="margin-top: 18px;">
      <div slot="header">
        <div class="card-title">Notes</div>
        <div class="card-desc">Quick reminders for remote control setups.</div>
      </div>
      <div class="note-grid">
        <div>
          <div class="note-title">Tailscale serve</div>
          <div class="muted">
            Prefer serve mode to keep the gateway on loopback with tailnet auth.
          </div>
        </div>
        <div>
          <div class="note-title">Session hygiene</div>
          <div class="muted">Use /new or sessions.patch to reset context.</div>
        </div>
        <div>
          <div class="note-title">Cron reminders</div>
          <div class="muted">Use isolated sessions for recurring runs.</div>
        </div>
      </div>
    </ui-card>
  `;
}
