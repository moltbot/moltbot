/**
 * Feishu message sending functions
 * @module feishu/send
 */

import type * as lark from "@larksuiteoapi/node-sdk";

import { logVerbose } from "../globals.js";

import type {
  FeishuCardContent,
  FeishuPostContent,
  FeishuSendResult,
  ResolvedFeishuAccount,
} from "./types.js";

export type ReceiveIdType = "open_id" | "user_id" | "union_id" | "email" | "chat_id";

export interface SendMessageParams {
  client: lark.Client;
  receiveId: string;
  receiveIdType: ReceiveIdType;
  content: string;
  msgType: string;
  /** Optional: reply to a specific message */
  replyMessageId?: string;
}

/**
 * Send a message using the Lark SDK
 */
export async function sendMessage(params: SendMessageParams): Promise<FeishuSendResult> {
  const { client, receiveId, receiveIdType, content, msgType, replyMessageId } = params;

  logVerbose(`feishu: sending ${msgType} message to ${receiveIdType}:${receiveId}`);

  try {
    const response = await client.im.message.create({
      params: {
        receive_id_type: receiveIdType,
      },
      data: {
        receive_id: receiveId,
        msg_type: msgType,
        content,
        ...(replyMessageId && { reply_in_thread: true }),
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu API error: ${response.code} - ${response.msg}`);
    }

    const messageId = response.data?.message_id ?? "";
    logVerbose(`feishu: message sent successfully: ${messageId}`);

    return {
      messageId,
      chatId: receiveId,
    };
  } catch (error) {
    console.warn(`feishu: failed to send message: ${error}`);
    throw error;
  }
}

/**
 * Send a text message
 */
export async function sendTextMessage(
  client: lark.Client,
  receiveId: string,
  text: string,
  opts?: {
    receiveIdType?: ReceiveIdType;
    replyMessageId?: string;
  },
): Promise<FeishuSendResult> {
  const content = JSON.stringify({ text });

  return sendMessage({
    client,
    receiveId,
    receiveIdType: opts?.receiveIdType ?? "chat_id",
    content,
    msgType: "text",
    replyMessageId: opts?.replyMessageId,
  });
}

/**
 * Send a rich text (post) message
 */
export async function sendRichTextMessage(
  client: lark.Client,
  receiveId: string,
  post: FeishuPostContent,
  opts?: {
    receiveIdType?: ReceiveIdType;
    replyMessageId?: string;
    language?: "zh_cn" | "en_us" | "ja_jp";
  },
): Promise<FeishuSendResult> {
  const language = opts?.language ?? "zh_cn";
  const content = JSON.stringify({
    [language]: {
      title: post.title,
      content: post.content,
    },
  });

  return sendMessage({
    client,
    receiveId,
    receiveIdType: opts?.receiveIdType ?? "chat_id",
    content,
    msgType: "post",
    replyMessageId: opts?.replyMessageId,
  });
}

/**
 * Send an interactive card message
 */
export async function sendCardMessage(
  client: lark.Client,
  receiveId: string,
  card: FeishuCardContent,
  opts?: {
    receiveIdType?: ReceiveIdType;
    replyMessageId?: string;
  },
): Promise<FeishuSendResult> {
  const content = JSON.stringify(card);

  return sendMessage({
    client,
    receiveId,
    receiveIdType: opts?.receiveIdType ?? "chat_id",
    content,
    msgType: "interactive",
    replyMessageId: opts?.replyMessageId,
  });
}

/**
 * Send an image message
 */
export async function sendImageMessage(
  client: lark.Client,
  receiveId: string,
  imageKey: string,
  opts?: {
    receiveIdType?: ReceiveIdType;
    replyMessageId?: string;
  },
): Promise<FeishuSendResult> {
  const content = JSON.stringify({ image_key: imageKey });

  return sendMessage({
    client,
    receiveId,
    receiveIdType: opts?.receiveIdType ?? "chat_id",
    content,
    msgType: "image",
    replyMessageId: opts?.replyMessageId,
  });
}

/**
 * Send a file message
 */
export async function sendFileMessage(
  client: lark.Client,
  receiveId: string,
  fileKey: string,
  opts?: {
    receiveIdType?: ReceiveIdType;
    replyMessageId?: string;
  },
): Promise<FeishuSendResult> {
  const content = JSON.stringify({ file_key: fileKey });

  return sendMessage({
    client,
    receiveId,
    receiveIdType: opts?.receiveIdType ?? "chat_id",
    content,
    msgType: "file",
    replyMessageId: opts?.replyMessageId,
  });
}

/**
 * Reply to a message
 */
export async function replyMessage(
  client: lark.Client,
  messageId: string,
  text: string,
): Promise<FeishuSendResult> {
  logVerbose(`feishu: replying to message ${messageId}`);

  try {
    const response = await client.im.message.reply({
      path: {
        message_id: messageId,
      },
      data: {
        msg_type: "text",
        content: JSON.stringify({ text }),
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu API error: ${response.code} - ${response.msg}`);
    }

    const replyMessageId = response.data?.message_id ?? "";
    logVerbose(`feishu: reply sent successfully: ${replyMessageId}`);

    return {
      messageId: replyMessageId,
      chatId: "", // Not available in reply response
    };
  } catch (error) {
    console.warn(`feishu: failed to reply message: ${error}`);
    throw error;
  }
}

/**
 * Reply with a card message
 */
export async function replyCardMessage(
  client: lark.Client,
  messageId: string,
  card: FeishuCardContent,
): Promise<FeishuSendResult> {
  logVerbose(`feishu: replying with card to message ${messageId}`);

  try {
    const response = await client.im.message.reply({
      path: {
        message_id: messageId,
      },
      data: {
        msg_type: "interactive",
        content: JSON.stringify(card),
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu API error: ${response.code} - ${response.msg}`);
    }

    const replyMessageId = response.data?.message_id ?? "";
    return {
      messageId: replyMessageId,
      chatId: "",
    };
  } catch (error) {
    console.warn(`feishu: failed to reply with card: ${error}`);
    throw error;
  }
}

/**
 * Upload an image and get image_key
 */
export async function uploadImage(
  client: lark.Client,
  imageData: Buffer,
  imageType: "message" | "avatar" = "message",
): Promise<string> {
  logVerbose(`feishu: uploading image (${imageData.length} bytes)`);

  try {
    const response = await client.im.image.create({
      data: {
        image_type: imageType,
        image: imageData,
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu API error: ${response.code} - ${response.msg}`);
    }

    const imageKey = response.data?.image_key ?? "";
    logVerbose(`feishu: image uploaded: ${imageKey}`);
    return imageKey;
  } catch (error) {
    console.warn(`feishu: failed to upload image: ${error}`);
    throw error;
  }
}

/**
 * Upload a file and get file_key
 */
export async function uploadFile(
  client: lark.Client,
  fileData: Buffer,
  fileName: string,
  fileType: "opus" | "mp4" | "pdf" | "doc" | "xls" | "ppt" | "stream",
): Promise<string> {
  logVerbose(`feishu: uploading file "${fileName}" (${fileData.length} bytes)`);

  try {
    const response = await client.im.file.create({
      data: {
        file_type: fileType,
        file_name: fileName,
        file: fileData,
      },
    });

    if (response.code !== 0) {
      throw new Error(`Feishu API error: ${response.code} - ${response.msg}`);
    }

    const fileKey = response.data?.file_key ?? "";
    logVerbose(`feishu: file uploaded: ${fileKey}`);
    return fileKey;
  } catch (error) {
    console.warn(`feishu: failed to upload file: ${error}`);
    throw error;
  }
}

/**
 * Get user info by user ID
 */
export async function getUserInfo(
  client: lark.Client,
  userId: string,
  userIdType: "open_id" | "user_id" | "union_id" = "open_id",
): Promise<{
  name?: string;
  enName?: string;
  avatarUrl?: string;
  email?: string;
} | null> {
  try {
    const response = await client.contact.user.get({
      path: {
        user_id: userId,
      },
      params: {
        user_id_type: userIdType,
      },
    });

    if (response.code !== 0) {
      console.warn(`feishu: failed to get user info: ${response.msg}`);
      return null;
    }

    return {
      name: response.data?.user?.name,
      enName: response.data?.user?.en_name,
      avatarUrl: response.data?.user?.avatar?.avatar_origin,
      email: response.data?.user?.email,
    };
  } catch (error) {
    console.warn(`feishu: failed to get user info: ${error}`);
    return null;
  }
}
