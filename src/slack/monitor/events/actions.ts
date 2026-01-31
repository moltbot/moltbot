import type { SlackActionMiddlewareArgs } from "@slack/bolt";

import { danger } from "../../../globals.js";
import { enqueueSystemEvent } from "../../../infra/system-events.js";

import { resolveSlackChannelLabel } from "../channel-config.js";
import type { SlackMonitorContext } from "../context.js";

export function registerSlackBlockActions(params: { ctx: SlackMonitorContext }) {
  const { ctx } = params;

  // Check if action() method is available on the app instance
  if (typeof (ctx.app as { action?: unknown }).action !== "function") {
    return;
  }

  // Match all action_ids with "openclaw_" prefix from our skills
  (
    ctx.app as unknown as {
      action: (
        pattern: RegExp,
        handler: (args: SlackActionMiddlewareArgs) => Promise<void>,
      ) => void;
    }
  ).action(/^openclaw_/, async (args: SlackActionMiddlewareArgs) => {
    const { ack, body } = args;
    const action = args.action as { action_id?: string; value?: string; action_ts?: string };

    try {
      await ack(); // Must acknowledge within 3 seconds

      if (ctx.shouldDropMismatchedSlackEvent(body)) {
        return;
      }

      // Channel ID can be in body.channel.id or body.container.channel_id depending on context
      const typedBody = body as {
        channel?: { id?: string };
        container?: { channel_id?: string; message_ts?: string };
      };
      const channelId = typedBody.channel?.id ?? typedBody.container?.channel_id;
      const messageTs = typedBody.container?.message_ts;
      const channelInfo = channelId ? await ctx.resolveChannelName(channelId) : undefined;
      const channelType = channelInfo?.type;

      if (
        channelId &&
        !ctx.isChannelAllowed({
          channelId,
          channelName: channelInfo?.name,
          channelType,
        })
      ) {
        return;
      }

      const channelLabel = resolveSlackChannelLabel({
        channelId,
        channelName: channelInfo?.name,
      });

      const userInfo = body.user?.id ? await ctx.resolveUserName(body.user.id) : undefined;
      const userLabel = userInfo?.name ?? body.user?.id ?? "someone";

      const actionId = action.action_id ?? "unknown";
      const actionValue = action.value ?? "";

      // Build descriptive text for the agent
      const text = `Slack button clicked: "${actionId}" with value "${actionValue}" by ${userLabel} in ${channelLabel}`;

      const sessionKey = ctx.resolveSlackSystemEventSessionKey({
        channelId,
        channelType,
      });

      // Use message_ts or action_ts for stable dedupe key (trigger_id is per-interaction and often absent)
      const dedupeTs = messageTs ?? action.action_ts ?? "";

      enqueueSystemEvent(text, {
        sessionKey,
        contextKey: `slack:block_action:${actionId}:${channelId ?? ""}:${dedupeTs}`,
      });
    } catch (err) {
      ctx.runtime.error?.(danger(`slack block action handler failed: ${String(err)}`));
    }
  });
}
