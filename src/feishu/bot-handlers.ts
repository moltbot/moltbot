/**
 * Feishu webhook event handlers
 * @module feishu/bot-handlers
 */

import type * as lark from "@larksuiteoapi/node-sdk";

import type { OpenClawConfig } from "../config/config.js";
import { logVerbose } from "../globals.js";
import type { RuntimeEnv } from "../runtime.js";

import { isGroupAllowed, isUserAllowed } from "./accounts.js";
import { buildFeishuMessageContext } from "./bot-message-context.js";
import type {
  FeishuGroupConfig,
  FeishuInboundContext,
  FeishuMessageReceiveEvent,
  ResolvedFeishuAccount,
} from "./types.js";

export interface FeishuHandlerContext {
  cfg: OpenClawConfig;
  account: ResolvedFeishuAccount;
  runtime: RuntimeEnv;
  client: lark.Client;
  mediaMaxBytes: number;
  processMessage: (ctx: FeishuInboundContext) => Promise<void>;
}

export interface FeishuEventWrapper {
  event: FeishuMessageReceiveEvent;
  eventType: string;
}

/**
 * Resolve group-specific configuration
 */
export function resolveFeishuGroupConfig(params: {
  config: ResolvedFeishuAccount["config"];
  chatId?: string;
}): FeishuGroupConfig | undefined {
  const { config, chatId } = params;

  if (!chatId || !config.groups) {
    return undefined;
  }

  return config.groups[chatId];
}

/**
 * Check if an event should be processed based on policies
 */
export function shouldProcessFeishuEvent(
  event: FeishuMessageReceiveEvent,
  context: FeishuHandlerContext,
): { allowed: boolean; reason?: string } {
  const { account } = context;
  const config = account.config;

  const chatType = event.message.chat_type;
  const senderId = event.sender.sender_id.open_id ?? event.sender.sender_id.user_id ?? "";
  const chatId = event.message.chat_id;

  // Skip messages from apps (bots)
  if (event.sender.sender_type === "app") {
    return { allowed: false, reason: "sender is an app" };
  }

  // Check DM policy
  if (chatType === "p2p") {
    const dmPolicy = config.dmPolicy ?? "open";

    if (dmPolicy === "disabled") {
      return { allowed: false, reason: "DMs are disabled" };
    }

    if (dmPolicy === "allowlist") {
      if (!isUserAllowed(senderId, config.allowFrom)) {
        return { allowed: false, reason: "sender not in allowlist" };
      }
    }

    // pairing mode would be handled by the pairing system
  }

  // Check group policy
  if (chatType === "group") {
    const groupPolicy = config.groupPolicy ?? "open";

    if (groupPolicy === "disabled") {
      return { allowed: false, reason: "group messages are disabled" };
    }

    if (groupPolicy === "allowlist") {
      if (!isGroupAllowed(chatId, config.groupAllowFrom)) {
        return { allowed: false, reason: "group not in allowlist" };
      }
    }

    // Check mention requirement
    const groupConfig = resolveFeishuGroupConfig({ config, chatId });
    const requireMention = groupConfig?.requireMention ?? config.requireMention ?? true;

    if (requireMention) {
      const mentions = event.message.mentions ?? [];
      // Check if the bot is mentioned (would need bot's open_id to verify)
      // For now, assume any mention in the message counts
      if (mentions.length === 0) {
        return { allowed: false, reason: "mention required but not mentioned" };
      }
    }
  }

  return { allowed: true };
}

/**
 * Handle message receive event
 */
async function handleMessageEvent(
  event: FeishuMessageReceiveEvent,
  context: FeishuHandlerContext,
): Promise<void> {
  const { account, processMessage } = context;

  // Check if we should process this event
  const { allowed, reason } = shouldProcessFeishuEvent(event, context);
  if (!allowed) {
    logVerbose(`feishu: skipping message - ${reason}`);
    return;
  }

  // Build message context
  const messageContext = await buildFeishuMessageContext(event, context);

  if (!messageContext) {
    console.warn("feishu: failed to build message context");
    return;
  }

  // Process the message
  try {
    await processMessage(messageContext);
  } catch (error) {
    console.warn(`feishu: error processing message: ${error}`);
  }
}

/**
 * Main event handler for Feishu webhook events
 */
export async function handleFeishuWebhookEvents(
  eventWrapper: FeishuEventWrapper,
  context: FeishuHandlerContext,
): Promise<void> {
  const { event, eventType } = eventWrapper;

  logVerbose(`feishu: handling event type: ${eventType}`);

  switch (eventType) {
    case "im.message.receive_v1":
      await handleMessageEvent(event, context);
      break;

    // TODO: Add more event handlers as needed
    // case "im.message.reaction.created_v1":
    // case "im.chat.member.bot.added_v1":
    // case "im.chat.member.bot.deleted_v1":

    default:
      logVerbose(`feishu: unhandled event type: ${eventType}`);
  }
}
