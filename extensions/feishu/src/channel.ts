import type {
  ChannelAccountSnapshot,
  ChannelDock,
  ChannelPlugin,
  ClawdbotConfig,
} from "clawdbot/plugin-sdk";
import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  missingTargetError,
  normalizeAccountId,
  PAIRING_APPROVED_MESSAGE,
  setAccountEnabledInConfigSection,
} from "clawdbot/plugin-sdk";

import { getBotIdentity, sendFeishuTextMessage } from "./api.js";
import {
  listFeishuAccountIds,
  resolveDefaultFeishuAccountId,
  resolveFeishuAccount,
  type ResolvedFeishuAccount,
} from "./accounts.js";
import { FeishuConfigSchema } from "./config-schema.js";
import { feishuOnboardingAdapter } from "./onboarding.js";
import { probeFeishu } from "./probe.js";
import { resolveFeishuWebhookPath, startFeishuMonitor } from "./monitor.js";
import {
  looksLikeFeishuTargetId,
  normalizeFeishuMessagingTarget,
  parseFeishuMessagingTarget,
} from "./targets.js";
import { getFeishuRuntime } from "./runtime.js";

const meta = {
  id: "feishu",
  label: "Feishu",
  selectionLabel: "Feishu (Bot API)",
  docsPath: "/channels/feishu",
  docsLabel: "feishu",
  blurb: "Feishu bot with HTTP webhook events.",
  aliases: ["fs"],
  order: 85,
  quickstartAllowFrom: true,
} as const;

const formatAllowFromEntry = (entry: string) =>
  entry
    .trim()
    .replace(/^feishu:/i, "")
    .replace(/^fs:/i, "")
    .replace(/^user:/i, "")
    .replace(/^open_id:/i, "")
    .replace(/^openid:/i, "")
    .toLowerCase();

export const feishuDock: ChannelDock = {
  id: "feishu",
  capabilities: {
    chatTypes: ["direct", "group"],
    blockStreaming: true,
  },
  outbound: { textChunkLimit: 4000 },
  config: {
    resolveAllowFrom: ({ cfg, accountId }) =>
      (
        resolveFeishuAccount({ cfg: cfg as ClawdbotConfig, accountId }).config.dm?.allowFrom ?? []
      ).map((entry) => String(entry)),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry))
        .filter(Boolean)
        .map(formatAllowFromEntry),
  },
  groups: {
    resolveRequireMention: () => true,
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
};

function targetHint() {
  return "<user:OPEN_ID|chat:CHAT_ID>";
}

export const feishuPlugin: ChannelPlugin<ResolvedFeishuAccount> = {
  id: "feishu",
  meta: { ...meta },
  onboarding: feishuOnboardingAdapter,
  pairing: {
    idLabel: "feishuOpenId",
    normalizeAllowEntry: (entry) => formatAllowFromEntry(entry),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveFeishuAccount({ cfg: cfg as ClawdbotConfig });
      if (account.credentialSource === "none") return;
      const openId = formatAllowFromEntry(id);
      await sendFeishuTextMessage({
        account,
        target: { kind: "user", openId },
        text: PAIRING_APPROVED_MESSAGE,
      });
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: false,
    polls: false,
    nativeCommands: false,
    blockStreaming: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  reload: { configPrefixes: ["channels.feishu"] },
  configSchema: buildChannelConfigSchema(FeishuConfigSchema),
  config: {
    listAccountIds: (cfg) => listFeishuAccountIds(cfg as ClawdbotConfig),
    resolveAccount: (cfg, accountId) =>
      resolveFeishuAccount({ cfg: cfg as ClawdbotConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultFeishuAccountId(cfg as ClawdbotConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as ClawdbotConfig,
        sectionKey: "feishu",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as ClawdbotConfig,
        sectionKey: "feishu",
        accountId,
        clearBaseFields: [
          "appId",
          "appSecret",
          "verificationToken",
          "encryptKey",
          "webhookPath",
          "webhookUrl",
          "name",
        ],
      }),
    isConfigured: (account) => account.credentialSource !== "none",
    describeAccount: (account): ChannelAccountSnapshot => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.credentialSource !== "none",
      credentialSource: account.credentialSource,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (
        resolveFeishuAccount({ cfg: cfg as ClawdbotConfig, accountId }).config.dm?.allowFrom ?? []
      ).map((entry) => String(entry)),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry))
        .filter(Boolean)
        .map(formatAllowFromEntry),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(
        (cfg as ClawdbotConfig).channels?.feishu?.accounts?.[resolvedAccountId],
      );
      const basePath = useAccountPath
        ? `channels.feishu.accounts.${resolvedAccountId}.`
        : "channels.feishu.";
      return {
        policy: account.config.dm?.policy ?? "pairing",
        allowFrom: account.config.dm?.allowFrom ?? [],
        policyPath: `${basePath}dm.policy`,
        allowFromPath: `${basePath}dm.`,
        approveHint: formatPairingApproveHint("feishu"),
        normalizeEntry: (raw) => formatAllowFromEntry(raw),
      };
    },
    collectWarnings: ({ cfg, account }) => {
      const warnings: string[] = [];
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy === "open") {
        warnings.push(
          `- Feishu groups: groupPolicy="open" allows any group not explicitly denied to trigger (mention-gated). Set channels.feishu.groupPolicy="allowlist" and configure channels.feishu.groups.`,
        );
      }
      return warnings;
    },
  },
  groups: {
    resolveRequireMention: () => true,
    resolveToolPolicy: () => ({ mode: "allow" }),
  },
  threading: {
    resolveReplyToMode: () => "off",
  },
  messaging: {
    normalizeTarget: normalizeFeishuMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeFeishuTargetId,
      hint: targetHint(),
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveFeishuAccount({ cfg: cfg as ClawdbotConfig, accountId });
      const q = query?.trim().toLowerCase() || "";
      const ids = new Set<string>();
      for (const entry of account.config.dm?.allowFrom ?? []) {
        const trimmed = String(entry).trim();
        if (trimmed && trimmed !== "*") ids.add(trimmed);
      }
      return Array.from(ids)
        .map(formatAllowFromEntry)
        .filter((id) => (q ? id.includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "user", id }) as const);
    },
    listGroups: async ({ cfg, accountId, query, limit }) => {
      const account = resolveFeishuAccount({ cfg: cfg as ClawdbotConfig, accountId });
      const q = query?.trim().toLowerCase() || "";
      const groups = account.config.groups ?? {};
      const ids = Object.keys(groups)
        .map((id) => id.trim())
        .filter((id) => id && id !== "*")
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "group", id }) as const);
      return ids;
    },
  },
  resolver: {
    resolveTargets: async ({ inputs, kind }) => {
      const resolved = inputs.map((input) => {
        const normalized = normalizeFeishuMessagingTarget(input);
        if (!normalized) {
          return { input, resolved: false, note: "empty target" };
        }
        if (kind === "user" && normalized.toLowerCase().startsWith("user:")) {
          return { input, resolved: true, id: normalized };
        }
        if (kind === "group" && normalized.toLowerCase().startsWith("chat:")) {
          return { input, resolved: true, id: normalized };
        }
        return { input, resolved: false, note: targetHint() };
      });
      return resolved;
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg as ClawdbotConfig,
        channelKey: "feishu",
        accountId,
        name,
      }),
    validateInput: ({ input }) => {
      if (input.useEnv) {
        return "Feishu does not support --use-env; set appId/appSecret in config.";
      }
      const appId = (input as { appId?: unknown }).appId;
      const appSecret = (input as { appSecret?: unknown }).appSecret;
      const verificationToken = (input as { verificationToken?: unknown }).verificationToken;
      const encryptKey = (input as { encryptKey?: unknown }).encryptKey;
      if (typeof appId !== "string" || !appId.trim()) {
        return "Feishu requires --app-id.";
      }
      if (typeof appSecret !== "string" || !appSecret.trim()) {
        return "Feishu requires --app-secret.";
      }
      if (
        (typeof verificationToken !== "string" || !verificationToken.trim()) &&
        (typeof encryptKey !== "string" || !encryptKey.trim())
      ) {
        return "Feishu requires --verification-token or --encrypt-key.";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg as ClawdbotConfig,
        channelKey: "feishu",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig as ClawdbotConfig,
              channelKey: "feishu",
            })
          : namedConfig;

      const appId = String((input as { appId?: unknown }).appId ?? "").trim();
      const appSecret = String((input as { appSecret?: unknown }).appSecret ?? "").trim();
      const verificationTokenRaw = (input as { verificationToken?: unknown }).verificationToken;
      const encryptKeyRaw = (input as { encryptKey?: unknown }).encryptKey;
      const verificationToken =
        typeof verificationTokenRaw === "string" && verificationTokenRaw.trim()
          ? verificationTokenRaw.trim()
          : undefined;
      const encryptKey =
        typeof encryptKeyRaw === "string" && encryptKeyRaw.trim()
          ? encryptKeyRaw.trim()
          : undefined;
      const webhookPath = input.webhookPath?.trim() || undefined;
      const webhookUrl = input.webhookUrl?.trim() || undefined;

      const configPatch = {
        appId,
        appSecret,
        ...(verificationToken ? { verificationToken } : {}),
        ...(encryptKey ? { encryptKey } : {}),
        ...(webhookPath ? { webhookPath } : {}),
        ...(webhookUrl ? { webhookUrl } : {}),
      };

      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            feishu: {
              ...(next.channels?.feishu ?? {}),
              enabled: true,
              ...configPatch,
            },
          },
        } as ClawdbotConfig;
      }

      return {
        ...next,
        channels: {
          ...next.channels,
          feishu: {
            ...(next.channels?.feishu ?? {}),
            enabled: true,
            accounts: {
              ...(next.channels?.feishu?.accounts ?? {}),
              [accountId]: {
                ...(next.channels?.feishu?.accounts?.[accountId] ?? {}),
                enabled: true,
                ...configPatch,
              },
            },
          },
        },
      } as ClawdbotConfig;
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getFeishuRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    resolveTarget: ({ to, allowFrom, mode }) => {
      const trimmed = to?.trim() ?? "";
      const allowList = (allowFrom ?? [])
        .map((entry) => String(entry).trim())
        .filter(Boolean)
        .filter((entry) => entry !== "*")
        .map((entry) => normalizeFeishuMessagingTarget(entry))
        .filter((entry): entry is string => Boolean(entry));

      if (trimmed) {
        const normalized = normalizeFeishuMessagingTarget(trimmed);
        if (!normalized) {
          if ((mode === "implicit" || mode === "heartbeat") && allowList.length > 0) {
            return { ok: true, to: allowList[0] };
          }
          return {
            ok: false,
            error: missingTargetError(
              "Feishu",
              `${targetHint()} or channels.feishu.dm.allowFrom[0]`,
            ),
          };
        }
        return { ok: true, to: normalized };
      }

      if (allowList.length > 0) {
        return { ok: true, to: allowList[0] };
      }
      return {
        ok: false,
        error: missingTargetError("Feishu", `${targetHint()} or channels.feishu.dm.allowFrom[0]`),
      };
    },
    sendText: async ({ cfg, to, text, accountId, replyToId }) => {
      const account = resolveFeishuAccount({ cfg: cfg as ClawdbotConfig, accountId });
      if (account.credentialSource === "none") {
        throw new Error(
          "Feishu not configured: missing appId/appSecret and webhook validation secret",
        );
      }
      const target = parseFeishuMessagingTarget(to);
      if (!target) {
        throw new Error(`Invalid Feishu target: ${to}. Expected ${targetHint()}.`);
      }
      const bot = await getBotIdentity(account).catch(() => null);
      const replyToMessageId = replyToId?.trim() || undefined;
      const result = await sendFeishuTextMessage({
        account,
        target,
        text,
        replyToMessageId,
      });
      return {
        channel: "feishu",
        messageId: result.messageId,
        chatId: target.kind === "chat" ? target.chatId : undefined,
        meta: {
          target: target.kind === "chat" ? `chat:${target.chatId}` : `user:${target.openId}`,
          botOpenId: bot?.openId,
        },
      };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, accountId, replyToId }) => {
      const caption = text?.trim() ? `${text.trim()}\n${mediaUrl}` : mediaUrl;
      const account = resolveFeishuAccount({ cfg: cfg as ClawdbotConfig, accountId });
      if (account.credentialSource === "none") {
        throw new Error(
          "Feishu not configured: missing appId/appSecret and webhook validation secret",
        );
      }
      const target = parseFeishuMessagingTarget(to);
      if (!target) {
        throw new Error(`Invalid Feishu target: ${to}. Expected ${targetHint()}.`);
      }
      const result = await sendFeishuTextMessage({
        account,
        target,
        text: caption,
        replyToMessageId: replyToId?.trim() || undefined,
      });
      return {
        channel: "feishu",
        messageId: result.messageId,
        chatId: target.kind === "chat" ? target.chatId : undefined,
        meta: {
          warning: "media send is not supported yet; delivered as text URL",
        },
      };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
      webhookPath: null,
      lastInboundAt: null,
      lastOutboundAt: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      webhookPath: snapshot.webhookPath ?? null,
      lastInboundAt: snapshot.lastInboundAt ?? null,
      lastOutboundAt: snapshot.lastOutboundAt ?? null,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account }) => await probeFeishu(account),
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.credentialSource !== "none",
      credentialSource: account.credentialSource,
      webhookPath: account.config.webhookPath,
      webhookUrl: account.config.webhookUrl,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
      probe,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.log?.info(`[${account.accountId}] starting Feishu webhook`);
      ctx.setStatus({
        accountId: account.accountId,
        running: true,
        lastStartAt: Date.now(),
        webhookPath: resolveFeishuWebhookPath({ account }),
      });
      const unregister = await startFeishuMonitor({
        account,
        config: ctx.cfg as ClawdbotConfig,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        webhookPath: account.config.webhookPath,
        webhookUrl: account.config.webhookUrl,
        statusSink: (patch) => ctx.setStatus({ accountId: account.accountId, ...patch }),
      });
      return () => {
        unregister?.();
        ctx.setStatus({
          accountId: account.accountId,
          running: false,
          lastStopAt: Date.now(),
        });
      };
    },
  },
};
