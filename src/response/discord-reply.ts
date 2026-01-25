/**
 * Discordリプライ形式
 *
 * 元メッセージを引用してDiscordに返信する
 */

import type { Message } from "@buape/carbon";

import type { ReplyOptions, ReplyData, ReplyEmbed, QuoteMetadata, ReplyAuthor } from "./types.js";
import { ResponseFormat } from "./types.js";

/**
 * Discordリプライオプション拡張
 */
export interface DiscordReplyOptions extends ReplyOptions {
  /** APIクライアント */
  api: { rest: { post: (path: string, body: unknown) => Promise<unknown> } };
  /** RESTクライアント */
  rest?: unknown;
  /** 返信先チャンネルID */
  channelId: string;
  /** 返信先メッセージID */
  messageId: string;
  /** スレッドID (ある場合) */
  threadId?: string;
}

/**
 * AllowedMentions型
 */
interface AllowedMentionsTypes {
  parse: {
    users: boolean;
    roles: boolean;
    everyone: boolean;
  };
  users?: string[];
  roles?: string[];
}

/**
 * Discord引用形式を作成
 */
function buildDiscordQuote(quote: QuoteMetadata): string {
  const lines: string[] = [];

  // 送信者情報
  const authorTag = quote.author.bot ? `@${quote.author.name} (bot)` : `@${quote.author.name}`;
  const timestamp = new Date(quote.timestamp).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });

  lines.push(`> **${authorTag}** (${timestamp})`);

  // 元メッセージテキスト（引用符付き）
  const quotedText = quote.originalText
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

  lines.push(quotedText);
  lines.push(""); // 空行で引用終了

  return lines.join("\n");
}

/**
 * AllowedMentionsを構築
 */
function buildAllowedMentions(options: ReplyOptions): AllowedMentionsTypes {
  const mentions: AllowedMentionsTypes = {
    parse: {
      users: options.allowedMentions?.users === true,
      roles: options.allowedMentions?.roles === true,
      everyone: options.allowedMentions?.everyone === true,
    },
    users:
      options.allowedMentions?.users === true
        ? undefined
        : Array.isArray(options.allowedMentions?.users)
          ? options.allowedMentions?.users
          : undefined,
    roles:
      options.allowedMentions?.roles === true
        ? undefined
        : Array.isArray(options.allowedMentions?.roles)
          ? options.allowedMentions?.roles
          : undefined,
  };

  return mentions;
}

/**
 * Embedを構築
 */
function buildEmbeds(embeds: ReplyEmbed[]): Record<string, unknown>[] {
  return embeds.map((embed) => {
    const data: Record<string, unknown> = {};

    if (embed.title) data.title = embed.title;
    if (embed.description) data.description = embed.description;
    if (embed.url) data.url = embed.url;
    if (embed.color !== undefined) data.color = embed.color;
    if (embed.fields) {
      data.fields = embed.fields.map((f) => ({
        name: f.name,
        value: f.value,
        inline: f.inline ?? false,
      }));
    }
    if (embed.footer) {
      data.footer = {
        text: embed.footer.text,
        icon_url: embed.footer.iconUrl,
      };
    }
    if (embed.imageUrl) data.image = { url: embed.imageUrl };
    if (embed.thumbnailUrl) data.thumbnail = { url: embed.thumbnailUrl };

    return data;
  });
}

/**
 * Discordに返信
 *
 * @param replyData - 返信データ
 * @param options - オプション
 */
export async function sendReply(replyData: ReplyData, options: DiscordReplyOptions): Promise<void> {
  const { api, channelId, messageId } = options;

  // 引用メタデータ構築
  const quote: QuoteMetadata = {
    messageId,
    originalText: "", // TODO: 元メッセージから取得
    author: options.author || {
      name: "Unknown",
      userId: "",
    },
    timestamp: options.timestamp ?? Date.now(),
    channel: {
      id: channelId,
      name: "", // TODO: チャンネル名を取得
    },
  };

  // レスポンス構築
  let content = "";

  // 引用形式を先頭に追加
  if (replyData.text) {
    content = buildDiscordQuote(quote) + replyData.text;
  }

  // メンション設定
  const allowedMentions = buildAllowedMentions(options);

  // ファイル添付がある場合
  if (options.fileUrls && options.fileUrls.length > 0) {
    // 最初のメッセージでテキスト+最初のファイル
    await api.rest.post(`/channels/${channelId}/messages`, {
      content,
      allowed_mentions: allowedMentions,
      attachments: options.fileUrls.slice(0, 1).map((url, i) => ({
        id: i.toString(),
        description: `artifact-${i}`,
        url,
      })),
      message_reference: {
        channel_id: channelId,
        message_id: messageId,
      },
    });

    // 追加ファイルを別メッセージで送信
    for (const fileUrl of options.fileUrls.slice(1)) {
      await api.rest.post(`/channels/${channelId}/messages`, {
        content: "",
        attachments: [
          {
            id: "0",
            description: "artifact",
            url: fileUrl,
          },
        ],
      });
    }
    return;
  }

  // Embedがある場合
  if (options.embeds && options.embeds.length > 0) {
    await api.rest.post(`/channels/${channelId}/messages`, {
      content,
      allowed_mentions: allowedMentions,
      embeds: buildEmbeds(options.embeds),
      message_reference: {
        channel_id: channelId,
        message_id: messageId,
      },
    });
    return;
  }

  // シンプルテキスト返信
  await api.rest.post(`/channels/${channelId}/messages`, {
    content,
    allowed_mentions: allowedMentions,
    message_reference: {
      channel_id: channelId,
      message_id: messageId,
      fail_if_not_exists: false,
    },
  });
}

/**
 * Discordメッセージからリプライデータを生成
 *
 * @param originalMessage - 元メッセージ
 * @param responseText - 返信テキスト
 * @param options - オプション
 * @returns リプライデータ
 */
export function createDiscordReply(
  originalMessage: Message,
  responseText: string,
  options: Partial<ReplyOptions> = {},
): { data: ReplyData; options: Omit<DiscordReplyOptions, "api"> } {
  const author: ReplyAuthor = {
    name: (originalMessage.author as { username?: string })?.username ?? "Unknown",
    userId: originalMessage.author?.id ?? undefined,
    avatarUrl: originalMessage.author?.avatarUrl ?? undefined,
    bot: (originalMessage.author as { bot?: boolean })?.bot ?? false,
  };

  const replyData: ReplyData = {
    text: responseText,
    options: {
      allowedMentions: {
        users: false,
        roles: false,
        everyone: false,
      },
      ...options,
    },
  };

  return {
    data: replyData,
    options: {
      ...options,
      author,
      timestamp: originalMessage.timestamp
        ? typeof originalMessage.timestamp === "string"
          ? new Date(originalMessage.timestamp).getTime()
          : originalMessage.timestamp
        : Date.now(),
      channelId: originalMessage.channelId,
      messageId: originalMessage.id,
    },
  };
}
