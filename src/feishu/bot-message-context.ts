/**
 * Feishu message context builder
 * @module feishu/bot-message-context
 */

import { logVerbose } from "../globals.js";

import type { FeishuHandlerContext } from "./bot-handlers.js";
import type {
  FeishuInboundContext,
  FeishuMessageReceiveEvent,
  FeishuMessageType,
  FeishuTextContent,
} from "./types.js";

/**
 * Parse message content based on type
 */
function parseMessageContent(
  messageType: FeishuMessageType,
  contentStr: string,
): { content: unknown; text?: string } {
  try {
    const content = JSON.parse(contentStr);

    switch (messageType) {
      case "text": {
        const textContent = content as FeishuTextContent;
        return { content, text: textContent.text };
      }

      case "post": {
        // Rich text - extract plain text from paragraphs
        const texts: string[] = [];
        const postContent = content as {
          zh_cn?: { title?: string; content?: unknown[][] };
          en_us?: { title?: string; content?: unknown[][] };
        };

        // Try zh_cn first, then en_us
        const post = postContent.zh_cn ?? postContent.en_us;
        if (post?.title) {
          texts.push(post.title);
        }

        if (post?.content && Array.isArray(post.content)) {
          for (const paragraph of post.content) {
            if (Array.isArray(paragraph)) {
              for (const element of paragraph) {
                if (
                  element &&
                  typeof element === "object" &&
                  "text" in element &&
                  typeof element.text === "string"
                ) {
                  texts.push(element.text);
                }
              }
            }
          }
        }

        return { content, text: texts.join(" ").trim() };
      }

      case "image":
      case "file":
      case "audio":
      case "media":
      case "sticker":
        // Media types - no text content
        return { content, text: undefined };

      case "interactive":
        // Card message - might have text in elements
        return { content, text: undefined };

      default:
        return { content, text: undefined };
    }
  } catch (error) {
    console.warn(`feishu: failed to parse message content: ${error}`);
    return { content: contentStr, text: undefined };
  }
}

/**
 * Extract media attachments from message
 */
function extractMediaAttachments(
  messageType: FeishuMessageType,
  content: unknown,
): Array<{
  type: "image" | "file" | "audio" | "video";
  key: string;
  name?: string;
}> {
  const attachments: Array<{
    type: "image" | "file" | "audio" | "video";
    key: string;
    name?: string;
  }> = [];

  if (!content || typeof content !== "object") {
    return attachments;
  }

  switch (messageType) {
    case "image": {
      const imageContent = content as { image_key?: string };
      if (imageContent.image_key) {
        attachments.push({
          type: "image",
          key: imageContent.image_key,
        });
      }
      break;
    }

    case "file": {
      const fileContent = content as { file_key?: string; file_name?: string };
      if (fileContent.file_key) {
        attachments.push({
          type: "file",
          key: fileContent.file_key,
          name: fileContent.file_name,
        });
      }
      break;
    }

    case "audio": {
      const audioContent = content as { file_key?: string };
      if (audioContent.file_key) {
        attachments.push({
          type: "audio",
          key: audioContent.file_key,
        });
      }
      break;
    }

    case "media": {
      const mediaContent = content as { file_key?: string; image_key?: string };
      if (mediaContent.file_key) {
        attachments.push({
          type: "video",
          key: mediaContent.file_key,
        });
      }
      break;
    }
  }

  return attachments;
}

/**
 * Check if bot is mentioned in the message
 */
function checkBotMentioned(event: FeishuMessageReceiveEvent, botOpenId?: string): boolean {
  const mentions = event.message.mentions ?? [];

  if (mentions.length === 0) {
    return false;
  }

  // If we have bot's open_id, check for exact match
  if (botOpenId) {
    return mentions.some((m) => m.id.open_id === botOpenId);
  }

  // Otherwise, assume bot is mentioned if there are any mentions
  // (The SDK should filter to only relevant events)
  return mentions.length > 0;
}

/**
 * Build inbound message context from Feishu event
 */
export async function buildFeishuMessageContext(
  event: FeishuMessageReceiveEvent,
  context: FeishuHandlerContext,
): Promise<FeishuInboundContext | null> {
  const { account } = context;

  try {
    const message = event.message;
    const sender = event.sender;

    // Parse message content
    const { content, text } = parseMessageContent(message.message_type, message.content);

    // Extract media
    const media = extractMediaAttachments(message.message_type, content);

    // Get sender ID
    const senderId =
      sender.sender_id.open_id ?? sender.sender_id.user_id ?? sender.sender_id.union_id ?? "";

    // Build mentions array
    const mentions = (message.mentions ?? []).map((m) => ({
      key: m.key,
      id: m.id.open_id ?? m.id.user_id ?? m.id.union_id ?? "",
      name: m.name,
    }));

    // Check if bot is mentioned
    const isMentioned = checkBotMentioned(event);

    // Remove @mention placeholders from text
    let cleanedText = text;
    if (cleanedText && mentions.length > 0) {
      for (const mention of mentions) {
        // Feishu uses @_user_X format for mentions in text
        cleanedText = cleanedText.replace(new RegExp(`@_user_\\d+`, "g"), "").trim();
        cleanedText = cleanedText.replace(new RegExp(`@${mention.name}`, "g"), "").trim();
      }
    }

    const messageContext: FeishuInboundContext = {
      messageId: message.message_id,
      chatId: message.chat_id,
      chatType: message.chat_type,
      senderId,
      senderUserId: sender.sender_id.user_id,
      messageType: message.message_type,
      content,
      text: cleanedText || text,
      isMentioned,
      mentions,
      media: media.length > 0 ? media : undefined,
      parentId: message.parent_id,
      rootId: message.root_id,
      rawEvent: event,
      account,
      timestamp: parseInt(message.create_time, 10),
    };

    logVerbose(
      `feishu: built context for message ${message.message_id} ` +
      `(type: ${message.message_type}, chat: ${message.chat_type})`,
    );

    return messageContext;
  } catch (error) {
    console.warn(`feishu: failed to build message context: ${error}`);
    return null;
  }
}
