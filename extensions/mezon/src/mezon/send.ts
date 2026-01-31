import { getMezonRuntime } from "../runtime.js";
import { resolveMezonAccount } from "./accounts.js";
import {
  createMezonBotClient,
  loginMezonClient,
  sendMezonChannelMessage,
  sendMezonDM,
  type MezonBotClient,
} from "./client.js";

export type MezonSendOpts = {
  token?: string;
  accountId?: string;
  mediaUrl?: string;
  replyToId?: string;
  clanId?: string;
  botClient?: MezonBotClient;
};

export type MezonSendResult = {
  messageId: string;
  channelId: string;
};

type MezonTarget = { kind: "channel"; id: string } | { kind: "user"; id: string };

const DM_CLAN_ID = "0";

const getCore = () => getMezonRuntime();

function normalizeMessage(text: string, mediaUrl?: string): string {
  const trimmed = text.trim();
  const media = mediaUrl?.trim();
  return [trimmed, media].filter(Boolean).join("\n");
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function parseMezonTarget(raw: string): MezonTarget {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("Recipient is required for Mezon sends");
  }
  const lower = trimmed.toLowerCase();
  if (lower.startsWith("channel:")) {
    const id = trimmed.slice("channel:".length).trim();
    if (!id) {
      throw new Error("Channel id is required for Mezon sends");
    }
    return { kind: "channel", id };
  }
  if (lower.startsWith("user:")) {
    const id = trimmed.slice("user:".length).trim();
    if (!id) {
      throw new Error("User id is required for Mezon sends");
    }
    return { kind: "user", id };
  }
  if (lower.startsWith("mezon:")) {
    const id = trimmed.slice("mezon:".length).trim();
    if (!id) {
      throw new Error("User id is required for Mezon sends");
    }
    return { kind: "user", id };
  }
  if (trimmed.startsWith("@")) {
    const id = trimmed.slice(1).trim();
    if (!id) {
      throw new Error("User id is required for Mezon sends");
    }
    return { kind: "user", id };
  }
  return { kind: "channel", id: trimmed };
}

export async function sendMessageMezon(
  to: string,
  text: string,
  opts: MezonSendOpts = {},
): Promise<MezonSendResult> {
  const core = getCore();
  const logger = core.logging.getChildLogger({ module: "mezon" });
  logger.info?.(
    `[DEBUG] sendMessageMezon called: to=${to} textLength=${text?.length ?? 0} hasExistingClient=${!!opts.botClient}`,
  );
  const cfg = core.config.loadConfig();
  const account = resolveMezonAccount({
    cfg,
    accountId: opts.accountId,
  });

  const target = parseMezonTarget(to);

  // Use provided botClient if available, otherwise create a new one
  let botClient: MezonBotClient;
  if (opts.botClient) {
    logger.info?.(`[DEBUG] Reusing existing bot client`);
    botClient = opts.botClient;
  } else {
    logger.info?.(`[DEBUG] Creating new bot client and logging in`);
    const token = opts.token?.trim() || account.token?.trim();
    if (!token) {
      throw new Error(
        `Mezon bot token missing for account "${account.accountId}" (set channels.mezon.accounts.${account.accountId}.token or MEZON_TOKEN for default).`,
      );
    }

    const botId = account.botId?.trim();
    if (!botId) {
      throw new Error(
        `Mezon bot ID missing for account "${account.accountId}" (set channels.mezon.accounts.${account.accountId}.botId).`,
      );
    }

    botClient = createMezonBotClient(token, botId);
    await loginMezonClient(botClient);
  }

  let message = text?.trim() ?? "";
  const mediaUrl = opts.mediaUrl?.trim();
  if (mediaUrl) {
    // For Mezon, we append media URLs as text since the SDK handles attachments differently
    if (isHttpUrl(mediaUrl)) {
      message = normalizeMessage(message, mediaUrl);
    } else {
      // Try to load local media and append URL
      try {
        const media = await core.media.loadWebMedia(mediaUrl);
        if (media.url) {
          message = normalizeMessage(message, media.url);
        }
      } catch (err) {
        if (core.logging.shouldLogVerbose()) {
          logger.debug?.(
            `mezon send: media load failed, falling back to text only: ${String(err)}`,
          );
        }
      }
    }
  }

  if (message) {
    const tableMode = core.channel.text.resolveMarkdownTableMode({
      cfg,
      channel: "mezon",
      accountId: account.accountId,
    });
    message = core.channel.text.convertMarkdownTables(message, tableMode);
  }

  if (!message) {
    throw new Error("Mezon message is empty");
  }

  let result: { message_id?: string } = {};
  let channelId: string;

  if (target.kind === "user") {
    const clanId = opts.clanId ?? DM_CLAN_ID;
    result = await sendMezonDM(botClient, {
      userId: target.id,
      clanId,
      message,
      replyToId: opts.replyToId,
    });
    channelId = `dm:${target.id}`;
  } else {
    result = await sendMezonChannelMessage(botClient, {
      channelId: target.id,
      message,
      replyToId: opts.replyToId,
    });
    channelId = target.id;
  }

  core.channel.activity.record({
    channel: "mezon",
    accountId: account.accountId,
    direction: "outbound",
  });

  return {
    messageId: result.message_id ?? "unknown",
    channelId,
  };
}
