/**
 * Session-aware outbound delivery.
 *
 * Provides a unified way to send messages to the active channel for a session
 * without needing to know the channel type or conversation details.
 */

import type { ReplyPayload } from "../../auto-reply/types.js";
import type { OpenClawConfig } from "../../config/config.js";
import { loadConfig } from "../../config/config.js";
import { resolveStorePath } from "../../config/sessions/paths.js";
import { loadSessionStore } from "../../config/sessions/store.js";
import type { SessionChannelId } from "../../config/sessions/types.js";
import {
  isDeliverableMessageChannel,
  type DeliverableMessageChannel,
} from "../../utils/message-channel.js";
import { deliverOutboundPayloads, type OutboundDeliveryResult } from "./deliver.js";

export type SendToSessionParams = {
  /** The session key to send to. */
  sessionKey: string;
  /** The text message to send. */
  text: string;
  /** Optional agent ID (defaults to "main"). */
  agentId?: string;
  /** Optional config override (will load from disk if not provided). */
  cfg?: OpenClawConfig;
  /** Optional media URLs to include. */
  mediaUrls?: string[];
  /** If true, errors are caught and logged instead of thrown. */
  bestEffort?: boolean;
};

export type SendToSessionResult =
  | { ok: true; results: OutboundDeliveryResult[] }
  | { ok: false; error: string };

/**
 * Resolve the outbound channel from a session channel ID.
 * Returns undefined if the channel is not a valid deliverable channel.
 */
function resolveOutboundChannel(
  channel: SessionChannelId | undefined,
): DeliverableMessageChannel | undefined {
  if (!channel) {
    return undefined;
  }
  // Use proper deliverable channel check instead of type cast
  if (!isDeliverableMessageChannel(channel)) {
    return undefined;
  }
  return channel;
}

/**
 * Send a message to the active channel for a session.
 *
 * Looks up the session metadata to determine the channel, destination, and
 * threading context, then delivers the message through the unified outbound
 * delivery system.
 *
 * @example
 * ```typescript
 * const result = await sendToSession({
 *   sessionKey: "telegram:123456789",
 *   text: "🔄 Compacting context...",
 * });
 * if (!result.ok) {
 *   console.error("Failed to send:", result.error);
 * }
 * ```
 */
export async function sendToSession(params: SendToSessionParams): Promise<SendToSessionResult> {
  const { sessionKey, text, agentId, mediaUrls, bestEffort } = params;

  // Load config if not provided
  let cfg = params.cfg;
  if (!cfg) {
    try {
      cfg = loadConfig();
    } catch (err) {
      return { ok: false, error: `Failed to load config: ${String(err)}` };
    }
  }

  // Resolve the session store path
  const storePath = resolveStorePath(cfg.session?.store, { agentId });

  // Load the session entry
  let store: Record<string, import("../../config/sessions/types.js").SessionEntry>;
  try {
    store = loadSessionStore(storePath);
  } catch (err) {
    return { ok: false, error: `Failed to load session store: ${String(err)}` };
  }

  const entry = store[sessionKey];
  if (!entry) {
    return { ok: false, error: `Session not found: ${sessionKey}` };
  }

  // Extract delivery context from session
  const channel = resolveOutboundChannel(entry.lastChannel);
  const to = entry.lastTo;
  const accountId = entry.lastAccountId;
  const threadId = entry.lastThreadId;

  if (!channel) {
    return { ok: false, error: `No channel found for session: ${sessionKey}` };
  }
  if (!to) {
    return { ok: false, error: `No destination found for session: ${sessionKey}` };
  }

  // Build payloads
  const payloads: ReplyPayload[] = [];
  if (mediaUrls?.length) {
    for (const url of mediaUrls) {
      payloads.push({ text: payloads.length === 0 ? text : "", mediaUrl: url });
    }
  } else {
    payloads.push({ text });
  }

  // Deliver
  try {
    const results = await deliverOutboundPayloads({
      cfg,
      channel,
      to,
      accountId,
      payloads,
      threadId,
      bestEffort,
    });
    return { ok: true, results };
  } catch (err) {
    return { ok: false, error: `Delivery failed: ${String(err)}` };
  }
}
