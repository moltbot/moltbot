import {
  applyAccountNameToChannelSection,
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  deleteAccountFromConfigSection,
  formatPairingApproveHint,
  migrateBaseNameToDefaultAccount,
  normalizeAccountId,
  setAccountEnabledInConfigSection,
  type ChannelPlugin,
} from "openclaw/plugin-sdk";

import { MezonConfigSchema } from "./config-schema.js";
import { resolveMezonGroupRequireMention } from "./group-mentions.js";
import { looksLikeMezonTargetId, normalizeMezonMessagingTarget } from "./normalize.js";
import { mezonOnboardingAdapter } from "./onboarding.js";
import {
  listMezonAccountIds,
  resolveDefaultMezonAccountId,
  resolveMezonAccount,
  type ResolvedMezonAccount,
} from "./mezon/accounts.js";
import { monitorMezonProvider } from "./mezon/monitor.js";
import { probeMezon } from "./mezon/probe.js";
import { sendMessageMezon } from "./mezon/send.js";
import { getMezonRuntime } from "./runtime.js";

const meta = {
  id: "mezon",
  label: "Mezon",
  selectionLabel: "Mezon (plugin)",
  detailLabel: "Mezon Bot",
  docsPath: "/channels/mezon",
  docsLabel: "mezon",
  blurb: "Mezon chat platform; install the plugin to enable.",
  systemImage: "bubble.left.and.bubble.right",
  order: 66,
} as const;

function normalizeAllowEntry(entry: string): string {
  return entry
    .trim()
    .replace(/^(mezon|user):/i, "")
    .replace(/^@/, "")
    .toLowerCase();
}

function formatAllowEntry(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed.startsWith("@")) {
    const username = trimmed.slice(1).trim();
    return username ? `@${username.toLowerCase()}` : "";
  }
  return trimmed.replace(/^(mezon|user):/i, "").toLowerCase();
}

export const mezonPlugin: ChannelPlugin<ResolvedMezonAccount> = {
  id: "mezon",
  meta: {
    ...meta,
  },
  onboarding: mezonOnboardingAdapter,
  pairing: {
    idLabel: "mezonUserId",
    normalizeAllowEntry: (entry) => normalizeAllowEntry(entry),
    notifyApproval: async () => {
      // Pairing approval notification is sent via Mezon message
    },
  },
  capabilities: {
    chatTypes: ["direct", "channel", "group", "thread"],
    threads: true,
    media: true,
    reactions: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  reload: { configPrefixes: ["channels.mezon"] },
  configSchema: buildChannelConfigSchema(MezonConfigSchema),
  config: {
    listAccountIds: (cfg) => listMezonAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveMezonAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultMezonAccountId(cfg),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg,
        sectionKey: "mezon",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg,
        sectionKey: "mezon",
        accountId,
        clearBaseFields: ["token", "name"],
      }),
    isConfigured: (account) => Boolean(account.token),
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token),
      tokenSource: account.tokenSource,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveMezonAccount({ cfg, accountId }).config.allowFrom ?? []).map((entry) =>
        String(entry),
      ),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom.map((entry) => formatAllowEntry(String(entry))).filter(Boolean),
  },
  security: {
    resolveDmPolicy: ({ cfg, accountId, account }) => {
      const resolvedAccountId = accountId ?? account.accountId ?? DEFAULT_ACCOUNT_ID;
      const useAccountPath = Boolean(cfg.channels?.mezon?.accounts?.[resolvedAccountId]);
      const basePath = useAccountPath
        ? `channels.mezon.accounts.${resolvedAccountId}.`
        : "channels.mezon.";
      return {
        policy: account.config.dmPolicy ?? "pairing",
        allowFrom: account.config.allowFrom ?? [],
        policyPath: `${basePath}dmPolicy`,
        allowFromPath: basePath,
        approveHint: formatPairingApproveHint("mezon"),
        normalizeEntry: (raw) => normalizeAllowEntry(raw),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy !== "open") {
        return [];
      }
      return [
        `- Mezon channels: groupPolicy="open" allows any member to trigger (mention-gated). Set channels.mezon.groupPolicy="allowlist" + channels.mezon.groupAllowFrom to restrict senders.`,
      ];
    },
  },
  groups: {
    resolveRequireMention: resolveMezonGroupRequireMention,
  },
  messaging: {
    normalizeTarget: normalizeMezonMessagingTarget,
    targetResolver: {
      looksLikeId: looksLikeMezonTargetId,
      hint: "<channelId|user:ID|channel:ID>",
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) => getMezonRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    resolveTarget: ({ to }) => {
      const trimmed = to?.trim();
      if (!trimmed) {
        return {
          ok: false,
          error: new Error("Delivering to Mezon requires --to <channelId|user:ID|channel:ID>"),
        };
      }
      return { ok: true, to: trimmed };
    },
    sendText: async ({ to, text, accountId, replyToId }) => {
      const result = await sendMessageMezon(to, text, {
        accountId: accountId ?? undefined,
        replyToId: replyToId ?? undefined,
      });
      return { channel: "mezon", ...result };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId, replyToId }) => {
      const result = await sendMessageMezon(to, text, {
        accountId: accountId ?? undefined,
        mediaUrl,
        replyToId: replyToId ?? undefined,
      });
      return { channel: "mezon", ...result };
    },
  },
  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      connected: false,
      lastConnectedAt: null,
      lastDisconnect: null,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      tokenSource: snapshot.tokenSource ?? "none",
      running: snapshot.running ?? false,
      connected: snapshot.connected ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account, timeoutMs }) => {
      const token = account.token?.trim();
      if (!token) {
        return { ok: false, error: "bot token missing" };
      }
      const botId = account.botId?.trim();
      if (!botId) {
        return { ok: false, error: "bot ID missing" };
      }
      return await probeMezon(token, botId, timeoutMs);
    },
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: Boolean(account.token),
      tokenSource: account.tokenSource,
      running: runtime?.running ?? false,
      connected: runtime?.connected ?? false,
      lastConnectedAt: runtime?.lastConnectedAt ?? null,
      lastDisconnect: runtime?.lastDisconnect ?? null,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      probe,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg,
        channelKey: "mezon",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "Mezon env vars can only be used for the default account.";
      }
      const token = input.botToken ?? input.token;
      if (!input.useEnv && !token) {
        return "Mezon requires --bot-token (or --use-env).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const token = input.botToken ?? input.token;
      const namedConfig = applyAccountNameToChannelSection({
        cfg,
        channelKey: "mezon",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig,
              channelKey: "mezon",
            })
          : namedConfig;
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            mezon: {
              ...next.channels?.mezon,
              enabled: true,
              ...(input.useEnv ? {} : token ? { token } : {}),
            },
          },
        };
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          mezon: {
            ...next.channels?.mezon,
            enabled: true,
            accounts: {
              ...next.channels?.mezon?.accounts,
              [accountId]: {
                ...next.channels?.mezon?.accounts?.[accountId],
                enabled: true,
                ...(token ? { token } : {}),
              },
            },
          },
        },
      };
    },
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
        tokenSource: account.tokenSource,
      });
      ctx.log?.info(`[${account.accountId}] starting channel`);
      return monitorMezonProvider({
        token: account.token ?? undefined,
        accountId: account.accountId,
        config: ctx.cfg,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
        statusSink: (patch) => ctx.setStatus({ accountId: ctx.accountId, ...patch }),
      });
    },
  },
};
