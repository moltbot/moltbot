import {
  type ChannelPlugin,
  type ChannelAccountSnapshot,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  type ReplyPayload,
} from "clawdbot/plugin-sdk";
import { OneBotClient } from "./client.js";
import { QQConfigSchema, type QQConfig } from "./config.js";
import { getQQRuntime } from "./runtime.js";

export type ResolvedQQAccount = ChannelAccountSnapshot & {
  config: QQConfig;
  client?: OneBotClient;
};

function normalizeTarget(raw: string): string {
  return raw.replace(/^(qq:)/i, "");
}

const clients = new Map<string, OneBotClient>();

function getClientForAccount(accountId: string) {
    return clients.get(accountId);
}

export const qqChannel: ChannelPlugin<ResolvedQQAccount> = {
  id: "qq",
  meta: {
    id: "qq",
    label: "QQ (OneBot)",
    selectionLabel: "QQ",
    docsPath: "extensions/qq",
    blurb: "Connect to QQ via OneBot v11",
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    media: true,
  },
  configSchema: buildChannelConfigSchema(QQConfigSchema),
  config: {
    listAccountIds: (cfg) => {
        // @ts-ignore
        const qq = cfg.channels?.qq;
        if (!qq) return [];
        if (qq.accounts) return Object.keys(qq.accounts);
        return [DEFAULT_ACCOUNT_ID];
    },
    resolveAccount: (cfg, accountId) => {
        const id = accountId ?? DEFAULT_ACCOUNT_ID;
        // @ts-ignore
        const qq = cfg.channels?.qq;
        const accountConfig = id === DEFAULT_ACCOUNT_ID ? qq : qq?.accounts?.[id];
        
        return {
            accountId: id,
            name: accountConfig?.name ?? "QQ Default",
            enabled: true,
            configured: Boolean(accountConfig?.wsUrl),
            tokenSource: accountConfig?.accessToken ? "config" : "none",
            config: accountConfig || {},
        };
    },
    defaultAccountId: () => DEFAULT_ACCOUNT_ID,
    describeAccount: (acc) => ({
        accountId: acc.accountId,
        configured: acc.configured,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
        const { account, cfg } = ctx;
        const config = account.config;

        if (!config.wsUrl) {
            throw new Error("QQ: wsUrl is required");
        }

        const client = new OneBotClient({
            wsUrl: config.wsUrl,
            accessToken: config.accessToken,
        });
        
        clients.set(account.accountId, client);

        client.on("connect", () => {
             console.log(`[QQ] Connected account ${account.accountId}`);
             try {
                getQQRuntime().channel.activity.record({
                    channel: "qq",
                    accountId: account.accountId,
                    direction: "inbound", 
                 });
             } catch (err) {
                 // ignore
             }
        });

        client.on("message", async (event) => {
            if (event.post_type !== "message") return;

            const isGroup = event.message_type === "group";
            const userId = event.user_id;
            const groupId = event.group_id;
            const text = event.raw_message || "";
            
            if (config.admins && config.admins.length > 0 && userId) {
                if (!config.admins.includes(userId)) {
                    // Ignore
                }
            }

            const fromId = isGroup ? `group:${groupId}` : String(userId);
            const conversationLabel = isGroup ? `QQ Group ${groupId}` : `QQ User ${userId}`;
            const senderName = event.sender?.nickname || "Unknown";

            const runtime = getQQRuntime();

            // Create Dispatcher
            const deliver = async (payload: ReplyPayload) => {
                 const send = (msg: string) => {
                     if (isGroup) client.sendGroupMsg(groupId, msg);
                     else client.sendPrivateMsg(userId, msg);
                 };

                 if (payload.text) {
                     send(payload.text);
                 }
                 
                 if (payload.files) {
                     for (const file of payload.files) {
                         if (file.url) {
                            send(`[CQ:image,file=${file.url}]`);
                         }
                     }
                 }
            };

            const { dispatcher, replyOptions } = runtime.channel.reply.createReplyDispatcherWithTyping({
                deliver,
            });

            const ctxPayload = runtime.channel.reply.finalizeInboundContext({
                Provider: "qq",
                Channel: "qq",
                From: fromId,
                To: "qq:bot", 
                Body: text,
                RawBody: text,
                SenderId: String(userId),
                SenderName: senderName,
                ConversationLabel: conversationLabel,
                SessionKey: `qq:${fromId}`,
                AccountId: account.accountId,
                ChatType: isGroup ? "group" : "direct",
                Timestamp: event.time * 1000,
                OriginatingChannel: "qq",
                OriginatingTo: fromId,
                CommandAuthorized: true 
            });
            
            await runtime.channel.session.recordInboundSession({
                storePath: runtime.channel.session.resolveStorePath(cfg.session?.store, { agentId: "default" }),
                sessionKey: ctxPayload.SessionKey!,
                ctx: ctxPayload,
                updateLastRoute: {
                    sessionKey: ctxPayload.SessionKey!,
                    channel: "qq",
                    to: fromId,
                    accountId: account.accountId,
                },
                onRecordError: (err) => console.error("QQ Session Error:", err)
            });

            await runtime.channel.reply.dispatchReplyFromConfig({
                ctx: ctxPayload,
                cfg,
                dispatcher, // Passed dispatcher
                replyOptions, // Passed options
            });
        });

        client.connect();
        
        return () => {
            client.disconnect();
            clients.delete(account.accountId);
        };
    },
  },
  outbound: {
    sendText: async ({ to, text, accountId }) => {
        const client = getClientForAccount(accountId || DEFAULT_ACCOUNT_ID);
        if (!client) {
            console.warn(`[QQ] No client for account ${accountId}, cannot send text`);
            return { channel: "qq", sent: false, error: "Client not connected" };
        }

        if (to.startsWith("group:")) {
            const groupId = parseInt(to.replace("group:", ""), 10);
            client.sendGroupMsg(groupId, text);
        } else {
            const userId = parseInt(to, 10);
            client.sendPrivateMsg(userId, text);
        }
        
        return { channel: "qq", sent: true };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId }) => {
         const client = getClientForAccount(accountId || DEFAULT_ACCOUNT_ID);
         if (!client) {
            console.warn(`[QQ] No client for account ${accountId}, cannot send media`);
            return { channel: "qq", sent: false, error: "Client not connected" };
         }

         const cqImage = `[CQ:image,file=${mediaUrl}]`;
         const msg = text ? `${text}\n${cqImage}` : cqImage;

         if (to.startsWith("group:")) {
             const groupId = parseInt(to.replace("group:", ""), 10);
             client.sendGroupMsg(groupId, msg);
         } else {
             const userId = parseInt(to, 10);
             client.sendPrivateMsg(userId, msg);
         }
         return { channel: "qq", sent: true };
    }
  },
  messaging: {
      normalizeTarget: normalizeTarget,
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
  }
};
