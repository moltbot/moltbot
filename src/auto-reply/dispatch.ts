import type { MoltbotConfig } from "../config/config.js";
import { createInternalHookEvent, triggerInternalHook } from "../hooks/internal-hooks.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import type { FinalizedMsgContext, MsgContext } from "./templating.js";
import type { GetReplyOptions, ReplyPayload } from "./types.js";
import { finalizeInboundContext } from "./reply/inbound-context.js";
import type { DispatchFromConfigResult } from "./reply/dispatch-from-config.js";
import { dispatchReplyFromConfig } from "./reply/dispatch-from-config.js";
import {
  createReplyDispatcher,
  createReplyDispatcherWithTyping,
  type ReplyDispatcher,
  type ReplyDispatcherOptions,
  type ReplyDispatcherWithTypingOptions,
  type ReplyDispatchKind,
} from "./reply/reply-dispatcher.js";

export type DispatchInboundResult = DispatchFromConfigResult;

/**
 * Create an `onDelivered` callback that fires message:sent hooks
 * (both internal and plugin) after each reply is successfully delivered.
 */
function createMessageSentHook(
  ctx: FinalizedMsgContext,
  origOnDelivered?: (payload: ReplyPayload, info: { kind: ReplyDispatchKind }) => void,
): (payload: ReplyPayload, info: { kind: ReplyDispatchKind }) => void {
  const sessionKey = ctx.SessionKey ?? "";
  const channel = (ctx.OriginatingChannel ?? ctx.Surface ?? ctx.Provider ?? "").toLowerCase();
  const to = ctx.To ?? ctx.From ?? "";
  const accountId = ctx.AccountId;
  const conversationId = ctx.OriginatingTo ?? ctx.To ?? ctx.From;

  return (payload: ReplyPayload, info: { kind: ReplyDispatchKind }) => {
    origOnDelivered?.(payload, info);

    // Internal hook: message:sent
    void triggerInternalHook(
      createInternalHookEvent("message", "sent", sessionKey, {
        content: payload.text ?? "",
        channel,
        to,
        kind: info.kind,
      }),
    );

    // Plugin hook: message_sent
    const hookRunner = getGlobalHookRunner();
    if (hookRunner?.hasHooks("message_sent")) {
      void hookRunner
        .runMessageSent(
          { to, content: payload.text ?? "", success: true },
          { channelId: channel, accountId, conversationId },
        )
        .catch(() => {});
    }
  };
}

export async function dispatchInboundMessage(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: MoltbotConfig;
  dispatcher: ReplyDispatcher;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const finalized = finalizeInboundContext(params.ctx);
  return await dispatchReplyFromConfig({
    ctx: finalized,
    cfg: params.cfg,
    dispatcher: params.dispatcher,
    replyOptions: params.replyOptions,
    replyResolver: params.replyResolver,
  });
}

export async function dispatchInboundMessageWithBufferedDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: MoltbotConfig;
  dispatcherOptions: ReplyDispatcherWithTypingOptions;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const finalized = finalizeInboundContext(params.ctx);
  const onDelivered = createMessageSentHook(finalized, params.dispatcherOptions.onDelivered);

  const { dispatcher, replyOptions, markDispatchIdle } = createReplyDispatcherWithTyping({
    ...params.dispatcherOptions,
    onDelivered,
  });

  const result = await dispatchInboundMessage({
    ctx: finalized,
    cfg: params.cfg,
    dispatcher,
    replyResolver: params.replyResolver,
    replyOptions: {
      ...params.replyOptions,
      ...replyOptions,
    },
  });

  markDispatchIdle();
  return result;
}

export async function dispatchInboundMessageWithDispatcher(params: {
  ctx: MsgContext | FinalizedMsgContext;
  cfg: MoltbotConfig;
  dispatcherOptions: ReplyDispatcherOptions;
  replyOptions?: Omit<GetReplyOptions, "onToolResult" | "onBlockReply">;
  replyResolver?: typeof import("./reply.js").getReplyFromConfig;
}): Promise<DispatchInboundResult> {
  const finalized = finalizeInboundContext(params.ctx);
  const onDelivered = createMessageSentHook(finalized, params.dispatcherOptions.onDelivered);

  const dispatcher = createReplyDispatcher({
    ...params.dispatcherOptions,
    onDelivered,
  });
  const result = await dispatchInboundMessage({
    ctx: finalized,
    cfg: params.cfg,
    dispatcher,
    replyResolver: params.replyResolver,
    replyOptions: params.replyOptions,
  });
  await dispatcher.waitForIdle();
  return result;
}
