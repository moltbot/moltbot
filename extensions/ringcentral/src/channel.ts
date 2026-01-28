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
  resolveChannelMediaMaxBytes,
  setAccountEnabledInConfigSection,
  type ChannelDock,
  type ChannelPlugin,
  type MoltbotConfig,
} from "moltbot/plugin-sdk";

import {
  listRingCentralAccountIds,
  resolveDefaultRingCentralAccountId,
  resolveRingCentralAccount,
  type ResolvedRingCentralAccount,
} from "./accounts.js";
import { RingCentralConfigSchema } from "./config-schema.js";
import {
  sendRingCentralMessage,
  uploadRingCentralAttachment,
  probeRingCentral,
} from "./api.js";
import { getRingCentralRuntime } from "./runtime.js";
import { startRingCentralMonitor } from "./monitor.js";
import {
  normalizeRingCentralTarget,
  isRingCentralChatTarget,
  parseRingCentralTarget,
} from "./targets.js";
import type { RingCentralConfig } from "./types.js";

const formatAllowFromEntry = (entry: string) =>
  (entry ?? "")
    .trim()
    .replace(/^(ringcentral|rc):/i, "")
    .replace(/^user:/i, "")
    .toLowerCase();

export const ringcentralDock: ChannelDock = {
  id: "ringcentral",
  capabilities: {
    chatTypes: ["direct", "group", "thread"],
    reactions: false,
    media: true,
    threads: false,
    blockStreaming: true,
  },
  outbound: { textChunkLimit: 4000 },
  config: {
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveRingCentralAccount({ cfg: cfg as MoltbotConfig, accountId }).config.dm?.allowFrom ??
        []
      ).map((entry) => String(entry)),
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry) => String(entry))
        .filter(Boolean)
        .map(formatAllowFromEntry),
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId }) => {
      const account = resolveRingCentralAccount({ cfg: cfg as MoltbotConfig, accountId });
      return account.config.requireMention ?? true;
    },
  },
  threading: {
    resolveReplyToMode: ({ cfg }) =>
      (cfg.channels?.ringcentral as RingCentralConfig | undefined)?.replyToMode ?? "off",
    buildToolContext: ({ context, hasRepliedRef }) => ({
      currentChannelId: context.To?.trim() || undefined,
      currentThreadTs: undefined,
      hasRepliedRef,
    }),
  },
};

export const ringcentralPlugin: ChannelPlugin<ResolvedRingCentralAccount> = {
  id: "ringcentral",
  meta: {
    id: "ringcentral",
    label: "RingCentral",
    selectionLabel: "RingCentral Team Messaging",
    docsPath: "/channels/ringcentral",
    docsLabel: "ringcentral",
    blurb: "RingCentral Team Messaging via REST API and WebSocket.",
    order: 56,
  },
  pairing: {
    idLabel: "ringcentralUserId",
    normalizeAllowEntry: (entry) => formatAllowFromEntry(entry),
    notifyApproval: async ({ cfg, id }) => {
      const account = resolveRingCentralAccount({ cfg: cfg as MoltbotConfig });
      if (account.credentialSource === "none") return;
      const target = normalizeRingCentralTarget(id) ?? id;
      // For DM approval, we need to find/create a direct chat
      // This is a simplified version - in production you'd need to resolve the chat ID
      try {
        await sendRingCentralMessage({
          account,
          chatId: target,
          text: PAIRING_APPROVED_MESSAGE,
        });
      } catch {
        // Approval notification failed, but pairing still succeeds
      }
    },
  },
  capabilities: {
    chatTypes: ["direct", "group"],
    reactions: false,
    threads: false,
    media: true,
    nativeCommands: false,
    blockStreaming: true,
  },
  streaming: {
    blockStreamingCoalesceDefaults: { minChars: 1500, idleMs: 1000 },
  },
  reload: { configPrefixes: ["channels.ringcentral"] },
  configSchema: buildChannelConfigSchema(RingCentralConfigSchema),
  config: {
    listAccountIds: (cfg) => listRingCentralAccountIds(cfg as MoltbotConfig),
    resolveAccount: (cfg, accountId) =>
      resolveRingCentralAccount({ cfg: cfg as MoltbotConfig, accountId }),
    defaultAccountId: (cfg) => resolveDefaultRingCentralAccountId(cfg as MoltbotConfig),
    setAccountEnabled: ({ cfg, accountId, enabled }) =>
      setAccountEnabledInConfigSection({
        cfg: cfg as MoltbotConfig,
        sectionKey: "ringcentral",
        accountId,
        enabled,
        allowTopLevel: true,
      }),
    deleteAccount: ({ cfg, accountId }) =>
      deleteAccountFromConfigSection({
        cfg: cfg as MoltbotConfig,
        sectionKey: "ringcentral",
        accountId,
        clearBaseFields: [
          "clientId",
          "clientSecret",
          "jwt",
          "server",
          "name",
        ],
      }),
    isConfigured: (account) => account.credentialSource !== "none",
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.credentialSource !== "none",
      credentialSource: account.credentialSource,
      server: account.server,
    }),
    resolveAllowFrom: ({ cfg, accountId }) =>
      (resolveRingCentralAccount({
        cfg: cfg as MoltbotConfig,
        accountId,
      }).config.dm?.allowFrom ?? []
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
        (cfg as MoltbotConfig).channels?.ringcentral?.accounts?.[resolvedAccountId],
      );
      const allowFromPath = useAccountPath
        ? `channels.ringcentral.accounts.${resolvedAccountId}.dm.`
        : "channels.ringcentral.dm.";
      return {
        policy: account.config.dm?.policy ?? "pairing",
        allowFrom: account.config.dm?.allowFrom ?? [],
        allowFromPath,
        approveHint: formatPairingApproveHint("ringcentral"),
        normalizeEntry: (raw) => formatAllowFromEntry(raw),
      };
    },
    collectWarnings: ({ account, cfg }) => {
      const warnings: string[] = [];
      const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
      const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
      if (groupPolicy === "open") {
        warnings.push(
          `- RingCentral chats: groupPolicy="open" allows any chat to trigger (mention-gated). Set channels.ringcentral.groupPolicy="allowlist" and configure channels.ringcentral.groups.`,
        );
      }
      if (account.config.dm?.policy === "open") {
        warnings.push(
          `- RingCentral DMs are open to anyone. Set channels.ringcentral.dm.policy="pairing" or "allowlist".`,
        );
      }
      return warnings;
    },
  },
  groups: {
    resolveRequireMention: ({ cfg, accountId }) => {
      const account = resolveRingCentralAccount({ cfg: cfg as MoltbotConfig, accountId });
      return account.config.requireMention ?? true;
    },
  },
  threading: {
    resolveReplyToMode: ({ cfg }) =>
      (cfg.channels?.ringcentral as RingCentralConfig | undefined)?.replyToMode ?? "off",
  },
  messaging: {
    normalizeTarget: normalizeRingCentralTarget,
    targetResolver: {
      looksLikeId: (raw, normalized) => {
        const value = normalized ?? raw.trim();
        return isRingCentralChatTarget(value);
      },
      hint: "<chatId>",
    },
  },
  directory: {
    self: async () => null,
    listPeers: async ({ cfg, accountId, query, limit }) => {
      const account = resolveRingCentralAccount({
        cfg: cfg as MoltbotConfig,
        accountId,
      });
      const q = query?.trim().toLowerCase() || "";
      const allowFrom = account.config.dm?.allowFrom ?? [];
      const peers = Array.from(
        new Set(
          allowFrom
            .map((entry) => String(entry).trim())
            .filter((entry) => Boolean(entry) && entry !== "*")
            .map((entry) => normalizeRingCentralTarget(entry) ?? entry),
        ),
      )
        .filter((id) => (q ? id.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "user", id }) as const);
      return peers;
    },
    listGroups: async ({ cfg, accountId, query, limit }) => {
      const account = resolveRingCentralAccount({
        cfg: cfg as MoltbotConfig,
        accountId,
      });
      const groups = account.config.groups ?? {};
      const q = query?.trim().toLowerCase() || "";
      const entries = Object.keys(groups)
        .filter((key) => key && key !== "*")
        .filter((key) => (q ? key.toLowerCase().includes(q) : true))
        .slice(0, limit && limit > 0 ? limit : undefined)
        .map((id) => ({ kind: "group", id }) as const);
      return entries;
    },
  },
  resolver: {
    resolveTargets: async ({ inputs, kind }) => {
      const resolved = inputs.map((input) => {
        const parsed = parseRingCentralTarget(input);
        if (parsed.type === "unknown" || !parsed.id) {
          return { input, resolved: false, note: "invalid target format" };
        }
        if (kind === "user" && parsed.type === "user") {
          return { input, resolved: true, id: parsed.id };
        }
        if (kind === "group" && parsed.type === "chat") {
          return { input, resolved: true, id: parsed.id };
        }
        return {
          input,
          resolved: false,
          note: "use rc:chat:<id> or rc:user:<id>",
        };
      });
      return resolved;
    },
  },
  setup: {
    resolveAccountId: ({ accountId }) => normalizeAccountId(accountId),
    applyAccountName: ({ cfg, accountId, name }) =>
      applyAccountNameToChannelSection({
        cfg: cfg as MoltbotConfig,
        channelKey: "ringcentral",
        accountId,
        name,
      }),
    validateInput: ({ accountId, input }) => {
      if (input.useEnv && accountId !== DEFAULT_ACCOUNT_ID) {
        return "RINGCENTRAL_* env vars can only be used for the default account.";
      }
      if (!input.useEnv && (!input.clientId || !input.clientSecret || !input.jwt)) {
        return "RingCentral requires --client-id, --client-secret, and --jwt (or use --use-env).";
      }
      return null;
    },
    applyAccountConfig: ({ cfg, accountId, input }) => {
      const namedConfig = applyAccountNameToChannelSection({
        cfg: cfg as MoltbotConfig,
        channelKey: "ringcentral",
        accountId,
        name: input.name,
      });
      const next =
        accountId !== DEFAULT_ACCOUNT_ID
          ? migrateBaseNameToDefaultAccount({
              cfg: namedConfig as MoltbotConfig,
              channelKey: "ringcentral",
            })
          : namedConfig;
      const patch = input.useEnv
        ? {}
        : {
            ...(input.clientId ? { clientId: input.clientId } : {}),
            ...(input.clientSecret ? { clientSecret: input.clientSecret } : {}),
            ...(input.jwt ? { jwt: input.jwt } : {}),
          };
      const server = input.server?.trim();
      const configPatch = {
        ...patch,
        ...(server ? { server } : {}),
      };
      if (accountId === DEFAULT_ACCOUNT_ID) {
        return {
          ...next,
          channels: {
            ...next.channels,
            ringcentral: {
              ...(next.channels?.ringcentral ?? {}),
              enabled: true,
              ...configPatch,
            },
          },
        } as MoltbotConfig;
      }
      return {
        ...next,
        channels: {
          ...next.channels,
          ringcentral: {
            ...(next.channels?.ringcentral ?? {}),
            enabled: true,
            accounts: {
              ...(next.channels?.ringcentral?.accounts ?? {}),
              [accountId]: {
                ...(next.channels?.ringcentral?.accounts?.[accountId] ?? {}),
                enabled: true,
                ...configPatch,
              },
            },
          },
        },
      } as MoltbotConfig;
    },
  },
  outbound: {
    deliveryMode: "direct",
    chunker: (text, limit) =>
      getRingCentralRuntime().channel.text.chunkMarkdownText(text, limit),
    chunkerMode: "markdown",
    textChunkLimit: 4000,
    resolveTarget: ({ to, allowFrom, mode }) => {
      const trimmed = to?.trim() ?? "";
      const allowListRaw = (allowFrom ?? []).map((entry) => String(entry).trim()).filter(Boolean);
      const allowList = allowListRaw
        .filter((entry) => entry !== "*")
        .map((entry) => normalizeRingCentralTarget(entry))
        .filter((entry): entry is string => Boolean(entry));

      if (trimmed) {
        const normalized = normalizeRingCentralTarget(trimmed);
        if (!normalized) {
          if ((mode === "implicit" || mode === "heartbeat") && allowList.length > 0) {
            return { ok: true, to: allowList[0] };
          }
          return {
            ok: false,
            error: missingTargetError(
              "RingCentral",
              "<chatId> or channels.ringcentral.dm.allowFrom[0]",
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
        error: missingTargetError(
          "RingCentral",
          "<chatId> or channels.ringcentral.dm.allowFrom[0]",
        ),
      };
    },
    sendText: async ({ cfg, to, text, accountId }) => {
      const account = resolveRingCentralAccount({
        cfg: cfg as MoltbotConfig,
        accountId,
      });
      const result = await sendRingCentralMessage({
        account,
        chatId: to,
        text,
      });
      return {
        channel: "ringcentral",
        messageId: result?.postId ?? "",
        chatId: to,
      };
    },
    sendMedia: async ({ cfg, to, text, mediaUrl, accountId }) => {
      if (!mediaUrl) {
        throw new Error("RingCentral mediaUrl is required.");
      }
      const account = resolveRingCentralAccount({
        cfg: cfg as MoltbotConfig,
        accountId,
      });
      const runtime = getRingCentralRuntime();
      const maxBytes = resolveChannelMediaMaxBytes({
        cfg: cfg as MoltbotConfig,
        resolveChannelLimitMb: ({ cfg: c, accountId: aid }) =>
          (c.channels?.ringcentral as { accounts?: Record<string, { mediaMaxMb?: number }>; mediaMaxMb?: number } | undefined)
            ?.accounts?.[aid]?.mediaMaxMb ??
          (c.channels?.ringcentral as { mediaMaxMb?: number } | undefined)?.mediaMaxMb,
        accountId,
      });
      const loaded = await runtime.channel.media.fetchRemoteMedia(mediaUrl, {
        maxBytes: maxBytes ?? (account.config.mediaMaxMb ?? 20) * 1024 * 1024,
      });
      const upload = await uploadRingCentralAttachment({
        account,
        chatId: to,
        filename: loaded.filename ?? "attachment",
        buffer: loaded.buffer,
        contentType: loaded.contentType,
      });
      const result = await sendRingCentralMessage({
        account,
        chatId: to,
        text,
        attachments: upload.attachmentId ? [{ id: upload.attachmentId }] : undefined,
      });
      return {
        channel: "ringcentral",
        messageId: result?.postId ?? "",
        chatId: to,
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
    },
    collectStatusIssues: (accounts) =>
      accounts.flatMap((entry) => {
        const accountId = String(entry.accountId ?? DEFAULT_ACCOUNT_ID);
        const enabled = entry.enabled !== false;
        const configured = entry.configured === true;
        if (!enabled || !configured) return [];
        const issues = [];
        if (!entry.clientId) {
          issues.push({
            channel: "ringcentral",
            accountId,
            kind: "config",
            message: "RingCentral clientId is missing.",
            fix: "Set channels.ringcentral.clientId or use rc-credentials.json.",
          });
        }
        return issues;
      }),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      credentialSource: snapshot.credentialSource ?? "none",
      server: snapshot.server ?? null,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),
    probeAccount: async ({ account }) => probeRingCentral(account),
    buildAccountSnapshot: ({ account, runtime, probe }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.credentialSource !== "none",
      credentialSource: account.credentialSource,
      server: account.server,
      clientId: account.clientId ? `${account.clientId.slice(0, 8)}...` : undefined,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
      dmPolicy: account.config.dm?.policy ?? "allowlist",
      probe,
    }),
  },
  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.log?.info(`[${account.accountId}] starting RingCentral WebSocket`);
      ctx.setStatus({
        accountId: account.accountId,
        running: true,
        lastStartAt: Date.now(),
        server: account.server,
      });
      const unregister = await startRingCentralMonitor({
        account,
        config: ctx.cfg as MoltbotConfig,
        runtime: ctx.runtime,
        abortSignal: ctx.abortSignal,
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
