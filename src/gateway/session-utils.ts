/**
 * Session utilities for the gateway.
 *
 * This module orchestrates session management by delegating to focused submodules:
 * - session-utils.avatar.ts: Avatar resolution (data URIs, file paths, HTTP URLs)
 * - session-utils.agents.ts: Agent listing and discovery
 * - session-utils.store.ts: Store resolution and loading
 * - session-utils.fs.ts: File system operations (transcript reading)
 * - session-utils.types.ts: Type definitions
 */

import { lookupContextTokens } from "../agents/context.js";
import { DEFAULT_CONTEXT_TOKENS, DEFAULT_MODEL, DEFAULT_PROVIDER } from "../agents/defaults.js";
import { resolveConfiguredModelRef } from "../agents/model-selection.js";
import { type MoltbotConfig, loadConfig } from "../config/config.js";
import {
  buildGroupDisplayName,
  loadSessionStore,
  resolveStorePath,
  type SessionEntry,
} from "../config/sessions.js";
import { normalizeAgentId, parseAgentSessionKey } from "../routing/session-key.js";
import { normalizeSessionDeliveryFields } from "../utils/delivery-context.js";
import {
  readFirstUserMessageFromTranscript,
  readLastMessagePreviewFromTranscript,
} from "./session-utils.fs.js";
import type {
  GatewayAgentRow,
  GatewaySessionRow,
  GatewaySessionsDefaults,
  SessionsListResult,
} from "./session-utils.types.js";

// Re-export from submodules for backwards compatibility
export {
  resolveAvatarMime,
  isWorkspaceRelativePath,
  resolveIdentityAvatarUrl,
} from "./session-utils.avatar.js";

export {
  isStorePathTemplate,
  listExistingAgentIdsFromDisk,
  listConfiguredAgentIds,
  listAgentsForGateway,
} from "./session-utils.agents.js";

export {
  canonicalizeSessionKeyForAgent,
  resolveDefaultStoreAgentId,
  resolveSessionStoreKey,
  resolveSessionStoreAgentId,
  canonicalizeSpawnedByForAgent,
  resolveGatewaySessionStoreTarget,
  mergeSessionEntryIntoCombined,
  loadCombinedSessionStoreForGateway,
} from "./session-utils.store.js";

export {
  archiveFileOnDisk,
  capArrayByJsonBytes,
  readFirstUserMessageFromTranscript,
  readLastMessagePreviewFromTranscript,
  readSessionPreviewItemsFromTranscript,
  readSessionMessages,
  resolveSessionTranscriptCandidates,
} from "./session-utils.fs.js";

export type {
  GatewayAgentRow,
  GatewaySessionRow,
  GatewaySessionsDefaults,
  SessionsListResult,
  SessionsPatchResult,
  SessionsPreviewEntry,
  SessionsPreviewResult,
} from "./session-utils.types.js";

// Import from store module for internal use
import { resolveSessionStoreKey, resolveSessionStoreAgentId } from "./session-utils.store.js";

const DERIVED_TITLE_MAX_LEN = 60;

function formatSessionIdPrefix(sessionId: string, updatedAt?: number | null): string {
  const prefix = sessionId.slice(0, 8);
  if (updatedAt && updatedAt > 0) {
    const d = new Date(updatedAt);
    const date = d.toISOString().slice(0, 10);
    return `${prefix} (${date})`;
  }
  return prefix;
}

function truncateTitle(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen - 1);
  const lastSpace = cut.lastIndexOf(" ");
  if (lastSpace > maxLen * 0.6) return cut.slice(0, lastSpace) + "…";
  return cut + "…";
}

/**
 * Derive a display title for a session from its metadata or first message.
 */
export function deriveSessionTitle(
  entry: SessionEntry | undefined,
  firstUserMessage?: string | null,
): string | undefined {
  if (!entry) return undefined;

  if (entry.displayName?.trim()) {
    return entry.displayName.trim();
  }

  if (entry.subject?.trim()) {
    return entry.subject.trim();
  }

  if (firstUserMessage?.trim()) {
    const normalized = firstUserMessage.replace(/\s+/g, " ").trim();
    return truncateTitle(normalized, DERIVED_TITLE_MAX_LEN);
  }

  if (entry.sessionId) {
    return formatSessionIdPrefix(entry.sessionId, entry.updatedAt);
  }

  return undefined;
}

/**
 * Load a session entry by key, resolving store paths automatically.
 */
export function loadSessionEntry(sessionKey: string) {
  const cfg = loadConfig();
  const sessionCfg = cfg.session;
  const canonicalKey = resolveSessionStoreKey({ cfg, sessionKey });
  const agentId = resolveSessionStoreAgentId(cfg, canonicalKey);
  const storePath = resolveStorePath(sessionCfg?.store, { agentId });
  const store = loadSessionStore(storePath);
  const entry = store[canonicalKey];
  return { cfg, storePath, store, entry, canonicalKey };
}

/**
 * Classify a session key into its kind (global, unknown, group, direct).
 */
export function classifySessionKey(key: string, entry?: SessionEntry): GatewaySessionRow["kind"] {
  if (key === "global") return "global";
  if (key === "unknown") return "unknown";
  if (entry?.chatType === "group" || entry?.chatType === "channel") {
    return "group";
  }
  if (key.includes(":group:") || key.includes(":channel:")) {
    return "group";
  }
  return "direct";
}

/**
 * Parse a group session key into its components.
 */
export function parseGroupKey(
  key: string,
): { channel?: string; kind?: "group" | "channel"; id?: string } | null {
  const agentParsed = parseAgentSessionKey(key);
  const rawKey = agentParsed?.rest ?? key;
  const parts = rawKey.split(":").filter(Boolean);
  if (parts.length >= 3) {
    const [channel, kind, ...rest] = parts;
    if (kind === "group" || kind === "channel") {
      const id = rest.join(":");
      return { channel, kind, id };
    }
  }
  return null;
}

/**
 * Get the default model configuration for sessions.
 */
export function getSessionDefaults(cfg: MoltbotConfig): GatewaySessionsDefaults {
  const resolved = resolveConfiguredModelRef({
    cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  const contextTokens =
    cfg.agents?.defaults?.contextTokens ??
    lookupContextTokens(resolved.model) ??
    DEFAULT_CONTEXT_TOKENS;
  return {
    modelProvider: resolved.provider ?? null,
    model: resolved.model ?? null,
    contextTokens: contextTokens ?? null,
  };
}

/**
 * Resolve the model reference for a session, considering overrides.
 */
export function resolveSessionModelRef(
  cfg: MoltbotConfig,
  entry?: SessionEntry,
): { provider: string; model: string } {
  const resolved = resolveConfiguredModelRef({
    cfg,
    defaultProvider: DEFAULT_PROVIDER,
    defaultModel: DEFAULT_MODEL,
  });
  let provider = resolved.provider;
  let model = resolved.model;
  const storedModelOverride = entry?.modelOverride?.trim();
  if (storedModelOverride) {
    provider = entry?.providerOverride?.trim() || provider;
    model = storedModelOverride;
  }
  return { provider, model };
}

/**
 * List sessions from a store with filtering and derived titles.
 */
export function listSessionsFromStore(params: {
  cfg: MoltbotConfig;
  storePath: string;
  store: Record<string, SessionEntry>;
  opts: import("./protocol/index.js").SessionsListParams;
}): SessionsListResult {
  const { cfg, storePath, store, opts } = params;
  const now = Date.now();

  const includeGlobal = opts.includeGlobal === true;
  const includeUnknown = opts.includeUnknown === true;
  const includeDerivedTitles = opts.includeDerivedTitles === true;
  const includeLastMessage = opts.includeLastMessage === true;
  const spawnedBy = typeof opts.spawnedBy === "string" ? opts.spawnedBy : "";
  const label = typeof opts.label === "string" ? opts.label.trim() : "";
  const agentId = typeof opts.agentId === "string" ? normalizeAgentId(opts.agentId) : "";
  const search = typeof opts.search === "string" ? opts.search.trim().toLowerCase() : "";
  const activeMinutes =
    typeof opts.activeMinutes === "number" && Number.isFinite(opts.activeMinutes)
      ? Math.max(1, Math.floor(opts.activeMinutes))
      : undefined;

  let sessions = Object.entries(store)
    .filter(([key]) => {
      if (!includeGlobal && key === "global") return false;
      if (!includeUnknown && key === "unknown") return false;
      if (agentId) {
        if (key === "global" || key === "unknown") return false;
        const parsed = parseAgentSessionKey(key);
        if (!parsed) return false;
        return normalizeAgentId(parsed.agentId) === agentId;
      }
      return true;
    })
    .filter(([key, entry]) => {
      if (!spawnedBy) return true;
      if (key === "unknown" || key === "global") return false;
      return entry?.spawnedBy === spawnedBy;
    })
    .filter(([, entry]) => {
      if (!label) return true;
      return entry?.label === label;
    })
    .map(([key, entry]) => {
      const updatedAt = entry?.updatedAt ?? null;
      const input = entry?.inputTokens ?? 0;
      const output = entry?.outputTokens ?? 0;
      const total = entry?.totalTokens ?? input + output;
      const parsed = parseGroupKey(key);
      const channel = entry?.channel ?? parsed?.channel;
      const subject = entry?.subject;
      const groupChannel = entry?.groupChannel;
      const space = entry?.space;
      const id = parsed?.id;
      const origin = entry?.origin;
      const originLabel = origin?.label;
      const displayName =
        entry?.displayName ??
        (channel
          ? buildGroupDisplayName({
              provider: channel,
              subject,
              groupChannel,
              space,
              id,
              key,
            })
          : undefined) ??
        entry?.label ??
        originLabel;
      const deliveryFields = normalizeSessionDeliveryFields(entry);
      return {
        key,
        entry,
        kind: classifySessionKey(key, entry),
        label: entry?.label,
        displayName,
        channel,
        subject,
        groupChannel,
        space,
        chatType: entry?.chatType,
        origin,
        updatedAt,
        sessionId: entry?.sessionId,
        systemSent: entry?.systemSent,
        abortedLastRun: entry?.abortedLastRun,
        thinkingLevel: entry?.thinkingLevel,
        verboseLevel: entry?.verboseLevel,
        reasoningLevel: entry?.reasoningLevel,
        elevatedLevel: entry?.elevatedLevel,
        sendPolicy: entry?.sendPolicy,
        inputTokens: entry?.inputTokens,
        outputTokens: entry?.outputTokens,
        totalTokens: total,
        responseUsage: entry?.responseUsage,
        modelProvider: entry?.modelProvider,
        model: entry?.model,
        contextTokens: entry?.contextTokens,
        deliveryContext: deliveryFields.deliveryContext,
        lastChannel: deliveryFields.lastChannel ?? entry?.lastChannel,
        lastTo: deliveryFields.lastTo ?? entry?.lastTo,
        lastAccountId: deliveryFields.lastAccountId ?? entry?.lastAccountId,
      };
    })
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

  if (search) {
    sessions = sessions.filter((s) => {
      const fields = [s.displayName, s.label, s.subject, s.sessionId, s.key];
      return fields.some((f) => typeof f === "string" && f.toLowerCase().includes(search));
    });
  }

  if (activeMinutes !== undefined) {
    const cutoff = now - activeMinutes * 60_000;
    sessions = sessions.filter((s) => (s.updatedAt ?? 0) >= cutoff);
  }

  if (typeof opts.limit === "number" && Number.isFinite(opts.limit)) {
    const limit = Math.max(1, Math.floor(opts.limit));
    sessions = sessions.slice(0, limit);
  }

  const finalSessions: GatewaySessionRow[] = sessions.map((s) => {
    const { entry, ...rest } = s;
    let derivedTitle: string | undefined;
    let lastMessagePreview: string | undefined;
    if (entry?.sessionId) {
      if (includeDerivedTitles) {
        const firstUserMsg = readFirstUserMessageFromTranscript(
          entry.sessionId,
          storePath,
          entry.sessionFile,
        );
        derivedTitle = deriveSessionTitle(entry, firstUserMsg);
      }
      if (includeLastMessage) {
        const lastMsg = readLastMessagePreviewFromTranscript(
          entry.sessionId,
          storePath,
          entry.sessionFile,
        );
        if (lastMsg) lastMessagePreview = lastMsg;
      }
    }
    return { ...rest, derivedTitle, lastMessagePreview } satisfies GatewaySessionRow;
  });

  return {
    ts: now,
    path: storePath,
    count: finalSessions.length,
    defaults: getSessionDefaults(cfg),
    sessions: finalSessions,
  };
}
