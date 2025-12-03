import type { MessageInstance } from "twilio/lib/rest/api/v2010/account/message.js";
import { autoReplyIfConfigured } from "../auto-reply/reply.js";
import { loadConfig, type WarelayConfig } from "../config/config.js";
import { readEnv } from "../env.js";
import { danger } from "../globals.js";
import { logDebug, logInfo, logWarn } from "../logger.js";
import { getQueueSize } from "../process/command-queue.js";
import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import { normalizeE164, sleep, withWhatsAppPrefix } from "../utils.js";
import { resolveReplyHeartbeatMinutes } from "../web/auto-reply.js";
import { createClient } from "./client.js";
import { runTwilioHeartbeatOnce } from "./heartbeat.js";

type MonitorDeps = {
  autoReplyIfConfigured: typeof autoReplyIfConfigured;
  listRecentMessages: (
    lookbackMinutes: number,
    limit: number,
    clientOverride?: ReturnType<typeof createClient>,
  ) => Promise<ListedMessage[]>;
  readEnv: typeof readEnv;
  createClient: typeof createClient;
  sleep: typeof sleep;
  // Heartbeat dependencies
  loadConfig: typeof loadConfig;
  runTwilioHeartbeatOnce: typeof runTwilioHeartbeatOnce;
  getQueueSize: typeof getQueueSize;
};

const DEFAULT_POLL_INTERVAL_SECONDS = 5;

export type ListedMessage = {
  sid: string;
  status: string | null;
  direction: string | null;
  dateCreated: Date | undefined;
  from?: string | null;
  to?: string | null;
  body?: string | null;
  errorCode: number | null;
  errorMessage: string | null;
};

type MonitorOptions = {
  client?: ReturnType<typeof createClient>;
  maxIterations?: number;
  deps?: MonitorDeps;
  runtime?: RuntimeEnv;
  // Heartbeat options
  heartbeatNow?: boolean; // Run heartbeat immediately on start
  heartbeatMinutes?: number; // Override config value
};

const defaultDeps: MonitorDeps = {
  autoReplyIfConfigured,
  listRecentMessages: () => Promise.resolve([]),
  readEnv,
  createClient,
  sleep,
  // Heartbeat deps
  loadConfig,
  runTwilioHeartbeatOnce,
  getQueueSize,
};

// Lightweight mutex for serializing heartbeat and auto-reply
let inFlightLock: Promise<void> = Promise.resolve();

function acquireLock(): Promise<() => void> {
  let release: (() => void) | undefined;
  const prev = inFlightLock;
  inFlightLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  return prev.then(() => {
    if (!release) throw new Error("Lock release function not set");
    return release;
  });
}

// Resolve recipient for heartbeat: uses lastInboundFrom or first non-wildcard allowFrom entry
function resolveHeartbeatRecipient(
  cfg: WarelayConfig,
  lastInboundFrom: string | undefined,
): string | null {
  // Prefer last inbound sender
  if (lastInboundFrom) {
    // Strip whatsapp: prefix if present
    const cleaned = lastInboundFrom.replace(/^whatsapp:/, "");
    return normalizeE164(cleaned);
  }
  // Fall back to first non-wildcard allowFrom entry
  const allowFrom = cfg.inbound?.allowFrom ?? [];
  const nonWildcard = allowFrom.filter((v) => v !== "*");
  if (nonWildcard.length > 0 && nonWildcard[0]) {
    return normalizeE164(nonWildcard[0]);
  }
  return null;
}

// State tracking for heartbeat
type HeartbeatState = {
  lastInboundFrom: string | undefined;
  lastInboundAt: number | undefined;
};

// Run heartbeat once with serialization
async function runTwilioHeartbeatLoop(params: {
  deps: MonitorDeps;
  runtime: RuntimeEnv;
  cfg: WarelayConfig;
  state: HeartbeatState;
}) {
  const { deps, runtime, cfg, state } = params;

  const release = await acquireLock();
  try {
    // Check if command queue is busy
    if (deps.getQueueSize() > 0) {
      logInfo("heartbeat: skipped (requests in flight)", runtime);
      return;
    }

    const recipient = resolveHeartbeatRecipient(cfg, state.lastInboundFrom);
    if (!recipient) {
      logInfo(
        "heartbeat: skipped (no recipient - configure allowFrom or wait for inbound)",
        runtime,
      );
      return;
    }

    // Check idle time threshold if configured
    const idleMinutes =
      cfg.inbound?.reply?.session?.heartbeatIdleMinutes ??
      cfg.inbound?.reply?.session?.idleMinutes;
    if (idleMinutes && state.lastInboundAt) {
      const idleMs = Date.now() - state.lastInboundAt;
      if (idleMs < idleMinutes * 60_000) {
        logInfo(
          `heartbeat: skipped (idle ${Math.floor(idleMs / 60_000)}m < ${idleMinutes}m)`,
          runtime,
        );
        return;
      }
    }

    await deps.runTwilioHeartbeatOnce({
      to: recipient,
      runtime,
      cfg,
    });
  } finally {
    release();
  }
}

// Poll Twilio for inbound messages and auto-reply when configured.
export async function monitorTwilio(
  pollSeconds: number,
  lookbackMinutes: number,
  opts?: MonitorOptions,
) {
  const deps = opts?.deps ?? defaultDeps;
  const runtime = opts?.runtime ?? defaultRuntime;
  const maxIterations = opts?.maxIterations ?? Infinity;
  let backoffMs = 1_000;

  const env = deps.readEnv(runtime);
  const from = withWhatsAppPrefix(env.whatsappFrom);
  const client = opts?.client ?? deps.createClient(env);

  // Load config and resolve heartbeat minutes
  const cfg = deps.loadConfig();
  const heartbeatMinutes = resolveReplyHeartbeatMinutes(
    cfg,
    opts?.heartbeatMinutes,
  );

  // Heartbeat state tracking
  const heartbeatState: HeartbeatState = {
    lastInboundFrom: undefined,
    lastInboundAt: undefined,
  };
  let heartbeatTimer: NodeJS.Timeout | null = null;

  // Cleanup function for the heartbeat timer
  const clearHeartbeatTimer = () => {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  };

  // Log startup info
  const heartbeatInfo = heartbeatMinutes
    ? `Heartbeat: every ${heartbeatMinutes}m`
    : "Heartbeat: disabled";
  logInfo(
    `📡 Monitoring inbound messages to ${from} (poll ${pollSeconds}s, lookback ${lookbackMinutes}m) | ${heartbeatInfo}`,
    runtime,
  );

  // Set up heartbeat timer if enabled
  if (heartbeatMinutes) {
    const intervalMs = heartbeatMinutes * 60_000;
    heartbeatTimer = setInterval(() => {
      void runTwilioHeartbeatLoop({
        deps,
        runtime,
        cfg,
        state: heartbeatState,
      }).catch((err) => {
        runtime.error(danger(`Heartbeat error: ${String(err)}`));
      });
    }, intervalMs);

    // Run immediate heartbeat if requested
    if (opts?.heartbeatNow) {
      void runTwilioHeartbeatLoop({
        deps,
        runtime,
        cfg,
        state: heartbeatState,
      }).catch((err) => {
        runtime.error(danger(`Immediate heartbeat error: ${String(err)}`));
      });
    }
  }

  let lastSeenSid: string | undefined;
  let iterations = 0;

  try {
    while (iterations < maxIterations) {
      let messages: ListedMessage[] = [];
      try {
        messages =
          (await deps.listRecentMessages(lookbackMinutes, 50, client)) ?? [];
        backoffMs = 1_000; // reset after success
      } catch (err) {
        logWarn(
          `Twilio polling failed (will retry in ${backoffMs}ms): ${String(err)}`,
          runtime,
        );
        await deps.sleep(backoffMs);
        backoffMs = Math.min(backoffMs * 2, 10_000);
        continue;
      }
      const inboundOnly = messages.filter((m) => m.direction === "inbound");
      // Sort newest -> oldest without relying on external helpers (avoids test mocks clobbering imports).
      const newestFirst = [...inboundOnly].sort(
        (a, b) =>
          (b.dateCreated?.getTime() ?? 0) - (a.dateCreated?.getTime() ?? 0),
      );

      // Update heartbeat state from newest inbound message
      if (newestFirst.length > 0 && newestFirst[0].from) {
        heartbeatState.lastInboundFrom = newestFirst[0].from;
        heartbeatState.lastInboundAt = newestFirst[0].dateCreated?.getTime();
      }

      await handleMessages(messages, client, lastSeenSid, deps, runtime);
      lastSeenSid = newestFirst.length ? newestFirst[0].sid : lastSeenSid;
      iterations += 1;
      if (iterations >= maxIterations) break;
      await deps.sleep(
        Math.max(pollSeconds, DEFAULT_POLL_INTERVAL_SECONDS) * 1000,
      );
    }
  } finally {
    clearHeartbeatTimer();
  }
}

// Track all seen message SIDs to avoid re-processing
const seenMessageSids = new Set<string>();

// Export for testing - reset seen message SIDs between test runs
export function resetSeenMessageSids() {
  seenMessageSids.clear();
}

// Export for testing
export { resolveHeartbeatRecipient };

async function handleMessages(
  messages: ListedMessage[],
  client: ReturnType<typeof createClient>,
  lastSeenSid: string | undefined,
  deps: MonitorDeps,
  runtime: RuntimeEnv,
) {
  for (const m of messages) {
    if (!m.sid) continue;
    // Skip messages we've already seen/logged
    if (seenMessageSids.has(m.sid)) continue;
    seenMessageSids.add(m.sid);
    // Limit set size to prevent memory leak
    if (seenMessageSids.size > 1000) {
      const oldestSids = Array.from(seenMessageSids).slice(0, 500);
      for (const sid of oldestSids) {
        seenMessageSids.delete(sid);
      }
    }
    if (lastSeenSid && m.sid === lastSeenSid) break; // stop at previously seen
    logDebug(`[${m.sid}] ${m.from ?? "?"} -> ${m.to ?? "?"}: ${m.body ?? ""}`);
    if (m.direction !== "inbound") continue;
    if (!m.from || !m.to) continue;
    try {
      await deps.autoReplyIfConfigured(
        client as unknown as import("./types.js").TwilioRequester & {
          messages: { create: (opts: unknown) => Promise<unknown> };
        },
        m as unknown as MessageInstance,
        undefined,
        runtime,
      );
    } catch (err) {
      runtime.error(danger(`Auto-reply failed: ${String(err)}`));
    }
  }
}
