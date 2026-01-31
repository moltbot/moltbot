/**
 * Busy-agent-safe message delivery for any provider or internal caller.
 *
 * The gateway's agent method is two-phase: it acks immediately ("accepted")
 * then runs the agent turn asynchronously. A bare `callGateway` without
 * `expectFinal` resolves on the ack and closes the socket — silently losing
 * any error from the actual turn. Worse, if the agent is already mid-turn,
 * a second call spawns a concurrent run on the same session (no gateway-side
 * locking), causing interleaved output and last-write-wins session corruption.
 *
 * This module provides `sendDirectAgentMessage`, which checks the session's
 * embedded-run state and queue mode before deciding how to deliver, reusing
 * the steer/queue infrastructure from `subagent-announce`.
 */
import crypto from "node:crypto";

import { loadConfig } from "../config/config.js";
import {
  loadSessionStore,
  resolveAgentIdFromSessionKey,
  resolveStorePath,
} from "../config/sessions.js";
import { resolveQueueSettings } from "../auto-reply/reply/queue.js";
import { callGateway } from "../gateway/call.js";
import {
  type DeliveryContext,
  deliveryContextFromSession,
  mergeDeliveryContext,
  normalizeDeliveryContext,
} from "../utils/delivery-context.js";
import { isEmbeddedPiRunActive, queueEmbeddedPiMessage } from "./pi-embedded.js";
import { type AnnounceQueueItem, enqueueAnnounce } from "./subagent-announce-queue.js";

export type DirectAgentMessageResult = {
  outcome: "steered" | "queued" | "sent" | "error";
  error?: string;
};

/**
 * Send a message to an agent session with busy-agent safety.
 *
 * Unlike a bare `callGateway({ method: "agent" })`, this utility checks
 * whether the target session is already mid-turn and picks the safest
 * delivery strategy:
 *
 *  1. **Steer** — if the agent is active and the session's queue mode
 *     supports steering, injects the message into the running turn's
 *     input stream (no new agent turn spawned).
 *  2. **Queue** — if the agent is active but steering isn't available,
 *     enqueues the message for delivery after the current turn drains.
 *  3. **Send** — if the agent is idle, dispatches a direct gateway call
 *     with `expectFinal: true` so the caller observes success/failure
 *     (not just the "accepted" ack).
 *
 * The `log` callback receives structured events at every decision point
 * for traceability (resolve → steer/queue/send → result).
 */
export async function sendDirectAgentMessage(params: {
  sessionKey: string;
  message: string;
  deliveryContext?: DeliveryContext;
  summaryLine?: string;
  timeoutMs?: number;
  log?: (event: string, detail?: Record<string, unknown>) => void;
}): Promise<DirectAgentMessageResult> {
  const log = params.log ?? (() => {});
  try {
    const cfg = loadConfig();
    const agentId = resolveAgentIdFromSessionKey(params.sessionKey);
    const storePath = resolveStorePath(cfg.session?.store, { agentId });
    const store = loadSessionStore(storePath);
    const entry = store[params.sessionKey];
    const hasEntry = Boolean(entry);
    const sessionId = entry?.sessionId;

    log("direct_agent_resolve", { sessionKey: params.sessionKey, hasEntry, sessionId });

    // Merge explicit deliveryContext (primary) with session store context (fallback).
    // Callers that know the target channel/to (e.g., alerts routed to a specific
    // provider session) pass an explicit context; otherwise the session's last-known
    // delivery fields are used.
    const explicitContext = normalizeDeliveryContext(params.deliveryContext);
    const sessionContext = deliveryContextFromSession(entry);
    const merged = mergeDeliveryContext(explicitContext, sessionContext);

    const channel = merged?.channel;
    const to = merged?.to;
    const accountId = merged?.accountId;
    const threadId =
      merged?.threadId != null && merged.threadId !== "" ? String(merged.threadId) : undefined;

    // No active session → nothing to collide with; send directly.
    if (!sessionId) {
      await callGateway({
        method: "agent",
        params: {
          sessionKey: params.sessionKey,
          message: params.message,
          deliver: true,
          channel,
          accountId,
          to,
          threadId,
          idempotencyKey: crypto.randomUUID(),
        },
        expectFinal: true,
        timeoutMs: params.timeoutMs ?? 60_000,
      });
      log("direct_agent_sent", { sessionKey: params.sessionKey, channel, to });
      return { outcome: "sent" };
    }

    // Check whether the agent is busy and decide: steer, queue, or send.
    const queueSettings = resolveQueueSettings({
      cfg,
      channel: entry?.channel ?? entry?.lastChannel,
      sessionEntry: entry,
    });
    const isActive = isEmbeddedPiRunActive(sessionId);

    // Steer: inject the message into the active run's input stream.
    const shouldSteer = queueSettings.mode === "steer" || queueSettings.mode === "steer-backlog";
    if (shouldSteer) {
      const steered = queueEmbeddedPiMessage(sessionId, params.message);
      if (steered) {
        log("direct_agent_steered", { sessionKey: params.sessionKey, sessionId });
        return { outcome: "steered" };
      }
    }

    // Queue: agent is busy; park the message for delivery after the current turn.
    const shouldQueue =
      queueSettings.mode === "followup" ||
      queueSettings.mode === "collect" ||
      queueSettings.mode === "steer-backlog" ||
      queueSettings.mode === "interrupt" ||
      queueSettings.mode === "steer";
    if (isActive && shouldQueue) {
      enqueueAnnounce({
        key: params.sessionKey,
        item: {
          prompt: params.message,
          summaryLine: params.summaryLine,
          enqueuedAt: Date.now(),
          sessionKey: params.sessionKey,
          origin: merged,
        },
        settings: queueSettings,
        send: sendQueued,
      });
      log("direct_agent_queued", { sessionKey: params.sessionKey, sessionId });
      return { outcome: "queued" };
    }

    // Agent idle: send directly; expectFinal waits for completion, not just the ack.
    await callGateway({
      method: "agent",
      params: {
        sessionKey: params.sessionKey,
        message: params.message,
        deliver: true,
        channel,
        accountId,
        to,
        threadId,
        idempotencyKey: crypto.randomUUID(),
      },
      expectFinal: true,
      timeoutMs: params.timeoutMs ?? 60_000,
    });
    log("direct_agent_sent", { sessionKey: params.sessionKey, channel, to });
    return { outcome: "sent" };
  } catch (err) {
    log("direct_agent_error", { error: String(err) });
    return { outcome: "error", error: String(err) };
  }
}

/** Drain callback for enqueueAnnounce — sends with expectFinal for reliable delivery. */
async function sendQueued(item: AnnounceQueueItem) {
  const origin = item.origin;
  const threadId =
    origin?.threadId != null && origin.threadId !== "" ? String(origin.threadId) : undefined;
  await callGateway({
    method: "agent",
    params: {
      sessionKey: item.sessionKey,
      message: item.prompt,
      channel: origin?.channel,
      accountId: origin?.accountId,
      to: origin?.to,
      threadId,
      deliver: true,
      idempotencyKey: crypto.randomUUID(),
    },
    expectFinal: true,
    timeoutMs: 60_000,
  });
}
