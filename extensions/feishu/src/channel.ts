import {
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  getChatChannelMeta,
  type ChannelPlugin,
  type ResolvedAccount,
} from "clawdbot/plugin-sdk";

import { getFeishuRuntime } from "./runtime.js";
import { monitorFeishuProvider, sendMessageFeishu } from "./monitor.js";

const meta = getChatChannelMeta("feishu");

export const feishuPlugin: ChannelPlugin<ResolvedAccount> = {
  id: "feishu",
  meta: {
    ...meta,
    quickstartAllowFrom: true,
  },
  pairing: {
    idLabel: "feishuUserId",
    normalizeAllowEntry: (entry) => entry.replace(/^(feishu|fs):/i, ""),
    notifyApproval: async ({ id }) => {
      console.log(`[Feishu Plugin] Notifying user ${id} of approval`);
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: false,
    nativeCommands: false,
    blockStreaming: false,
  },
  reload: { configPrefixes: ["channels.feishu"] },
  configSchema: {
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
        appId: { type: "string" },
        appSecret: { type: "string" },
        encryptKey: { type: "string" },
        verificationToken: { type: "string" },
        webhookPath: { type: "string" },
        dmPolicy: { type: "string", enum: ["pairing", "open", "allowlist"] },
        allowFrom: { type: "array", items: { type: "string" } },
        groupPolicy: { type: "string", enum: ["open", "allowlist"] },
        groupAllowFrom: { type: "array", items: { type: "string" } },
      },
    },
  },
  config: {
    listAccountIds: (cfg) => {
      const accounts = [];
      if (cfg.channels?.feishu) {
        accounts.push("default");
      }
      return accounts;
    },
    resolveAccount: (cfg, accountId) => {
      return cfg.channels?.feishu || {};
    },
    defaultAccountId: (cfg) => {
      return cfg.channels?.feishu ? "default" : undefined;
    },
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const feishuConfig = cfg.channels?.feishu || {};
      if (accountId === "default") {
        return {
          ...cfg,
          channels: {
            ...cfg.channels,
            feishu: {
              ...feishuConfig,
              enabled,
            },
          },
        };
      }
      return cfg;
    },
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "feishu",
        accountId,
        clearBaseFields: ["appId", "appSecret", "encryptKey", "verificationToken", "webhookPath"],
      }),
    isConfigured: (account) => Boolean(account.appId?.trim() && account.appSecret?.trim()),
    describeAccount: (account) => ({
      accountId: account.accountId,
      enabled: account.enabled,
      configured: Boolean(account.appId?.trim() && account.appSecret?.trim()),
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const account = cfg.channels?.feishu || {};
      return account.allowFrom ?? [];
    },
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const feishuConfig = cfg.channels?.feishu || {};
      return {
        policy: feishuConfig.dmPolicy ?? "pairing",
        allowFrom: feishuConfig.allowFrom ?? [],
        allowFromPath: "channels.feishu.allowFrom",
        normalizeEntry: (raw) => raw.replace(/^(feishu|fs):/i, ""),
      };
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId, account }) => {
      const feishuConfig = cfg.channels?.feishu || {};
      return feishuConfig.groupPolicy === "allowlist";
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildAccountSnapshot: ({ account, runtime }) => {
      const configured = Boolean(account.appId?.trim() && account.appSecret?.trim());
      return {
        accountId: account.accountId,
        enabled: account.enabled,
        configured,
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        lastInboundAt: runtime?.lastInboundAt ?? null,
        lastOutboundAt: runtime?.lastOutboundAt ?? null,
      };
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: null,
    textChunkLimit: 2000,
    sendText: async ({ to, text, accountId, cfg }) => {
      const account = cfg.channels?.feishu || {};
      const result = await sendMessageFeishu(
        to,
        text,
        account.appId,
        account.appSecret,
      );
      return { channel: "feishu", ...result };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      const cfg = ctx.cfg;
      const feishuConfig = cfg.channels?.feishu || {};
      
      ctx.log?.info(`[${account.accountId}] starting Feishu provider`);
      
      return monitorFeishuProvider({
        appId: feishuConfig.appId,
        appSecret: feishuConfig.appSecret,
        encryptKey: feishuConfig.encryptKey,
        webhookPath: feishuConfig.webhookPath || "/feishu/events",
        accountId: account.accountId,
        config: cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: account.accountId, ...patch }),
      });
    },
  },
};
