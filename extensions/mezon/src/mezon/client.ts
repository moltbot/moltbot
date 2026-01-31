import os from "node:os";

import { MezonClient } from "mezon-sdk";

export type MezonBotClient = {
  client: MezonClient;
  token: string;
};

export type MezonUser = {
  id: string;
  username?: string | null;
  display_name?: string | null;
};

export type MezonChannelInfo = {
  id: string;
  channel_label?: string | null;
  channel_type?: number | null;
  clan_id?: string | null;
};

export type MezonMessage = {
  message_id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  clan_id?: string;
  is_public?: boolean;
  mode?: number;
  username?: string;
  display_name?: string;
  clan_nick?: string;
  attachments?: MezonAttachment[];
  mentions?: MezonMention[];
  references?: MezonReference[];
  create_time?: string;
};

export type MezonAttachment = {
  url?: string;
  filename?: string;
  filetype?: string;
  size?: number;
};

export type MezonMention = {
  user_id?: string;
  username?: string;
  role_id?: string;
  s?: number;
  e?: number;
};

export type MezonReference = {
  message_id?: string;
  message_ref_id?: string;
  ref_type?: number;
  message_sender_id?: string;
  content?: string;
};

export function createMezonBotClient(token: string, botId: string): MezonBotClient {
  if (!token.trim()) {
    throw new Error("Mezon bot token is required");
  }
  if (!botId.trim()) {
    throw new Error("Mezon bot ID is required");
  }

  // The mezon-sdk MessageDatabase creates a "./mezon-cache/" directory relative
  // to process.cwd(). On Windows the gateway may start from C:\Windows\System32
  // which is not writable. Temporarily switch CWD to the user's home directory
  // for the synchronous MezonClient constructor.
  const prevCwd = process.cwd();
  try {
    process.chdir(os.homedir());
  } catch {
    // ignore – original CWD may be fine
  }
  try {
    const client = new MezonClient({ botId: botId.trim(), token: token.trim() });
    return { client, token: token.trim() };
  } finally {
    try {
      process.chdir(prevCwd);
    } catch {
      // ignore restore failure
    }
  }
}

export async function loginMezonClient(botClient: MezonBotClient): Promise<void> {
  await botClient.client.login();
}

export async function fetchMezonBotUser(
  botClient: MezonBotClient,
  botIdHint?: string,
): Promise<MezonUser | null> {
  try {
    // Try to access the session from the Mezon SDK client
    const session = (botClient.client as Record<string, unknown>).session as
      | { user_id?: string; username?: string }
      | undefined;
    if (session?.user_id) {
      return {
        id: session.user_id,
        username: session.username ?? null,
      };
    }

    // Fallback: try to get bot info from the SDK's user property
    const user = (botClient.client as Record<string, unknown>).user as
      | { id?: string; username?: string }
      | undefined;
    if (user?.id) {
      return {
        id: user.id,
        username: user.username ?? null,
      };
    }

    // Final fallback: use the bot ID from the client configuration if provided
    if (botIdHint?.trim()) {
      return {
        id: botIdHint.trim(),
        username: null,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Send a message to a Mezon channel.
 */
export async function sendMezonChannelMessage(
  botClient: MezonBotClient,
  params: {
    channelId: string;
    clanId?: string;
    message: string;
    mode?: number;
    isPublic?: boolean;
    replyToId?: string;
  },
): Promise<{ message_id?: string }> {
  const content: Record<string, unknown> = { t: params.message };
  const references = params.replyToId
    ? [{ message_ref_id: params.replyToId, ref_type: 0 }]
    : undefined;

  const channel = await botClient.client.channels.fetch(params.channelId);
  const result = await channel.send(
    content,
    undefined, // mentions
    undefined, // attachments
    references,
  );
  return { message_id: (result as Record<string, unknown>)?.message_id as string | undefined };
}

/**
 * Send a DM to a Mezon user.
 *
 * Creates (or fetches) a DM channel via the SDK's ChannelManager and then
 * sends the message through the normal channel-message path.  This avoids
 * `clans.fetch()` which only reads from the in-memory cache — a cache that
 * is always empty when `send.ts` creates a fresh MezonClient per send.
 */
export async function sendMezonDM(
  botClient: MezonBotClient,
  params: {
    userId: string;
    clanId: string;
    message: string;
    replyToId?: string;
  },
): Promise<{ message_id?: string }> {
  // Access the SDK's channel manager to create / retrieve a DM channel.
  const channelManager = (botClient.client as Record<string, unknown>).channelManager as
    | { createDMchannel(userId: string): Promise<{ channel_id?: string } | null> }
    | undefined;

  if (!channelManager?.createDMchannel) {
    throw new Error("Mezon SDK channelManager.createDMchannel is not available");
  }

  const dmChannel = await channelManager.createDMchannel(params.userId);
  const channelId = dmChannel?.channel_id;
  if (!channelId) {
    throw new Error(`Cannot create DM channel for user ${params.userId}`);
  }

  return sendMezonChannelMessage(botClient, {
    channelId,
    message: params.message,
    replyToId: params.replyToId,
  });
}
