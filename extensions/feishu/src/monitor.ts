import type { IncomingMessage, ServerResponse } from "node:http";
import crypto from "node:crypto";

import type { MoltbotConfig } from "clawdbot/plugin-sdk";
import { dispatchReplyWithBufferedBlockDispatcher } from "../../../src/auto-reply/reply/provider-dispatcher.js";
import { resolveEffectiveMessagesConfig } from "../../../src/agents/identity.js";

class FeishuCipher {
  encryptKey;
  constructor(encryptKey) {
    this.encryptKey = encryptKey;
  }
  decrypt(encrypted) {
    const key = crypto.createHash("sha256").update(this.encryptKey).digest();
    const encryptedBuffer = Buffer.from(encrypted, "base64");
    const iv = encryptedBuffer.subarray(0, 16);
    const content = encryptedBuffer.subarray(16);
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    decipher.setAutoPadding(false);
    let decrypted = decipher.update(content);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    const pad = decrypted[decrypted.length - 1];
    if (pad < 1 || pad > 32) {
      return decrypted.toString("utf8");
    }
    return decrypted.subarray(0, decrypted.length - pad).toString("utf8");
  }
}

async function readJsonBody(req: IncomingMessage, maxBytes: number) {
  const chunks = [];
  let total = 0;
  return await new Promise<{ ok: boolean; value?: unknown; error?: string }>((resolve) => {
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        resolve({ ok: false, error: "payload too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        if (!raw.trim()) {
          resolve({ ok: false, error: "empty payload" });
          return;
        }
        resolve({ ok: true, value: JSON.parse(raw) as unknown });
      } catch (err) {
        resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
      }
    });
    req.on("error", (err) => {
      resolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  });
}

async function getFeishuAccessToken(appId: string, appSecret: string) {
  const response = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_id: appId,
      app_secret: appSecret,
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to get Feishu access token: ${response.status} ${JSON.stringify(error)}`);
  }
  
  const data = await response.json();
  return data.tenant_access_token;
}

export async function sendMessageFeishu(chatId: string, text: string, appId: string, appSecret: string) {
  const accessToken = await getFeishuAccessToken(appId, appSecret);
  
  const response = await fetch("https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      receive_id: chatId,
      content: JSON.stringify({ text }),
      msg_type: "text",
    }),
  });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Failed to send Feishu message: ${response.status} ${JSON.stringify(error)}`);
  }
  
  return await response.json();
}

export async function monitorFeishuProvider(opts: {
  appId: string;
  appSecret: string;
  encryptKey?: string;
  webhookPath: string;
  accountId: string;
  config: MoltbotConfig;
  runtime: any;
  abortSignal: AbortSignal;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}) {
  const { appId, appSecret, encryptKey, webhookPath, accountId, config, runtime, abortSignal, statusSink } = opts;
  
  console.log(`[${accountId}] Starting Feishu provider`);
  
  statusSink?.({ running: true, lastStartAt: Date.now() });
  
  try {
    await new Promise<void>((resolve) => {
      abortSignal.addEventListener("abort", () => {
        console.log(`[${accountId}] Stopping Feishu provider`);
        statusSink?.({ running: false, lastStopAt: Date.now() });
        resolve();
      }, { once: true });
    });
  } catch (err) {
    console.error(`[${accountId}] Feishu provider error: ${String(err)}`);
    statusSink?.({ running: false, lastError: String(err) });
    throw err;
  }
}

export function registerFeishuWebhook(api: any) {
  api.registerHttpRoute({
    path: "/feishu/events",
    handler: async (req: IncomingMessage, res: ServerResponse) => {
      const config = api.runtime.config.loadConfig();
      const feishuConfig = config.channels?.feishu;
      
      if (!feishuConfig) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Feishu not configured");
        return;
      }

      if (req.method !== "POST") {
        res.writeHead(405, { "Content-Type": "text/plain" });
        res.end("Method Not Allowed");
        return;
      }

      const bodyResult = await readJsonBody(req, 1024 * 1024);
      if (!bodyResult.ok) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(`Bad Request: ${bodyResult.error}`);
        return;
      }

      let body = bodyResult.value as any;
      console.log(`[Feishu Plugin] Received webhook event: ${JSON.stringify(body)}`);

      if (body.challenge) {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ challenge: body.challenge }));
        return;
      }

      if (body.encrypt) {
        const cipher = new FeishuCipher(feishuConfig.encryptKey);
        const decrypted = cipher.decrypt(body.encrypt);
        body = JSON.parse(decrypted);
        console.log(`[Feishu Plugin] Decrypted webhook event: ${JSON.stringify(body)}`);
      }

      if ((body.header && body.header.event_type === "im.message.receive_v1") || (body.event && body.event.type === "im.message.receive_v1")) {
        const message = body.event.message;
        const sender = body.event.sender;
        
        if (!message || !sender) {
          res.writeHead(400, { "Content-Type": "text/plain" });
          res.end("Bad Request: missing message or sender");
          return;
        }

        const senderId = sender.sender_id.user_id || sender.sender_id.open_id || sender.sender_id.union_id;
        const messageContent = message.content;
        const text = JSON.parse(messageContent).text || "";
        const messageId = message.message_id;
        const chatId = message.chat_id;
        
        console.log(`[Feishu Plugin] Sender ID: ${senderId}`);
        console.log(`[Feishu Plugin] Text: ${text}`);
        console.log(`[Feishu Plugin] Message ID: ${messageId}, Chat ID: ${chatId}`);
        console.log(`[Feishu Plugin] Dispatching message to agent...`);
        
        const allowFrom = feishuConfig.allowFrom || ["*"];
        const dmPolicy = feishuConfig.dmPolicy || "pairing";
        
        if (dmPolicy !== "open" && !allowFrom.includes("*") && !allowFrom.includes(senderId)) {
          console.log(`[Feishu Plugin] Sender ${senderId} not allowed`);
          res.writeHead(403, { "Content-Type": "text/plain" });
          res.end("Forbidden");
          return;
        }
        
        const ctxPayload = {
          From: senderId,
          To: chatId,
          Body: text,
          BodyForAgent: text,
          RawBody: text,
          CommandBody: text,
          BodyForCommands: text,
          SessionKey: `feishu:${chatId}`,
          MessageSid: messageId,
          MessageSidFull: messageId,
          ChatType: message.chat_type === "p2p" ? "direct" : "group",
          Provider: "feishu",
          Surface: "feishu",
          OriginatingChannel: "feishu",
          OriginatingTo: chatId,
          AccountId: "default",
          SenderId: senderId,
          BodyStripped: text,
          IsCommand: false,
          CommandSource: "native",
          CommandTargetSessionKey: `feishu:${chatId}`,
        };
        
        try {
          console.log(`[Feishu Plugin] Calling dispatchReplyWithBufferedBlockDispatcher...`);
          await dispatchReplyWithBufferedBlockDispatcher({
            ctx: ctxPayload,
            cfg: config,
            dispatcherOptions: {
              responsePrefix: resolveEffectiveMessagesConfig(config, "default").responsePrefix,
              deliver: async (payload, _info) => {
                console.log(`[Feishu Plugin] Received reply payload: ${JSON.stringify(payload)}`);
                const replyContent = payload.text || "";
                if (replyContent && feishuConfig.appId && feishuConfig.appSecret) {
                  try {
                    console.log(`[Feishu Plugin] Sending reply to ${chatId}: ${replyContent}`);
                    const result = await sendMessageFeishu(chatId, replyContent, feishuConfig.appId, feishuConfig.appSecret);
                    console.log(`[Feishu Plugin] Reply sent successfully: ${JSON.stringify(result)}`);
                  } catch (replyError) {
                    console.error(`[Feishu Plugin] Error sending AI reply: ${replyError.message}`);
                  }
                } else if (!replyContent) {
                  console.log(`[Feishu Plugin] No reply content to send`);
                } else if (!feishuConfig.appId || !feishuConfig.appSecret) {
                  console.log(`[Feishu Plugin] Missing Feishu appId or appSecret`);
                }
              },
              onError: (err, info) => {
                console.error(`[Feishu Plugin] Auto-reply error callback: ${String(err)} (${info.kind})`);
              },
            },
          });
          console.log(`[Feishu Plugin] dispatchReplyWithBufferedBlockDispatcher finished.`);
          
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        } catch (error) {
          console.error(`[Feishu Plugin] Critical error in dispatcher: ${error.message}\n${error.stack}`);
          res.writeHead(500, { "Content-Type": "text/plain" });
          res.end(`Internal Server Error: ${error.message}`);
        }
        return;
      }

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ success: true }));
    },
  });
}
