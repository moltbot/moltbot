import crypto from "node:crypto";

import { formatThinkingLevels, normalizeThinkLevel } from "../../auto-reply/thinking.js";
import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";
import { callGateway } from "../../gateway/call.js";
import {
  isSubagentSessionKey,
  normalizeAgentId,
  parseAgentSessionKey,
} from "../../routing/session-key.js";
import { normalizeDeliveryContext } from "../../utils/delivery-context.js";
import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { resolveAgentConfig } from "../agent-scope.js";
import { AGENT_LANE_SUBAGENT } from "../lanes.js";
import { buildSubagentSystemPrompt } from "../subagent-announce.js";
import { registerSubagentRun } from "../subagent-registry.js";
import {
  resolveDisplaySessionKey,
  resolveInternalSessionKey,
  resolveMainSessionAlias,
} from "./sessions-helpers.js";

export type SpawnOpts = {
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
  sandboxed?: boolean;
  requesterAgentIdOverride?: string;
};

export type SpawnTaskParams = {
  task: string;
  label?: string;
  agentId?: string;
  model?: string;
  thinking?: string;
  runTimeoutSeconds?: number;
  cleanup?: "delete" | "keep";
};

export type SpawnResult =
  | {
      status: "accepted";
      childSessionKey: string;
      runId: string;
      modelApplied?: boolean;
      warning?: string;
    }
  | {
      status: "forbidden" | "error";
      error: string;
      childSessionKey?: string;
      runId?: string;
    };

function splitModelRef(ref?: string) {
  if (!ref) return { provider: undefined, model: undefined };
  const trimmed = ref.trim();
  if (!trimmed) return { provider: undefined, model: undefined };
  const [provider, model] = trimmed.split("/", 2);
  if (model) return { provider, model };
  return { provider: undefined, model: trimmed };
}

function normalizeModelSelection(value: unknown): string | undefined {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (!value || typeof value !== "object") return undefined;
  const primary = (value as { primary?: unknown }).primary;
  if (typeof primary === "string" && primary.trim()) return primary.trim();
  return undefined;
}

export function resolveSpawnContext(opts: SpawnOpts) {
  const cfg = loadConfig();
  const { mainKey, alias } = resolveMainSessionAlias(cfg);
  const requesterSessionKey = opts.agentSessionKey;
  const requesterOrigin = normalizeDeliveryContext({
    channel: opts.agentChannel,
    accountId: opts.agentAccountId,
    to: opts.agentTo,
    threadId: opts.agentThreadId,
  });

  if (typeof requesterSessionKey === "string" && isSubagentSessionKey(requesterSessionKey)) {
    return {
      forbidden: true as const,
      error: "sessions_spawn is not allowed from sub-agent sessions",
    };
  }

  const requesterInternalKey = requesterSessionKey
    ? resolveInternalSessionKey({ key: requesterSessionKey, alias, mainKey })
    : alias;
  const requesterDisplayKey = resolveDisplaySessionKey({
    key: requesterInternalKey,
    alias,
    mainKey,
  });
  const requesterAgentId = normalizeAgentId(
    opts.requesterAgentIdOverride ?? parseAgentSessionKey(requesterInternalKey)?.agentId,
  );

  return {
    forbidden: false as const,
    cfg,
    requesterSessionKey,
    requesterOrigin,
    requesterInternalKey,
    requesterDisplayKey,
    requesterAgentId,
    opts,
  };
}

export async function spawnSingleSubagent(
  params: SpawnTaskParams,
  ctx: {
    cfg: OpenClawConfig;
    requesterSessionKey?: string;
    requesterOrigin: ReturnType<typeof normalizeDeliveryContext>;
    requesterInternalKey: string;
    requesterDisplayKey: string;
    requesterAgentId: string;
    opts: SpawnOpts;
  },
): Promise<SpawnResult> {
  const {
    task,
    label = "",
    agentId: requestedAgentId,
    model: modelOverride,
    thinking: thinkingOverrideRaw,
    runTimeoutSeconds = 0,
    cleanup = "keep",
  } = params;
  const {
    cfg,
    requesterSessionKey,
    requesterOrigin,
    requesterInternalKey,
    requesterDisplayKey,
    opts,
  } = ctx;

  const requesterAgentId = ctx.requesterAgentId;
  const targetAgentId = requestedAgentId ? normalizeAgentId(requestedAgentId) : requesterAgentId;

  if (targetAgentId !== requesterAgentId) {
    const allowAgents = resolveAgentConfig(cfg, requesterAgentId)?.subagents?.allowAgents ?? [];
    const allowAny = allowAgents.some((value) => value.trim() === "*");
    const normalizedTargetId = targetAgentId.toLowerCase();
    const allowSet = new Set(
      allowAgents
        .filter((value) => value.trim() && value.trim() !== "*")
        .map((value) => normalizeAgentId(value).toLowerCase()),
    );
    if (!allowAny && !allowSet.has(normalizedTargetId)) {
      const allowedText = allowAny
        ? "*"
        : allowSet.size > 0
          ? Array.from(allowSet).join(", ")
          : "none";
      return {
        status: "forbidden",
        error: `agentId is not allowed for sessions_spawn (allowed: ${allowedText})`,
      };
    }
  }

  const childSessionKey = `agent:${targetAgentId}:subagent:${crypto.randomUUID()}`;
  const spawnedByKey = requesterInternalKey;
  const targetAgentConfig = resolveAgentConfig(cfg, targetAgentId);
  const resolvedModel =
    normalizeModelSelection(modelOverride) ??
    normalizeModelSelection(targetAgentConfig?.subagents?.model) ??
    normalizeModelSelection(cfg.agents?.defaults?.subagents?.model);

  let modelWarning: string | undefined;
  let modelApplied = false;

  let thinkingOverride: string | undefined;
  if (thinkingOverrideRaw) {
    const normalized = normalizeThinkLevel(thinkingOverrideRaw);
    if (!normalized) {
      const { provider, model } = splitModelRef(resolvedModel);
      const hint = formatThinkingLevels(provider, model);
      return {
        status: "error",
        error: `Invalid thinking level "${thinkingOverrideRaw}". Use one of: ${hint}.`,
      };
    }
    thinkingOverride = normalized;
  }

  if (resolvedModel) {
    try {
      await callGateway({
        method: "sessions.patch",
        params: { key: childSessionKey, model: resolvedModel },
        timeoutMs: 10_000,
      });
      modelApplied = true;
    } catch (err) {
      const messageText =
        err instanceof Error ? err.message : typeof err === "string" ? err : "error";
      const recoverable =
        messageText.includes("invalid model") || messageText.includes("model not allowed");
      if (!recoverable) {
        return { status: "error", error: messageText, childSessionKey };
      }
      modelWarning = messageText;
    }
  }

  const childSystemPrompt = buildSubagentSystemPrompt({
    requesterSessionKey,
    requesterOrigin,
    childSessionKey,
    label: label || undefined,
    task,
  });

  const childIdem = crypto.randomUUID();
  let childRunId: string = childIdem;
  try {
    const response = (await callGateway({
      method: "agent",
      params: {
        message: task,
        sessionKey: childSessionKey,
        channel: requesterOrigin?.channel,
        idempotencyKey: childIdem,
        deliver: false,
        lane: AGENT_LANE_SUBAGENT,
        extraSystemPrompt: childSystemPrompt,
        thinking: thinkingOverride,
        timeout: runTimeoutSeconds > 0 ? runTimeoutSeconds : undefined,
        label: label || undefined,
        spawnedBy: spawnedByKey,
        groupId: opts.agentGroupId ?? undefined,
        groupChannel: opts.agentGroupChannel ?? undefined,
        groupSpace: opts.agentGroupSpace ?? undefined,
      },
      timeoutMs: 10_000,
    })) as { runId?: string };
    if (typeof response?.runId === "string" && response.runId) {
      childRunId = response.runId;
    }
  } catch (err) {
    const messageText =
      err instanceof Error ? err.message : typeof err === "string" ? err : "error";
    return { status: "error", error: messageText, childSessionKey, runId: childRunId };
  }

  registerSubagentRun({
    runId: childRunId,
    childSessionKey,
    requesterSessionKey: requesterInternalKey,
    requesterOrigin,
    requesterDisplayKey,
    task,
    cleanup,
    label: label || undefined,
    runTimeoutSeconds,
  });

  return {
    status: "accepted",
    childSessionKey,
    runId: childRunId,
    modelApplied: resolvedModel ? modelApplied : undefined,
    warning: modelWarning,
  };
}
