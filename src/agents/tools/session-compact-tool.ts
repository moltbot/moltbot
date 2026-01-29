import { Type } from "@sinclair/typebox";

import { compactEmbeddedPiSession } from "../pi-embedded.js";
import {
  resolveSessionFilePath,
  loadSessionStore,
  resolveStorePath,
} from "../../config/sessions.js";
import type { MoltbotConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";
import { formatTokenCount, formatContextUsageShort } from "../../auto-reply/status.js";
import {
  buildAgentMainSessionKey,
  resolveAgentIdFromSessionKey,
  DEFAULT_AGENT_ID,
} from "../../routing/session-key.js";
import { resolveDefaultModelForAgent } from "../model-selection.js";
import type { ThinkLevel } from "../../auto-reply/thinking.js";
import type { AnyAgentTool } from "./common.js";
import { readStringParam } from "./common.js";
import {
  shouldResolveSessionIdInput,
  resolveInternalSessionKey,
  resolveMainSessionAlias,
  createAgentToAgentPolicy,
} from "./sessions-helpers.js";
import { loadCombinedSessionStoreForGateway } from "../../gateway/session-utils.js";
import type { SessionEntry } from "../../config/sessions.js";

const SessionCompactToolSchema = Type.Object({
  sessionKey: Type.Optional(Type.String()),
  instructions: Type.Optional(
    Type.String({
      description: "Extra compaction instructions to guide the summarization",
    }),
  ),
});

function resolveSessionEntry(params: {
  store: Record<string, SessionEntry>;
  keyRaw: string;
  alias: string;
  mainKey: string;
}): { key: string; entry: SessionEntry } | null {
  const keyRaw = params.keyRaw.trim();
  if (!keyRaw) return null;
  const internal = resolveInternalSessionKey({
    key: keyRaw,
    alias: params.alias,
    mainKey: params.mainKey,
  });

  const candidates = new Set<string>([keyRaw, internal]);
  if (!keyRaw.startsWith("agent:")) {
    candidates.add(`agent:${DEFAULT_AGENT_ID}:${keyRaw}`);
    candidates.add(`agent:${DEFAULT_AGENT_ID}:${internal}`);
  }
  if (keyRaw === "main") {
    candidates.add(
      buildAgentMainSessionKey({
        agentId: DEFAULT_AGENT_ID,
        mainKey: params.mainKey,
      }),
    );
  }

  for (const key of candidates) {
    const entry = params.store[key];
    if (entry) return { key, entry };
  }

  return null;
}

function resolveSessionKeyFromSessionId(params: {
  cfg: MoltbotConfig;
  sessionId: string;
  agentId?: string;
}): string | null {
  const trimmed = params.sessionId.trim();
  if (!trimmed) return null;
  const { store } = loadCombinedSessionStoreForGateway(params.cfg);
  const match = Object.entries(store).find(([key, entry]) => {
    if (entry?.sessionId !== trimmed) return false;
    if (!params.agentId) return true;
    return resolveAgentIdFromSessionKey(key) === params.agentId;
  });
  return match?.[0] ?? null;
}

export function createSessionCompactTool(opts?: {
  agentSessionKey?: string;
  config?: MoltbotConfig;
}): AnyAgentTool {
  return {
    label: "Session Compact",
    name: "session_compact",
    description:
      "Compact the session context by summarizing conversation history. " +
      "Use when context is getting large or before complex tasks. " +
      "Optional instructions can guide what to preserve in the summary.",
    parameters: SessionCompactToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const cfg = opts?.config ?? loadConfig();
      const { mainKey, alias } = resolveMainSessionAlias(cfg);
      const a2aPolicy = createAgentToAgentPolicy(cfg);

      const requestedKeyParam = readStringParam(params, "sessionKey");
      let requestedKeyRaw = requestedKeyParam ?? opts?.agentSessionKey;
      if (!requestedKeyRaw?.trim()) {
        throw new Error("sessionKey required");
      }

      const requesterAgentId = resolveAgentIdFromSessionKey(
        opts?.agentSessionKey ?? requestedKeyRaw,
      );
      const ensureAgentAccess = (targetAgentId: string) => {
        if (targetAgentId === requesterAgentId) return;
        if (!a2aPolicy.enabled) {
          throw new Error(
            "Agent-to-agent compact is disabled. Set tools.agentToAgent.enabled=true to allow cross-agent access.",
          );
        }
        if (!a2aPolicy.isAllowed(requesterAgentId, targetAgentId)) {
          throw new Error("Agent-to-agent session compact denied by tools.agentToAgent.allow.");
        }
      };

      if (requestedKeyRaw.startsWith("agent:")) {
        ensureAgentAccess(resolveAgentIdFromSessionKey(requestedKeyRaw));
      }

      const isExplicitAgentKey = requestedKeyRaw.startsWith("agent:");
      let agentId = isExplicitAgentKey
        ? resolveAgentIdFromSessionKey(requestedKeyRaw)
        : requesterAgentId;
      let storePath = resolveStorePath(cfg.session?.store, { agentId });
      let store = loadSessionStore(storePath);

      let resolved = resolveSessionEntry({
        store,
        keyRaw: requestedKeyRaw,
        alias,
        mainKey,
      });

      if (!resolved && shouldResolveSessionIdInput(requestedKeyRaw)) {
        const resolvedKey = resolveSessionKeyFromSessionId({
          cfg,
          sessionId: requestedKeyRaw,
          agentId: a2aPolicy.enabled ? undefined : requesterAgentId,
        });
        if (resolvedKey) {
          ensureAgentAccess(resolveAgentIdFromSessionKey(resolvedKey));
          requestedKeyRaw = resolvedKey;
          agentId = resolveAgentIdFromSessionKey(resolvedKey);
          storePath = resolveStorePath(cfg.session?.store, { agentId });
          store = loadSessionStore(storePath);
          resolved = resolveSessionEntry({
            store,
            keyRaw: requestedKeyRaw,
            alias,
            mainKey,
          });
        }
      }

      if (!resolved) {
        const kind = shouldResolveSessionIdInput(requestedKeyRaw) ? "sessionId" : "sessionKey";
        throw new Error(`Unknown ${kind}: ${requestedKeyRaw}`);
      }

      if (!resolved.entry.sessionId) {
        throw new Error("Compaction unavailable (missing session id)");
      }

      const customInstructions = readStringParam(params, "instructions");
      const configured = resolveDefaultModelForAgent({ cfg, agentId });
      const provider = resolved.entry.providerOverride?.trim() || configured.provider;
      const model = resolved.entry.modelOverride?.trim() || configured.model;
      // Use session's thinking level or default to "off" for compaction
      const thinkLevel: ThinkLevel = (resolved.entry.thinkingLevel as ThinkLevel) ?? "off";

      const result = await compactEmbeddedPiSession({
        sessionId: resolved.entry.sessionId,
        sessionKey: resolved.key,
        messageChannel: resolved.entry.channel ?? resolved.entry.lastChannel,
        groupId: resolved.entry.groupId,
        groupChannel: resolved.entry.groupChannel,
        groupSpace: resolved.entry.space,
        spawnedBy: resolved.entry.spawnedBy,
        sessionFile: resolveSessionFilePath(resolved.entry.sessionId, resolved.entry),
        workspaceDir: cfg.agents?.defaults?.workspace ?? process.cwd(),
        config: cfg,
        skillsSnapshot: resolved.entry.skillsSnapshot,
        provider,
        model,
        thinkLevel,
        bashElevated: {
          enabled: false,
          allowed: false,
          defaultLevel: "off",
        },
        customInstructions,
      });

      const tokensBefore = result.result?.tokensBefore;
      const tokensAfter = result.result?.tokensAfter;

      let statusText: string;
      if (result.ok) {
        if (result.compacted) {
          const tokenInfo =
            tokensBefore != null && tokensAfter != null
              ? `${formatTokenCount(tokensBefore)} → ${formatTokenCount(tokensAfter)}`
              : tokensBefore != null
                ? `${formatTokenCount(tokensBefore)} before`
                : "";
          const contextSummary = formatContextUsageShort(
            tokensAfter ?? null,
            resolved.entry.contextTokens ?? null,
          );
          statusText = tokenInfo
            ? `⚙️ Compacted (${tokenInfo}) • ${contextSummary}`
            : `⚙️ Compacted • ${contextSummary}`;
        } else {
          statusText = `⚙️ Compaction skipped${result.reason ? `: ${result.reason}` : ""}`;
        }
      } else {
        statusText = `❌ Compaction failed${result.reason ? `: ${result.reason}` : ""}`;
      }

      return {
        content: [{ type: "text", text: statusText }],
        details: {
          ok: result.ok,
          compacted: result.compacted ?? false,
          sessionKey: resolved.key,
          tokensBefore,
          tokensAfter,
          reason: result.reason,
        },
      };
    },
  };
}
