import type { ClawdbotConfig } from "../config/config.js";
import { loadConfig } from "../config/config.js";
import { loadSessionStore, resolveStorePath } from "../config/sessions.js";
import type {
  ExecApprovalForwardingConfig,
  ExecApprovalForwardTarget,
} from "../config/types.approvals.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { parseAgentSessionKey } from "../routing/session-key.js";
import { isDeliverableMessageChannel, normalizeMessageChannel } from "../utils/message-channel.js";
import type { ExecApprovalDecision } from "./exec-approvals.js";
import { deliverOutboundPayloads } from "./outbound/deliver.js";
import { resolveSessionDeliveryTarget } from "./outbound/targets.js";

const log = createSubsystemLogger("gateway/exec-approvals");

// Batch approval constants
const BATCH_WINDOW_MS = 1500; // Initial window: collect requests for 1.5 seconds
const BATCH_EXTEND_WINDOW_MS = 10000; // Extended window when session has pending approvals
const BATCH_MAX_WINDOW_MS = 30000; // Maximum time to wait before flushing (30 seconds)
const BATCH_TTL_MS = 5 * 60 * 1000; // Batch IDs expire after 5 minutes

export type ExecApprovalRequest = {
  id: string;
  request: {
    command: string;
    cwd?: string | null;
    host?: string | null;
    security?: string | null;
    ask?: string | null;
    agentId?: string | null;
    resolvedPath?: string | null;
    sessionKey?: string | null;
  };
  createdAtMs: number;
  expiresAtMs: number;
};

export type ExecApprovalResolved = {
  id: string;
  decision: ExecApprovalDecision;
  resolvedBy?: string | null;
  ts: number;
};

type ForwardTarget = ExecApprovalForwardTarget & { source: "session" | "target" };

type PendingApproval = {
  request: ExecApprovalRequest;
  targets: ForwardTarget[];
  timeoutId: NodeJS.Timeout | null;
  batchId?: string;
};

type PendingBatch = {
  sessionKey: string;
  requests: ExecApprovalRequest[];
  targets: ForwardTarget[];
  flushTimeoutId: NodeJS.Timeout | null;
  createdAtMs: number;
  lastRequestAtMs: number;
};

type BatchEntry = {
  approvalIds: string[];
  sessionKey: string;
  createdAtMs: number;
};

// Global batch registry - maps batch IDs to their approval IDs
const batchRegistry = new Map<string, BatchEntry>();

function generateBatchId(): string {
  return `batch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanupExpiredBatches(nowMs: number): void {
  for (const [batchId, entry] of batchRegistry) {
    if (nowMs - entry.createdAtMs > BATCH_TTL_MS) {
      batchRegistry.delete(batchId);
    }
  }
}

export function getBatchApprovalIds(batchId: string): string[] | null {
  // Cleanup expired batches opportunistically
  cleanupExpiredBatches(Date.now());
  const entry = batchRegistry.get(batchId);
  if (!entry) return null;
  return entry.approvalIds;
}

export function deleteBatch(batchId: string): void {
  batchRegistry.delete(batchId);
}

export function updateBatchApprovalIds(batchId: string, approvalIds: string[]): void {
  if (approvalIds.length === 0) {
    batchRegistry.delete(batchId);
    return;
  }
  // Cleanup expired batches opportunistically
  cleanupExpiredBatches(Date.now());
  const entry = batchRegistry.get(batchId);
  if (!entry) return;
  entry.approvalIds = approvalIds;
}

export type ExecApprovalForwarder = {
  handleRequested: (request: ExecApprovalRequest) => Promise<void>;
  handleResolved: (resolved: ExecApprovalResolved) => Promise<void>;
  stop: () => void;
};

export type ExecApprovalForwarderDeps = {
  getConfig?: () => ClawdbotConfig;
  deliver?: typeof deliverOutboundPayloads;
  nowMs?: () => number;
  resolveSessionTarget?: (params: {
    cfg: ClawdbotConfig;
    request: ExecApprovalRequest;
  }) => ExecApprovalForwardTarget | null;
};

const DEFAULT_MODE = "session" as const;

function normalizeMode(mode?: ExecApprovalForwardingConfig["mode"]) {
  return mode ?? DEFAULT_MODE;
}

function matchSessionFilter(sessionKey: string, patterns: string[]): boolean {
  return patterns.some((pattern) => {
    try {
      return sessionKey.includes(pattern) || new RegExp(pattern).test(sessionKey);
    } catch {
      return sessionKey.includes(pattern);
    }
  });
}

function shouldForward(params: {
  config?: ExecApprovalForwardingConfig;
  request: ExecApprovalRequest;
}): boolean {
  const config = params.config;
  if (!config?.enabled) return false;
  if (config.agentFilter?.length) {
    const agentId =
      params.request.request.agentId ??
      parseAgentSessionKey(params.request.request.sessionKey)?.agentId;
    if (!agentId) return false;
    if (!config.agentFilter.includes(agentId)) return false;
  }
  if (config.sessionFilter?.length) {
    const sessionKey = params.request.request.sessionKey;
    if (!sessionKey) return false;
    if (!matchSessionFilter(sessionKey, config.sessionFilter)) return false;
  }
  return true;
}

function buildTargetKey(target: ExecApprovalForwardTarget): string {
  const channel = normalizeMessageChannel(target.channel) ?? target.channel;
  const accountId = target.accountId ?? "";
  const threadId = target.threadId ?? "";
  return [channel, target.to, accountId, threadId].join(":");
}

type ApprovalMessage = {
  text: string;
  buttons: Array<Array<{ text: string; callback_data: string }>>;
};

function buildRequestMessage(request: ExecApprovalRequest, nowMs: number): ApprovalMessage {
  const lines: string[] = ["🔒 Exec approval required", `ID: ${request.id}`];
  lines.push(`Command: ${request.request.command}`);
  if (request.request.cwd) lines.push(`CWD: ${request.request.cwd}`);
  if (request.request.host) lines.push(`Host: ${request.request.host}`);
  if (request.request.agentId) lines.push(`Agent: ${request.request.agentId}`);
  if (request.request.security) lines.push(`Security: ${request.request.security}`);
  if (request.request.ask) lines.push(`Ask: ${request.request.ask}`);
  const expiresIn = Math.max(0, Math.round((request.expiresAtMs - nowMs) / 1000));
  lines.push(`Expires in: ${expiresIn}s`);

  const buttons = [
    [
      { text: "✅ Allow Once", callback_data: `/approve ${request.id} allow-once` },
      { text: "✅ Always Allow", callback_data: `/approve ${request.id} allow-always` },
    ],
    [{ text: "❌ Deny", callback_data: `/approve ${request.id} deny` }],
  ];

  return { text: lines.join("\n"), buttons };
}

function decisionLabel(decision: ExecApprovalDecision): string {
  if (decision === "allow-once") return "allowed once";
  if (decision === "allow-always") return "allowed always";
  return "denied";
}

function buildResolvedMessage(resolved: ExecApprovalResolved) {
  const base = `✅ Exec approval ${decisionLabel(resolved.decision)}.`;
  const by = resolved.resolvedBy ? ` Resolved by ${resolved.resolvedBy}.` : "";
  return `${base}${by} ID: ${resolved.id}`;
}

function buildExpiredMessage(request: ExecApprovalRequest) {
  return `⏱️ Exec approval expired. ID: ${request.id}`;
}

function buildBatchRequestMessage(
  requests: ExecApprovalRequest[],
  batchId: string,
  nowMs: number,
): ApprovalMessage {
  const count = requests.length;
  const lines: string[] = [
    `🔒 Exec approval required (${count} command${count > 1 ? "s" : ""})`,
    `Batch ID: ${batchId}`,
  ];
  lines.push("");

  // List each command with a number
  requests.forEach((req, idx) => {
    const cmd = req.request.command;
    // Truncate long commands for readability
    const displayCmd = cmd.length > 60 ? cmd.slice(0, 57) + "..." : cmd;
    lines.push(`${idx + 1}. ${displayCmd} (${req.id})`);
  });

  lines.push("");

  // Show session info if available
  const sessionKey = requests[0]?.request.sessionKey;
  if (sessionKey) {
    // Truncate long session keys
    const displayKey = sessionKey.length > 40 ? "..." + sessionKey.slice(-37) : sessionKey;
    lines.push(`Session: ${displayKey}`);
  }

  // Use the earliest expiry time
  const earliestExpiry = Math.min(...requests.map((r) => r.expiresAtMs));
  const expiresIn = Math.max(0, Math.round((earliestExpiry - nowMs) / 1000));
  lines.push(`Expires in: ${expiresIn}s`);
  lines.push(`Approve: /approve-batch ${batchId} allow-once|deny`);
  lines.push("Or: /approve <id> allow-once|allow-always|deny");

  const buttons = [
    [
      { text: `✅ Approve All (${count})`, callback_data: `/approve-batch ${batchId} allow-once` },
      { text: `❌ Deny All`, callback_data: `/approve-batch ${batchId} deny` },
    ],
  ];

  return { text: lines.join("\n"), buttons };
}

function defaultResolveSessionTarget(params: {
  cfg: ClawdbotConfig;
  request: ExecApprovalRequest;
}): ExecApprovalForwardTarget | null {
  const sessionKey = params.request.request.sessionKey?.trim();
  if (!sessionKey) return null;
  const parsed = parseAgentSessionKey(sessionKey);
  const agentId = parsed?.agentId ?? params.request.request.agentId ?? "main";
  const storePath = resolveStorePath(params.cfg.session?.store, { agentId });
  const store = loadSessionStore(storePath);
  const entry = store[sessionKey];
  if (!entry) return null;
  const target = resolveSessionDeliveryTarget({ entry, requestedChannel: "last" });
  if (!target.channel || !target.to) return null;
  if (!isDeliverableMessageChannel(target.channel)) return null;
  return {
    channel: target.channel,
    to: target.to,
    accountId: target.accountId,
    threadId: target.threadId,
  };
}

type TelegramButtons = Array<Array<{ text: string; callback_data: string }>>;

function buildPayloadWithButtons(text: string, buttons?: TelegramButtons) {
  if (!buttons?.length) {
    log.debug("exec approvals: buildPayloadWithButtons called without buttons");
    return { text };
  }
  log.debug(`exec approvals: buildPayloadWithButtons adding ${buttons.length} button rows`);
  return {
    text,
    channelData: { telegram: { buttons } },
  };
}

async function deliverToTargets(params: {
  cfg: ClawdbotConfig;
  targets: ForwardTarget[];
  text: string;
  buttons?: TelegramButtons;
  deliver: typeof deliverOutboundPayloads;
  shouldSend?: () => boolean;
}) {
  const deliveries = params.targets.map(async (target) => {
    if (params.shouldSend && !params.shouldSend()) return;
    const channel = normalizeMessageChannel(target.channel) ?? target.channel;
    if (!isDeliverableMessageChannel(channel)) return;
    try {
      const payload = buildPayloadWithButtons(params.text, params.buttons);
      log.info(
        `exec approvals: delivering to ${channel}:${target.to} payload=${JSON.stringify(payload).slice(0, 200)}`,
      );
      await params.deliver({
        cfg: params.cfg,
        channel,
        to: target.to,
        accountId: target.accountId,
        threadId: target.threadId,
        payloads: [payload],
      });
    } catch (err) {
      log.error(`exec approvals: failed to deliver to ${channel}:${target.to}: ${String(err)}`);
    }
  });
  await Promise.allSettled(deliveries);
}

export function createExecApprovalForwarder(
  deps: ExecApprovalForwarderDeps = {},
): ExecApprovalForwarder {
  const getConfig = deps.getConfig ?? loadConfig;
  const deliver = deps.deliver ?? deliverOutboundPayloads;
  const nowMs = deps.nowMs ?? Date.now;
  const resolveSessionTarget = deps.resolveSessionTarget ?? defaultResolveSessionTarget;
  const pending = new Map<string, PendingApproval>();
  const pendingBatches = new Map<string, PendingBatch>();

  const resolveTargets = (cfg: ClawdbotConfig, request: ExecApprovalRequest): ForwardTarget[] => {
    const config = cfg.approvals?.exec;
    const mode = normalizeMode(config?.mode);
    const targets: ForwardTarget[] = [];
    const seen = new Set<string>();

    if (mode === "session" || mode === "both") {
      const sessionTarget = resolveSessionTarget({ cfg, request });
      if (sessionTarget) {
        const key = buildTargetKey(sessionTarget);
        if (!seen.has(key)) {
          seen.add(key);
          targets.push({ ...sessionTarget, source: "session" });
        }
      }
    }

    if (mode === "targets" || mode === "both") {
      const explicitTargets = config?.targets ?? [];
      for (const target of explicitTargets) {
        const key = buildTargetKey(target);
        if (seen.has(key)) continue;
        seen.add(key);
        targets.push({ ...target, source: "target" });
      }
    }

    return targets;
  };

  const flushBatch = async (sessionKey: string) => {
    const batch = pendingBatches.get(sessionKey);
    if (!batch) return;
    pendingBatches.delete(sessionKey);

    if (batch.flushTimeoutId) clearTimeout(batch.flushTimeoutId);

    const cfg = getConfig();
    const { requests, targets } = batch;
    const liveRequests = requests.filter((req) => pending.has(req.id));

    if (liveRequests.length === 0 || targets.length === 0) return;

    let batchId: string | null = null;
    if (liveRequests.length > 1) {
      // Generate batch ID and register it
      batchId = generateBatchId();
      const approvalIds = liveRequests.map((r) => r.id);
      // Cleanup any expired batches before inserting
      cleanupExpiredBatches(nowMs());
      batchRegistry.set(batchId, {
        approvalIds,
        sessionKey,
        createdAtMs: nowMs(),
      });

      // Update pending entries with batch ID
      for (const req of liveRequests) {
        const entry = pending.get(req.id);
        if (entry) entry.batchId = batchId;
      }
    }

    log.info(
      `exec approvals: flushing ${
        liveRequests.length > 1 ? `batch ${batchId}` : "single request"
      } with ${liveRequests.length} request${liveRequests.length > 1 ? "s" : ""}`,
    );

    // Send single or batch message depending on count
    if (liveRequests.length === 1) {
      // Single request - use original format with all buttons
      const message = buildRequestMessage(liveRequests[0], nowMs());
      await deliverToTargets({
        cfg,
        targets,
        text: message.text,
        buttons: message.buttons,
        deliver,
        shouldSend: () => pending.has(liveRequests[0].id),
      });
    } else {
      // Multiple requests - use batch format
      if (!batchId) return;
      const message = buildBatchRequestMessage(liveRequests, batchId, nowMs());
      await deliverToTargets({
        cfg,
        targets,
        text: message.text,
        buttons: message.buttons,
        deliver,
      });
    }
  };

  // Count pending (unresolved) approvals for a session
  const countPendingForSession = (sessionKey: string): number => {
    let count = 0;
    for (const entry of pending.values()) {
      if (entry.request.request.sessionKey === sessionKey) {
        count++;
      }
    }
    return count;
  };

  const handleRequested = async (request: ExecApprovalRequest) => {
    const cfg = getConfig();
    const config = cfg.approvals?.exec;
    if (!shouldForward({ config, request })) return;

    const targets = resolveTargets(cfg, request);
    if (targets.length === 0) return;

    // Set up expiry timeout for this request
    const expiresInMs = Math.max(0, request.expiresAtMs - nowMs());
    const timeoutId = setTimeout(() => {
      void (async () => {
        const entry = pending.get(request.id);
        if (!entry) return;
        pending.delete(request.id);
        const expiredText = buildExpiredMessage(request);
        await deliverToTargets({ cfg, targets: entry.targets, text: expiredText, deliver });
      })();
    }, expiresInMs);
    timeoutId.unref?.();

    const pendingEntry: PendingApproval = { request, targets, timeoutId };
    pending.set(request.id, pendingEntry);

    // Batch by session key
    const sessionKey = request.request.sessionKey ?? "default";
    const now = nowMs();
    let batch = pendingBatches.get(sessionKey);

    // Check if there are already pending (unresolved) approvals for this session
    // (excluding the one we just added)
    const existingPendingCount = countPendingForSession(sessionKey) - 1;
    const hasPendingApprovals = existingPendingCount > 0;

    if (!batch) {
      // Start a new batch
      // Use extended window if there are already pending approvals for this session
      const windowMs = hasPendingApprovals ? BATCH_EXTEND_WINDOW_MS : BATCH_WINDOW_MS;

      batch = {
        sessionKey,
        requests: [],
        targets,
        flushTimeoutId: null,
        createdAtMs: now,
        lastRequestAtMs: now,
      };
      pendingBatches.set(sessionKey, batch);

      log.info(
        `exec approvals: starting new batch for session, window=${windowMs}ms, hasPending=${hasPendingApprovals}`,
      );

      // Set up flush timeout
      batch.flushTimeoutId = setTimeout(() => {
        void flushBatch(sessionKey);
      }, windowMs);
      batch.flushTimeoutId.unref?.();
    } else {
      // Batch already exists - extend the window if we haven't hit the max
      const batchAge = now - batch.createdAtMs;
      const timeRemaining = BATCH_MAX_WINDOW_MS - batchAge;

      if (timeRemaining > 0) {
        // Clear existing timeout and set a new one
        if (batch.flushTimeoutId) clearTimeout(batch.flushTimeoutId);

        // Use the shorter of: extended window or time remaining until max
        const extensionMs = Math.min(BATCH_EXTEND_WINDOW_MS, timeRemaining);

        log.info(
          `exec approvals: extending batch window by ${extensionMs}ms (age=${batchAge}ms, requests=${batch.requests.length + 1})`,
        );

        batch.flushTimeoutId = setTimeout(() => {
          void flushBatch(sessionKey);
        }, extensionMs);
        batch.flushTimeoutId.unref?.();
      } else {
        log.info(`exec approvals: batch at max window (${BATCH_MAX_WINDOW_MS}ms), will flush soon`);
      }

      batch.lastRequestAtMs = now;
    }

    batch.requests.push(request);
    // Merge targets (in case they differ, though unlikely)
    for (const target of targets) {
      const key = buildTargetKey(target);
      if (!batch.targets.some((t) => buildTargetKey(t) === key)) {
        batch.targets.push(target);
      }
    }
  };

  const handleResolved = async (resolved: ExecApprovalResolved) => {
    const entry = pending.get(resolved.id);
    if (!entry) return;
    if (entry.timeoutId) clearTimeout(entry.timeoutId);
    pending.delete(resolved.id);

    const cfg = getConfig();
    const text = buildResolvedMessage(resolved);
    await deliverToTargets({ cfg, targets: entry.targets, text, deliver });
  };

  const stop = () => {
    for (const entry of pending.values()) {
      if (entry.timeoutId) clearTimeout(entry.timeoutId);
    }
    pending.clear();
    for (const batch of pendingBatches.values()) {
      if (batch.flushTimeoutId) clearTimeout(batch.flushTimeoutId);
    }
    pendingBatches.clear();
  };

  return { handleRequested, handleResolved, stop };
}

export function shouldForwardExecApproval(params: {
  config?: ExecApprovalForwardingConfig;
  request: ExecApprovalRequest;
}): boolean {
  return shouldForward(params);
}
