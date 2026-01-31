/**
 * Discord reaction trigger dispatch module.
 *
 * When reactionTrigger is enabled, this module handles invoking an agent turn
 * when a user reacts to a message, instead of just queueing a system event.
 */

import type { Client, Message, User } from "@buape/carbon";

import { dispatchInboundMessage } from "../../auto-reply/dispatch.js";
import { formatInboundEnvelope, resolveEnvelopeFormatOptions } from "../../auto-reply/envelope.js";
import { createReplyDispatcherWithTyping } from "../../auto-reply/reply/reply-dispatcher.js";
import { finalizeInboundContext } from "../../auto-reply/reply/inbound-context.js";
import { resolveStorePath } from "../../config/sessions.js";
import { recordInboundSession } from "../../channels/session.js";
import { danger, logVerbose } from "../../globals.js";
import type { ResolvedAgentRoute } from "../../routing/resolve-route.js";
import { normalizeDiscordSlug } from "./allow-list.js";
import { formatDiscordUserTag } from "./format.js";
import { deliverDiscordReply } from "./reply-delivery.js";

type LoadedConfig = ReturnType<typeof import("../../config/config.js").loadConfig>;
type Logger = ReturnType<typeof import("../../logging/subsystem.js").createSubsystemLogger>;

export type DiscordReactionTriggerParams = {
  cfg: LoadedConfig;
  client: Client;
  accountId: string;
  token: string;
  logger: Logger;
  route: ResolvedAgentRoute;
  // Reaction info
  emoji: string;
  action: "added" | "removed";
  reactor: User;
  // Message info
  message: Message<true> | null;
  messageId: string;
  channelId: string;
  guildId: string;
  guildSlug?: string;
  channelSlug?: string;
};

/**
 * Format the body text for a reaction-triggered agent turn.
 */
function formatReactionTriggerBody(params: {
  emoji: string;
  action: "added" | "removed";
  reactor: User;
  messageContent?: string;
  messageAuthor?: User;
}): string {
  const { emoji, action, reactor, messageContent, messageAuthor } = params;
  const reactorTag = formatDiscordUserTag(reactor);
  const authorTag = messageAuthor ? formatDiscordUserTag(messageAuthor) : "unknown";

  const actionLabel = action === "added" ? "reacted with" : "removed reaction";

  // Format as a clear action request, not just a notification
  if (messageContent?.trim()) {
    return `${reactorTag} ${actionLabel} ${emoji} to this message from ${authorTag}:\n"${messageContent}"\n\nPlease acknowledge or respond to this reaction.`;
  }
  return `${reactorTag} ${actionLabel} ${emoji} to a message. Please acknowledge this reaction.`;
}

/**
 * Dispatch a reaction as an agent turn.
 *
 * This creates a synthetic inbound message from the reaction and invokes the agent,
 * similar to how a regular message would be processed.
 */
export async function dispatchReactionTrigger(params: DiscordReactionTriggerParams): Promise<void> {
  const {
    cfg,
    client,
    accountId,
    token,
    logger,
    route,
    emoji,
    action,
    reactor,
    message,
    messageId,
    channelId,
    guildId,
    guildSlug,
    channelSlug,
  } = params;

  try {
    const messageContent = message?.content ?? undefined;
    const messageAuthor = message?.author ?? undefined;

    // Build the body text
    const body = formatReactionTriggerBody({
      emoji,
      action,
      reactor,
      messageContent,
      messageAuthor,
    });

    // Build envelope options
    const envelopeOptions = resolveEnvelopeFormatOptions(cfg);

    // Format as inbound envelope
    const fromLabel = guildSlug
      ? `Discord ${guildSlug} #${channelSlug ?? channelId}`
      : `Discord #${channelSlug ?? channelId}`;
    const senderTag = formatDiscordUserTag(reactor);
    const timestamp = Date.now();

    const combinedBody = formatInboundEnvelope({
      channel: "Discord",
      from: fromLabel,
      timestamp,
      body,
      chatType: "channel",
      senderLabel: senderTag,
      envelope: envelopeOptions,
    });

    // Build inbound context
    const ctxPayload = finalizeInboundContext({
      Body: combinedBody,
      RawBody: body,
      CommandBody: body,
      From: `discord:${reactor.id}`,
      To: `channel:${channelId}`,
      SessionKey: route.sessionKey,
      AccountId: accountId,
      ChatType: "channel",
      ConversationLabel: fromLabel,
      SenderName: reactor.globalName ?? reactor.username,
      SenderId: reactor.id,
      SenderUsername: reactor.username,
      SenderTag: senderTag,
      GroupChannel: channelSlug ? `#${channelSlug}` : undefined,
      GroupSpace: guildId,
      Provider: "discord",
      Surface: "discord",
      WasMentioned: false,
      // Use a unique MessageSid for reactions to avoid dedupe with the original message
      MessageSid: `${messageId}:reaction:${reactor.id}:${emoji}:${action}`,
      Timestamp: timestamp,
      CommandAuthorized: true,
      CommandSource: "reaction",
      OriginatingChannel: "discord",
      OriginatingTo: `channel:${channelId}`,
    });

    // Record session
    const storePath = resolveStorePath(cfg.session?.store, { agentId: route.agentId });
    await recordInboundSession({
      storePath,
      sessionKey: route.sessionKey,
      ctx: ctxPayload,
      onRecordError: (err: unknown) => {
        logVerbose(`discord reaction trigger: failed to record session: ${String(err)}`);
      },
    });

    logVerbose(
      `discord reaction trigger: ${emoji} by ${senderTag} on msg ${messageId} → dispatching to agent`,
    );

    // Create reply dispatcher
    const discordConfig = cfg.channels?.discord;
    const textLimit = discordConfig?.textChunkLimit ?? 2000;

    const { dispatcher, replyOptions, markDispatchIdle } = createReplyDispatcherWithTyping({
      deliver: async (payload) => {
        await deliverDiscordReply({
          replies: [payload],
          target: `channel:${channelId}`,
          token,
          accountId,
          rest: client.rest,
          runtime: {
            log: () => {},
            error: (msg: string) => logger.error(msg),
            exit: (() => {}) as unknown as (code: number) => never,
          },
          textLimit,
        });
      },
      onError: (err: unknown, info: { kind: string }) => {
        logger.error(danger(`discord reaction trigger ${info.kind} failed: ${String(err)}`));
      },
    });

    // Dispatch to agent
    await dispatchInboundMessage({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions,
    });

    markDispatchIdle();
  } catch (err) {
    logger.error(danger(`discord reaction trigger failed: ${String(err)}`));
  }
}
