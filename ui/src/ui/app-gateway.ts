import { loadChatHistory } from "./controllers/chat";
import { loadDevices } from "./controllers/devices";
import { loadNodes } from "./controllers/nodes";
import { loadAgents } from "./controllers/agents";
import type { GatewayEventFrame, GatewayHelloOk } from "./gateway";
import { GatewayBrowserClient } from "./gateway";
import type { EventLogEntry } from "./app-events";
import type { AgentsListResult, PresenceEntry, HealthSnapshot, StatusSummary } from "./types";
import type { Tab } from "./navigation";
import type { UiSettings } from "./storage";
import { handleAgentEvent, resetToolStream, type AgentEventPayload } from "./app-tool-stream";
import { CHAT_SESSIONS_ACTIVE_MINUTES, flushChatQueueForEvent } from "./app-chat";
import { applySettings, loadCron, refreshActiveTab, setLastActiveSessionKey } from "./app-settings";
import { handleChatEvent, type ChatEventPayload } from "./controllers/chat";
import {
  addExecApproval,
  parseExecApprovalRequested,
  parseExecApprovalResolved,
  removeExecApproval,
} from "./controllers/exec-approval";
import type { OpenClawApp } from "./app";
import type { ExecApprovalRequest } from "./controllers/exec-approval";
import { loadAssistantIdentity } from "./controllers/assistant-identity";
import { loadSessions, patchSession } from "./controllers/sessions";
import type { SessionsListResult } from "./types";

type GatewayHost = {
  settings: UiSettings;
  password: string;
  client: GatewayBrowserClient | null;
  connected: boolean;
  hello: GatewayHelloOk | null;
  lastError: string | null;
  onboarding?: boolean;
  eventLogBuffer: EventLogEntry[];
  eventLog: EventLogEntry[];
  tab: Tab;
  presenceEntries: PresenceEntry[];
  presenceError: string | null;
  presenceStatus: StatusSummary | null;
  agentsLoading: boolean;
  agentsList: AgentsListResult | null;
  agentsError: string | null;
  debugHealth: HealthSnapshot | null;
  assistantName: string;
  assistantAvatar: string | null;
  assistantAgentId: string | null;
  sessionKey: string;
  chatRunId: string | null;
  refreshSessionsAfterChat: Set<string>;
  execApprovalQueue: ExecApprovalRequest[];
  execApprovalError: string | null;
  chatMessages: unknown[];
};

type SessionDefaultsSnapshot = {
  defaultAgentId?: string;
  mainKey?: string;
  mainSessionKey?: string;
  scope?: string;
};

function normalizeSessionKeyForDefaults(
  value: string | undefined,
  defaults: SessionDefaultsSnapshot,
): string {
  const raw = (value ?? "").trim();
  const mainSessionKey = defaults.mainSessionKey?.trim();
  if (!mainSessionKey) return raw;
  if (!raw) return mainSessionKey;
  const mainKey = defaults.mainKey?.trim() || "main";
  const defaultAgentId = defaults.defaultAgentId?.trim();
  const isAlias =
    raw === "main" ||
    raw === mainKey ||
    (defaultAgentId &&
      (raw === `agent:${defaultAgentId}:main` || raw === `agent:${defaultAgentId}:${mainKey}`));
  return isAlias ? mainSessionKey : raw;
}

function applySessionDefaults(host: GatewayHost, defaults?: SessionDefaultsSnapshot) {
  if (!defaults?.mainSessionKey) return;
  const resolvedSessionKey = normalizeSessionKeyForDefaults(host.sessionKey, defaults);
  const resolvedSettingsSessionKey = normalizeSessionKeyForDefaults(
    host.settings.sessionKey,
    defaults,
  );
  const resolvedLastActiveSessionKey = normalizeSessionKeyForDefaults(
    host.settings.lastActiveSessionKey,
    defaults,
  );
  const nextSessionKey = resolvedSessionKey || resolvedSettingsSessionKey || host.sessionKey;
  const nextSettings = {
    ...host.settings,
    sessionKey: resolvedSettingsSessionKey || nextSessionKey,
    lastActiveSessionKey: resolvedLastActiveSessionKey || nextSessionKey,
  };
  const shouldUpdateSettings =
    nextSettings.sessionKey !== host.settings.sessionKey ||
    nextSettings.lastActiveSessionKey !== host.settings.lastActiveSessionKey;
  if (nextSessionKey !== host.sessionKey) {
    host.sessionKey = nextSessionKey;
  }
  if (shouldUpdateSettings) {
    applySettings(host as unknown as Parameters<typeof applySettings>[0], nextSettings);
  }
}

export function connectGateway(host: GatewayHost) {
  host.lastError = null;
  host.hello = null;
  host.connected = false;
  host.execApprovalQueue = [];
  host.execApprovalError = null;

  host.client?.stop();
  host.client = new GatewayBrowserClient({
    url: host.settings.gatewayUrl,
    token: host.settings.token.trim() ? host.settings.token : undefined,
    password: host.password.trim() ? host.password : undefined,
    clientName: "openclaw-control-ui",
    mode: "webchat",
    onHello: (hello) => {
      host.connected = true;
      host.lastError = null;
      host.hello = hello;
      applySnapshot(host, hello);
      // Reset orphaned chat run state from before disconnect.
      // Any in-flight run's final event was lost during the disconnect window.
      host.chatRunId = null;
      (host as unknown as { chatStream: string | null }).chatStream = null;
      (host as unknown as { chatStreamStartedAt: number | null }).chatStreamStartedAt = null;
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void loadAssistantIdentity(host as unknown as OpenClawApp);
      void loadAgents(host as unknown as OpenClawApp);
      void loadNodes(host as unknown as OpenClawApp, { quiet: true });
      void loadDevices(host as unknown as OpenClawApp, { quiet: true });
      void refreshActiveTab(host as unknown as Parameters<typeof refreshActiveTab>[0]).then(() => {
        void batchRenameUnnamedSessions(host);
      });
    },
    onClose: ({ code, reason }) => {
      host.connected = false;
      // Code 1012 = Service Restart (expected during config saves, don't show as error)
      if (code !== 1012) {
        host.lastError = `disconnected (${code}): ${reason || "no reason"}`;
      }
    },
    onEvent: (evt) => handleGatewayEvent(host, evt),
    onGap: ({ expected, received }) => {
      host.lastError = `event gap detected (expected seq ${expected}, got ${received}); refresh recommended`;
    },
  });
  host.client.start();
}

export function handleGatewayEvent(host: GatewayHost, evt: GatewayEventFrame) {
  try {
    handleGatewayEventUnsafe(host, evt);
  } catch (err) {
    console.error("[gateway] handleGatewayEvent error:", evt.event, err);
  }
}

function handleGatewayEventUnsafe(host: GatewayHost, evt: GatewayEventFrame) {
  host.eventLogBuffer = [
    { ts: Date.now(), event: evt.event, payload: evt.payload },
    ...host.eventLogBuffer,
  ].slice(0, 250);
  if (host.tab === "debug") {
    host.eventLog = host.eventLogBuffer;
  }

  if (evt.event === "agent") {
    if (host.onboarding) return;
    handleAgentEvent(
      host as unknown as Parameters<typeof handleAgentEvent>[0],
      evt.payload as AgentEventPayload | undefined,
    );
    return;
  }

  if (evt.event === "chat") {
    const payload = evt.payload as ChatEventPayload | undefined;
    if (payload?.sessionKey) {
      setLastActiveSessionKey(
        host as unknown as Parameters<typeof setLastActiveSessionKey>[0],
        payload.sessionKey,
      );
    }
    const state = handleChatEvent(host as unknown as OpenClawApp, payload);
    if (state === "final" || state === "error" || state === "aborted") {
      resetToolStream(host as unknown as Parameters<typeof resetToolStream>[0]);
      void flushChatQueueForEvent(host as unknown as Parameters<typeof flushChatQueueForEvent>[0]);
      const runId = payload?.runId;
      if (runId && host.refreshSessionsAfterChat.has(runId)) {
        host.refreshSessionsAfterChat.delete(runId);
        if (state === "final") {
          void loadSessions(host as unknown as OpenClawApp, {
            activeMinutes: CHAT_SESSIONS_ACTIVE_MINUTES,
          });
        }
      }
    }
    if (state === "final") {
      void loadChatHistory(host as unknown as OpenClawApp);
      void maybeAutoRenameSession(host);
    }
    return;
  }

  if (evt.event === "presence") {
    const payload = evt.payload as { presence?: PresenceEntry[] } | undefined;
    if (payload?.presence && Array.isArray(payload.presence)) {
      host.presenceEntries = payload.presence;
      host.presenceError = null;
      host.presenceStatus = null;
    }
    return;
  }

  if (evt.event === "cron" && host.tab === "cron") {
    void loadCron(host as unknown as Parameters<typeof loadCron>[0]);
  }

  if (evt.event === "device.pair.requested" || evt.event === "device.pair.resolved") {
    void loadDevices(host as unknown as OpenClawApp, { quiet: true });
  }

  if (evt.event === "exec.approval.requested") {
    const entry = parseExecApprovalRequested(evt.payload);
    if (entry) {
      host.execApprovalQueue = addExecApproval(host.execApprovalQueue, entry);
      host.execApprovalError = null;
      const delay = Math.max(0, entry.expiresAtMs - Date.now() + 500);
      window.setTimeout(() => {
        host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, entry.id);
      }, delay);
    }
    return;
  }

  if (evt.event === "exec.approval.resolved") {
    const resolved = parseExecApprovalResolved(evt.payload);
    if (resolved) {
      host.execApprovalQueue = removeExecApproval(host.execApprovalQueue, resolved.id);
    }
  }
}

// ---------------------------------------------------------------------------
// Auto-rename sessions
// ---------------------------------------------------------------------------

const RENAMED_STORAGE_KEY = "openclaw:renamedSessionKeys";
const BATCH_RAN_STORAGE_KEY = "openclaw:batchRenameRan";

function loadRenamedKeys(): Set<string> {
  try {
    const raw = sessionStorage.getItem(RENAMED_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set();
  } catch { return new Set(); }
}

function markRenamed(key: string) {
  const keys = loadRenamedKeys();
  keys.add(key);
  try { sessionStorage.setItem(RENAMED_STORAGE_KEY, JSON.stringify([...keys])); }
  catch { /* quota exceeded */ }
}

function isRenamed(key: string): boolean { return loadRenamedKeys().has(key); }

function hasBatchRenameRun(): boolean {
  try { return sessionStorage.getItem(BATCH_RAN_STORAGE_KEY) === "1"; }
  catch { return false; }
}

function setBatchRenameRun() {
  try { sessionStorage.setItem(BATCH_RAN_STORAGE_KEY, "1"); }
  catch { /* ignore */ }
}

const DEFAULT_SESSION_LABELS = new Set(["main", "new thread", "new session"]);

export async function batchRenameUnnamedSessions(host: GatewayHost) {
  if (hasBatchRenameRun()) return;
  if (!host.connected || !host.client) return;
  setBatchRenameRun();

  const sessionsResult = (host as unknown as { sessionsResult: SessionsListResult | null })
    .sessionsResult;
  if (!sessionsResult?.sessions) return;

  const unnamed = sessionsResult.sessions.filter((s) => {
    const key = s.key.toLowerCase();
    if (key.includes(":cron:") || key.includes(":cron-") || s.kind === "global") return false;
    const label = (s.displayName || s.label || "").trim();
    if (label && label !== s.key && !DEFAULT_SESSION_LABELS.has(label.toLowerCase())) return false;
    if (isRenamed(s.key)) return false;
    return true;
  });

  if (unnamed.length === 0) return;

  const batch = unnamed.slice(0, 10);
  for (const session of batch) {
    markRenamed(session.key);
    try {
      const res = (await host.client!.request("chat.history", {
        sessionKey: session.key, limit: 10,
      })) as { messages?: Array<{ role?: string; content?: unknown }> } | undefined;

      const msgs = res?.messages;
      if (!msgs || msgs.length === 0) continue;
      const userMsg = msgs.find((m) => m.role === "user");
      const assistantMsg = msgs.find((m) => m.role === "assistant");
      if (!userMsg || !assistantMsg) continue;

      const result = await generateTitleViaLLM(host, msgs);
      const title = result?.title ||
        deriveClientSideTitle(extractMessageText(userMsg as Parameters<typeof extractMessageText>[0]));
      if (!title || isBadTitle(title)) continue;

      const patch: { label: string; icon?: string } = { label: title };
      if (result?.icon) patch.icon = result.icon;
      void patchSession(host as unknown as Parameters<typeof patchSession>[0], session.key, patch);
    } catch { /* skip */ }
  }
}

async function maybeAutoRenameSession(host: GatewayHost) {
  if (!host.connected || !host.client) return;
  const sessionKey = host.sessionKey;
  if (isRenamed(sessionKey)) return;

  const sessionsResult = (host as unknown as { sessionsResult: SessionsListResult | null })
    .sessionsResult;
  const session = sessionsResult?.sessions?.find((s) => s.key === sessionKey);
  const currentLabel = (session?.displayName || session?.label || "").trim();

  if (currentLabel && currentLabel !== sessionKey && !DEFAULT_SESSION_LABELS.has(currentLabel.toLowerCase())) {
    markRenamed(sessionKey);
    return;
  }

  const messages = host.chatMessages as Array<{
    role?: string; content?: Array<{ type?: string; text?: string }> | string;
  }>;
  const userMsg = messages.find((m) => m.role === "user");
  const assistantMsg = messages.find((m) => m.role === "assistant");
  if (!userMsg || !assistantMsg) return;

  markRenamed(sessionKey);
  const result = await generateTitleViaLLM(host, messages);
  const title = result?.title || deriveClientSideTitle(extractMessageText(userMsg));
  if (!title || isBadTitle(title)) return;

  const patch: { label: string; icon?: string } = { label: title };
  if (result?.icon) patch.icon = result.icon;
  void patchSession(host as unknown as Parameters<typeof patchSession>[0], sessionKey, patch);
}

function extractMessageText(msg: {
  content?: Array<{ type?: string; text?: string }> | string;
}): string {
  if (typeof msg.content === "string") return msg.content;
  if (Array.isArray(msg.content)) {
    const textBlock = msg.content.find((b) => b.type === "text");
    return textBlock?.text ?? "";
  }
  return "";
}

function isBadTitle(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    lower.includes("generate a short title") || lower.includes("reply with only") ||
    lower.includes("no quotes, no punctuation") || lower.startsWith("user:") ||
    lower.startsWith("assistant:")
  );
}

async function generateTitleViaLLM(
  host: GatewayHost,
  messages: Array<{ role?: string; content?: unknown }>,
): Promise<{ title: string; icon: string } | null> {
  try {
    const wsUrl = host.settings.gatewayUrl;
    if (!wsUrl) return null;
    const httpUrl = wsUrl.replace(/^ws(s?):\/\//, "http$1://");

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = host.settings.token?.trim();
    const password = host.password?.trim();
    if (token) headers["Authorization"] = `Bearer ${token}`;
    else if (password) headers["Authorization"] = `Bearer ${password}`;

    const chatMsgs: Array<{ role: string; content: string }> = [];
    for (const m of messages) {
      if (m.role !== "user" && m.role !== "assistant") continue;
      const text = extractMessageText(m as Parameters<typeof extractMessageText>[0]);
      if (text) chatMsgs.push({ role: m.role, content: text.slice(0, 300) });
    }
    if (chatMsgs.length === 0) return null;

    const res = await fetch(`${httpUrl}/api/utils/generate-title`, {
      method: "POST", headers,
      body: JSON.stringify({ messages: chatMsgs }),
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { title?: string; icon?: string };
    const title = data?.title?.trim();
    if (!title || isBadTitle(title)) return null;
    return { title, icon: data?.icon?.trim() ?? "" };
  } catch { return null; }
}

function deriveClientSideTitle(text: string): string {
  const cleaned = text.replace(/^\/\w+\s*/, "").trim();
  if (!cleaned) return "";
  const match = cleaned.match(/^[^\n.!?]+[.!?]?/);
  const sentence = match ? match[0].trim() : cleaned;
  if (sentence.length <= 40) return sentence;
  const truncated = sentence.slice(0, 40);
  const lastSpace = truncated.lastIndexOf(" ");
  return lastSpace > 20 ? truncated.slice(0, lastSpace) + "…" : truncated + "…";
}

export function applySnapshot(host: GatewayHost, hello: GatewayHelloOk) {
  const snapshot = hello.snapshot as
    | {
        presence?: PresenceEntry[];
        health?: HealthSnapshot;
        sessionDefaults?: SessionDefaultsSnapshot;
      }
    | undefined;
  if (snapshot?.presence && Array.isArray(snapshot.presence)) {
    host.presenceEntries = snapshot.presence;
  }
  if (snapshot?.health) {
    host.debugHealth = snapshot.health;
  }
  if (snapshot?.sessionDefaults) {
    applySessionDefaults(host, snapshot.sessionDefaults);
  }
}
