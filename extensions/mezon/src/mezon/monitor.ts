import type {
  ChannelAccountSnapshot,
  OpenClawConfig,
  ReplyPayload,
  RuntimeEnv,
} from "openclaw/plugin-sdk";
import {
  createReplyPrefixContext,
  createTypingCallbacks,
  logInboundDrop,
  logTypingFailure,
  buildPendingHistoryContextFromMap,
  clearHistoryEntriesIfEnabled,
  DEFAULT_GROUP_HISTORY_LIMIT,
  recordPendingHistoryEntryIfEnabled,
  resolveControlCommandGate,
  resolveChannelMediaMaxBytes,
  type HistoryEntry,
} from "openclaw/plugin-sdk";

import { getMezonRuntime } from "../runtime.js";
import { resolveMezonAccount } from "./accounts.js";
import {
  createMezonBotClient,
  fetchMezonBotUser,
  loginMezonClient,
  type MezonMessage,
} from "./client.js";
import {
  createDedupeCache,
  formatInboundFromLabel,
  resolveThreadSessionKeys,
} from "./monitor-helpers.js";
import { sendMessageMezon } from "./send.js";

export type MonitorMezonOpts = {
  token?: string;
  accountId?: string;
  config?: OpenClawConfig;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  statusSink?: (patch: Partial<ChannelAccountSnapshot>) => void;
};

type MediaKind = "image" | "audio" | "video" | "document" | "unknown";

const RECENT_MEZON_MESSAGE_TTL_MS = 5 * 60_000;
const RECENT_MEZON_MESSAGE_MAX = 2000;

const recentInboundMessages = createDedupeCache({
  ttlMs: RECENT_MEZON_MESSAGE_TTL_MS,
  maxSize: RECENT_MEZON_MESSAGE_MAX,
});

// Track sent message IDs to prevent echo loop
const recentSentMessages = createDedupeCache({
  ttlMs: RECENT_MEZON_MESSAGE_TTL_MS,
  maxSize: RECENT_MEZON_MESSAGE_MAX,
});

function resolveRuntime(opts: MonitorMezonOpts): RuntimeEnv {
  return (
    opts.runtime ?? {
      log: console.log,
      error: console.error,
      exit: (code: number): never => {
        throw new Error(`exit ${code}`);
      },
    }
  );
}

function normalizeMention(text: string, mention: string | undefined): string {
  if (!mention) {
    return text.trim();
  }
  const escaped = mention.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`@${escaped}\\b`, "gi");
  return text.replace(re, " ").replace(/\s+/g, " ").trim();
}

function channelKind(isDm: boolean, clanId?: string): "dm" | "group" | "channel" {
  if (isDm) {
    return "dm";
  }
  if (clanId) {
    return "channel";
  }
  return "group";
}

function channelChatType(kind: "dm" | "group" | "channel"): "direct" | "group" | "channel" {
  if (kind === "dm") {
    return "direct";
  }
  if (kind === "group") {
    return "group";
  }
  return "channel";
}

function normalizeAllowEntry(entry: string): string {
  const trimmed = entry.trim();
  if (!trimmed) {
    return "";
  }
  if (trimmed === "*") {
    return "*";
  }
  return trimmed
    .replace(/^(mezon|user):/i, "")
    .replace(/^@/, "")
    .toLowerCase();
}

function normalizeAllowList(entries: Array<string | number>): string[] {
  const normalized = entries.map((entry) => normalizeAllowEntry(String(entry))).filter(Boolean);
  return Array.from(new Set(normalized));
}

function isSenderAllowed(params: {
  senderId: string;
  senderName?: string;
  allowFrom: string[];
}): boolean {
  const allowFrom = params.allowFrom;
  if (allowFrom.length === 0) {
    return false;
  }
  if (allowFrom.includes("*")) {
    return true;
  }
  const normalizedSenderId = normalizeAllowEntry(params.senderId);
  const normalizedSenderName = params.senderName ? normalizeAllowEntry(params.senderName) : "";
  return allowFrom.some(
    (entry) =>
      entry === normalizedSenderId || (normalizedSenderName && entry === normalizedSenderName),
  );
}

type MezonMediaInfo = {
  path: string;
  contentType?: string;
  kind: MediaKind;
};

function buildMezonAttachmentPlaceholder(mediaList: MezonMediaInfo[]): string {
  if (mediaList.length === 0) {
    return "";
  }
  if (mediaList.length === 1) {
    const kind = mediaList[0].kind === "unknown" ? "document" : mediaList[0].kind;
    return `<media:${kind}>`;
  }
  const allImages = mediaList.every((media) => media.kind === "image");
  const label = allImages ? "image" : "file";
  const suffix = mediaList.length === 1 ? label : `${label}s`;
  const tag = allImages ? "<media:image>" : "<media:document>";
  return `${tag} (${mediaList.length} ${suffix})`;
}

function buildMezonMediaPayload(mediaList: MezonMediaInfo[]): {
  MediaPath?: string;
  MediaType?: string;
  MediaUrl?: string;
  MediaPaths?: string[];
  MediaUrls?: string[];
  MediaTypes?: string[];
} {
  const first = mediaList[0];
  const mediaPaths = mediaList.map((media) => media.path);
  const mediaTypes = mediaList.map((media) => media.contentType).filter(Boolean) as string[];
  return {
    MediaPath: first?.path,
    MediaType: first?.contentType,
    MediaUrl: first?.path,
    MediaPaths: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaUrls: mediaPaths.length > 0 ? mediaPaths : undefined,
    MediaTypes: mediaTypes.length > 0 ? mediaTypes : undefined,
  };
}

export async function monitorMezonProvider(opts: MonitorMezonOpts = {}): Promise<void> {
  const core = getMezonRuntime();
  const runtime = resolveRuntime(opts);
  const cfg = opts.config ?? core.config.loadConfig();
  const account = resolveMezonAccount({
    cfg,
    accountId: opts.accountId,
  });
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

  const botClient = createMezonBotClient(token, botId);
  await loginMezonClient(botClient);
  const botUser = await fetchMezonBotUser(botClient, botId);
  const botUserId = botUser?.id ?? "";
  const botUsername = botUser?.username?.trim() || undefined;
  runtime.log?.(`mezon connected as ${botUsername ? `@${botUsername}` : botUserId}`);
  runtime.log?.(`[DEBUG] mezon botUserId="${botUserId}" botUsername="${botUsername ?? ""}"`);
  if (!botUserId) {
    runtime.log?.(`[WARNING] mezon bot user ID is empty - self-message filtering will not work!`);
  }

  opts.statusSink?.({
    connected: true,
    lastConnectedAt: Date.now(),
    lastError: null,
  });

  const logger = core.logging.getChildLogger({ module: "mezon" });
  const logVerboseMessage = (message: string) => {
    if (!core.logging.shouldLogVerbose()) {
      return;
    }
    logger.debug?.(message);
  };
  const mediaMaxBytes =
    resolveChannelMediaMaxBytes({
      cfg,
      resolveChannelLimitMb: () => undefined,
      accountId: account.accountId,
    }) ?? 8 * 1024 * 1024;
  const historyLimit = Math.max(
    0,
    cfg.messages?.groupChat?.historyLimit ?? DEFAULT_GROUP_HISTORY_LIMIT,
  );
  const channelHistories = new Map<string, HistoryEntry[]>();

  const resolveMezonMedia = async (
    attachments?: MezonMessage["attachments"],
  ): Promise<MezonMediaInfo[]> => {
    const items = (attachments ?? []).filter((a) => a.url);
    if (items.length === 0) {
      return [];
    }
    const out: MezonMediaInfo[] = [];
    for (const attachment of items) {
      if (!attachment.url) {
        continue;
      }
      try {
        const fetched = await core.channel.media.fetchRemoteMedia({
          url: attachment.url,
          filePathHint: attachment.filename ?? undefined,
          maxBytes: mediaMaxBytes,
        });
        const saved = await core.channel.media.saveMediaBuffer(
          fetched.buffer,
          fetched.contentType ?? undefined,
          "inbound",
          mediaMaxBytes,
        );
        const contentType = saved.contentType ?? fetched.contentType ?? undefined;
        out.push({
          path: saved.path,
          contentType,
          kind: core.media.mediaKindFromMime(contentType),
        });
      } catch (err) {
        logger.debug?.(`mezon: failed to download attachment: ${String(err)}`);
      }
    }
    return out;
  };

  const handleMessage = async (msg: MezonMessage) => {
    const channelId = msg.channel_id;
    if (!channelId) {
      return;
    }

    const messageId = msg.message_id;
    if (!messageId) {
      return;
    }
    if (recentInboundMessages.check(`${account.accountId}:${messageId}`)) {
      return;
    }

    // Check if this is a message we sent (defensive filter against echo loops)
    if (recentSentMessages.check(`${account.accountId}:${messageId}`)) {
      logVerboseMessage(`[DEBUG] Ignoring sent message echo: messageId="${messageId}"`);
      return;
    }

    const senderId = msg.sender_id;
    if (!senderId) {
      return;
    }
    if (senderId === botUserId) {
      logVerboseMessage(
        `[DEBUG] Ignoring own message: senderId="${senderId}" matches botUserId="${botUserId}"`,
      );
      return;
    }
    // Extra debug to catch echo loop issue
    if (!botUserId) {
      logVerboseMessage(
        `[WARNING] Received message from senderId="${senderId}" but botUserId is empty - cannot filter self-messages!`,
      );
    }

    // Determine channel kind: DM vs clan channel vs group
    // Mezon mode 4 = DM, else use clan_id presence
    const isDm = msg.mode === 4;
    const kind = channelKind(isDm, msg.clan_id);
    const chatType = channelChatType(kind);

    // Resolve sender name from the message's own fields, then mentions, then senderId
    const senderMention = msg.mentions?.find((m) => m.user_id === senderId);
    const senderName =
      msg.username?.trim() ||
      msg.display_name?.trim() ||
      msg.clan_nick?.trim() ||
      senderMention?.username?.trim() ||
      senderId;

    const rawText =
      typeof msg.content === "string"
        ? msg.content.trim()
        : typeof msg.content === "object" && msg.content !== null
          ? (((msg.content as Record<string, unknown>).t as string) ?? "").trim()
          : "";
    const dmPolicy = account.config.dmPolicy ?? "pairing";
    const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
    const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
    const configAllowFrom = normalizeAllowList(account.config.allowFrom ?? []);
    const configGroupAllowFrom = normalizeAllowList(account.config.groupAllowFrom ?? []);
    const storeAllowFrom = normalizeAllowList(
      await core.channel.pairing.readAllowFromStore("mezon").catch(() => []),
    );
    const effectiveAllowFrom = Array.from(new Set([...configAllowFrom, ...storeAllowFrom]));
    const effectiveGroupAllowFrom = Array.from(
      new Set([
        ...(configGroupAllowFrom.length > 0 ? configGroupAllowFrom : configAllowFrom),
        ...storeAllowFrom,
      ]),
    );
    const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
      cfg,
      surface: "mezon",
    });
    const hasControlCommand = core.channel.text.hasControlCommand(rawText, cfg);
    const isControlCommand = allowTextCommands && hasControlCommand;
    const useAccessGroups = cfg.commands?.useAccessGroups !== false;
    const senderAllowedForCommands = isSenderAllowed({
      senderId,
      senderName,
      allowFrom: effectiveAllowFrom,
    });
    const groupAllowedForCommands = isSenderAllowed({
      senderId,
      senderName,
      allowFrom: effectiveGroupAllowFrom,
    });
    const commandGate = resolveControlCommandGate({
      useAccessGroups,
      authorizers: [
        { configured: effectiveAllowFrom.length > 0, allowed: senderAllowedForCommands },
        {
          configured: effectiveGroupAllowFrom.length > 0,
          allowed: groupAllowedForCommands,
        },
      ],
      allowTextCommands,
      hasControlCommand,
    });
    const commandAuthorized =
      kind === "dm"
        ? dmPolicy === "open" || senderAllowedForCommands
        : commandGate.commandAuthorized;

    if (kind === "dm") {
      if (dmPolicy === "disabled") {
        logVerboseMessage(`mezon: drop dm (dmPolicy=disabled sender=${senderId})`);
        return;
      }
      if (dmPolicy !== "open" && !senderAllowedForCommands) {
        if (dmPolicy === "pairing") {
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: "mezon",
            id: senderId,
            meta: { name: senderName },
          });
          logVerboseMessage(`mezon: pairing request sender=${senderId} created=${created}`);
          if (created) {
            try {
              const result = await sendMessageMezon(
                `user:${senderId}`,
                core.channel.pairing.buildPairingReply({
                  channel: "mezon",
                  idLine: `Your Mezon user id: ${senderId}`,
                  code,
                }),
                { accountId: account.accountId },
              );
              // Track sent message ID to prevent echo loop
              recentSentMessages.check(`${account.accountId}:${result.messageId}`);
              opts.statusSink?.({ lastOutboundAt: Date.now() });
            } catch (err) {
              logVerboseMessage(`mezon: pairing reply failed for ${senderId}: ${String(err)}`);
            }
          }
        } else {
          logVerboseMessage(`mezon: drop dm sender=${senderId} (dmPolicy=${dmPolicy})`);
        }
        return;
      }
    } else {
      if (groupPolicy === "disabled") {
        logVerboseMessage("mezon: drop group message (groupPolicy=disabled)");
        return;
      }
      if (groupPolicy === "allowlist") {
        if (effectiveGroupAllowFrom.length === 0) {
          logVerboseMessage("mezon: drop group message (no group allowlist)");
          return;
        }
        if (!groupAllowedForCommands) {
          logVerboseMessage(`mezon: drop group sender=${senderId} (not in groupAllowFrom)`);
          return;
        }
      }
    }

    if (kind !== "dm" && commandGate.shouldBlock) {
      logInboundDrop({
        log: logVerboseMessage,
        channel: "mezon",
        reason: "control command (unauthorized)",
        target: senderId,
      });
      return;
    }

    const clanId = msg.clan_id ?? undefined;
    const channelLabel = `#${channelId}`;
    const roomLabel = channelLabel;

    const route = core.channel.routing.resolveAgentRoute({
      cfg,
      channel: "mezon",
      accountId: account.accountId,
      teamId: clanId,
      peer: {
        kind,
        id: kind === "dm" ? senderId : channelId,
      },
    });

    const baseSessionKey = route.sessionKey;
    // Check for thread reference
    const threadRef = msg.references?.find((r) => r.message_ref_id);
    const threadRootId = threadRef?.message_ref_id?.trim() || undefined;
    const threadKeys = resolveThreadSessionKeys({
      baseSessionKey,
      threadId: threadRootId,
      parentSessionKey: threadRootId ? baseSessionKey : undefined,
    });
    const sessionKey = threadKeys.sessionKey;
    const historyKey = kind === "dm" ? null : sessionKey;

    const mentionRegexes = core.channel.mentions.buildMentionRegexes(cfg, route.agentId);
    const wasMentioned =
      kind !== "dm" &&
      ((botUsername ? rawText.toLowerCase().includes(`@${botUsername.toLowerCase()}`) : false) ||
        (botUserId ? (msg.mentions?.some((m) => m.user_id === botUserId) ?? false) : false) ||
        core.channel.mentions.matchesMentionPatterns(rawText, mentionRegexes));

    const pendingBody =
      rawText ||
      (msg.attachments?.length ? `[Mezon ${msg.attachments.length === 1 ? "file" : "files"}]` : "");
    const pendingSender = senderName;
    const recordPendingHistory = () => {
      const trimmed = pendingBody.trim();
      const createTime = msg.create_time ? new Date(msg.create_time).getTime() : undefined;
      recordPendingHistoryEntryIfEnabled({
        historyMap: channelHistories,
        limit: historyLimit,
        historyKey: historyKey ?? "",
        entry:
          historyKey && trimmed
            ? {
                sender: pendingSender,
                body: trimmed,
                timestamp: createTime,
                messageId: messageId,
              }
            : null,
      });
    };

    const shouldRequireMention =
      kind !== "dm" &&
      core.channel.groups.resolveRequireMention({
        cfg,
        channel: "mezon",
        accountId: account.accountId,
        groupId: channelId,
      }) !== false;
    const shouldBypassMention =
      isControlCommand && shouldRequireMention && !wasMentioned && commandAuthorized;
    const effectiveWasMentioned = wasMentioned || shouldBypassMention;
    const canDetectMention =
      Boolean(botUsername) || Boolean(botUserId) || mentionRegexes.length > 0;

    if (kind !== "dm" && shouldRequireMention && canDetectMention) {
      if (!effectiveWasMentioned) {
        recordPendingHistory();
        return;
      }
    }

    const mediaList = await resolveMezonMedia(msg.attachments);
    const mediaPlaceholder = buildMezonAttachmentPlaceholder(mediaList);
    const baseText = [rawText, mediaPlaceholder].filter(Boolean).join("\n").trim();
    const bodyText = normalizeMention(baseText, botUsername);
    if (!bodyText) {
      return;
    }

    core.channel.activity.record({
      channel: "mezon",
      accountId: account.accountId,
      direction: "inbound",
    });

    const fromLabel = formatInboundFromLabel({
      isGroup: kind !== "dm",
      groupLabel: channelLabel,
      groupId: channelId,
      groupFallback: roomLabel || "Channel",
      directLabel: senderName,
      directId: senderId,
    });

    const preview = bodyText.replace(/\s+/g, " ").slice(0, 160);
    const inboundLabel =
      kind === "dm"
        ? `Mezon DM from ${senderName}`
        : `Mezon message in ${roomLabel} from ${senderName}`;
    core.system.enqueueSystemEvent(`${inboundLabel}: ${preview}`, {
      sessionKey,
      contextKey: `mezon:message:${channelId}:${messageId}`,
    });

    const textWithId = `${bodyText}\n[mezon message id: ${messageId} channel: ${channelId}]`;
    const body = core.channel.reply.formatInboundEnvelope({
      channel: "Mezon",
      from: fromLabel,
      timestamp: msg.create_time ? new Date(msg.create_time).getTime() : undefined,
      body: textWithId,
      chatType,
      sender: { name: senderName, id: senderId },
    });
    let combinedBody = body;
    if (historyKey) {
      combinedBody = buildPendingHistoryContextFromMap({
        historyMap: channelHistories,
        historyKey,
        limit: historyLimit,
        currentMessage: combinedBody,
        formatEntry: (entry) =>
          core.channel.reply.formatInboundEnvelope({
            channel: "Mezon",
            from: fromLabel,
            timestamp: entry.timestamp,
            body: `${entry.body}${
              entry.messageId ? ` [id:${entry.messageId} channel:${channelId}]` : ""
            }`,
            chatType,
            senderLabel: entry.sender,
          }),
      });
    }

    const to = kind === "dm" ? `user:${senderId}` : `channel:${channelId}`;
    const mediaPayload = buildMezonMediaPayload(mediaList);
    const ctxPayload = core.channel.reply.finalizeInboundContext({
      Body: combinedBody,
      RawBody: bodyText,
      CommandBody: bodyText,
      From:
        kind === "dm"
          ? `mezon:${senderId}`
          : kind === "group"
            ? `mezon:group:${channelId}`
            : `mezon:channel:${channelId}`,
      To: to,
      SessionKey: sessionKey,
      ParentSessionKey: threadKeys.parentSessionKey,
      AccountId: route.accountId,
      ChatType: chatType,
      ConversationLabel: fromLabel,
      GroupSubject: kind !== "dm" ? channelLabel : undefined,
      GroupChannel: channelLabel,
      GroupSpace: clanId,
      SenderName: senderName,
      SenderId: senderId,
      Provider: "mezon" as const,
      Surface: "mezon" as const,
      MessageSid: messageId,
      ReplyToId: threadRootId,
      MessageThreadId: threadRootId,
      Timestamp: msg.create_time ? new Date(msg.create_time).getTime() : undefined,
      WasMentioned: kind !== "dm" ? effectiveWasMentioned : undefined,
      CommandAuthorized: commandAuthorized,
      OriginatingChannel: "mezon" as const,
      OriginatingTo: to,
      ...mediaPayload,
    });

    if (kind === "dm") {
      const sessionCfg = cfg.session;
      const storePath = core.channel.session.resolveStorePath(sessionCfg?.store, {
        agentId: route.agentId,
      });
      await core.channel.session.updateLastRoute({
        storePath,
        sessionKey: route.mainSessionKey,
        deliveryContext: {
          channel: "mezon",
          to,
          accountId: route.accountId,
        },
      });
    }

    const previewLine = bodyText.slice(0, 200).replace(/\n/g, "\\n");
    logVerboseMessage(
      `mezon inbound: from=${ctxPayload.From} len=${bodyText.length} preview="${previewLine}"`,
    );

    const textLimit = core.channel.text.resolveTextChunkLimit(cfg, "mezon", account.accountId, {
      fallbackLimit: account.textChunkLimit ?? 4000,
    });
    const tableMode = core.channel.text.resolveMarkdownTableMode({
      cfg,
      channel: "mezon",
      accountId: account.accountId,
    });

    const prefixContext = createReplyPrefixContext({ cfg, agentId: route.agentId });

    const typingCallbacks = createTypingCallbacks({
      start: () => {
        // Mezon SDK does not provide a typing indicator API;
        // this is a no-op placeholder for future support.
      },
      onStartError: (err) => {
        logTypingFailure({
          log: (message) => logger.debug?.(message),
          channel: "mezon",
          target: channelId,
          error: err,
        });
      },
    });
    const { dispatcher, replyOptions, markDispatchIdle } =
      core.channel.reply.createReplyDispatcherWithTyping({
        responsePrefix: prefixContext.responsePrefix,
        responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
        humanDelay: core.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
        deliver: async (payload: ReplyPayload) => {
          runtime.log?.(
            `[DEBUG] deliver() called: text length=${payload.text?.length ?? 0} hasMedia=${!!payload.mediaUrl}`,
          );
          const mediaUrls = payload.mediaUrls ?? (payload.mediaUrl ? [payload.mediaUrl] : []);
          const text = core.channel.text.convertMarkdownTables(payload.text ?? "", tableMode);
          if (mediaUrls.length === 0) {
            const chunkMode = core.channel.text.resolveChunkMode(cfg, "mezon", account.accountId);
            const chunks = core.channel.text.chunkMarkdownTextWithMode(text, textLimit, chunkMode);
            runtime.log?.(
              `[DEBUG] About to send ${chunks.length > 0 ? chunks.length : 1} chunk(s) to ${to}`,
            );
            for (const chunk of chunks.length > 0 ? chunks : [text]) {
              if (!chunk) {
                continue;
              }
              runtime.log?.(`[DEBUG] Sending chunk (length=${chunk.length}) to ${to}`);
              const result = await sendMessageMezon(to, chunk, {
                accountId: account.accountId,
                replyToId: threadRootId,
                botClient,
              });
              // Track sent message ID to prevent echo loop
              recentSentMessages.check(`${account.accountId}:${result.messageId}`);
              runtime.log?.(`[DEBUG] Chunk sent successfully, messageId=${result.messageId}`);
            }
          } else {
            let first = true;
            for (const mediaUrl of mediaUrls) {
              const caption = first ? text : "";
              first = false;
              const result = await sendMessageMezon(to, caption, {
                accountId: account.accountId,
                mediaUrl,
                replyToId: threadRootId,
                botClient,
              });
              // Track sent message ID to prevent echo loop
              recentSentMessages.check(`${account.accountId}:${result.messageId}`);
            }
          }
          runtime.log?.(`[DEBUG] delivered reply to ${to}`);
        },
        onError: (err, info) => {
          runtime.error?.(`[DEBUG] mezon ${info.kind} reply failed: ${String(err)}`);
        },
        onReplyStart: typingCallbacks.onReplyStart,
      });

    runtime.log?.(`[DEBUG] Dispatching reply for message from ${senderId}`);
    await core.channel.reply.dispatchReplyFromConfig({
      ctx: ctxPayload,
      cfg,
      dispatcher,
      replyOptions: {
        ...replyOptions,
        disableBlockStreaming:
          typeof account.blockStreaming === "boolean" ? !account.blockStreaming : undefined,
        onModelSelected: prefixContext.onModelSelected,
      },
    });
    runtime.log?.(`[DEBUG] Reply dispatch completed for message from ${senderId}`);
    markDispatchIdle();
    if (historyKey) {
      clearHistoryEntriesIfEnabled({
        historyMap: channelHistories,
        historyKey,
        limit: historyLimit,
      });
    }
  };

  const inboundDebounceMs = core.channel.debounce.resolveInboundDebounceMs({
    cfg,
    channel: "mezon",
  });
  const debouncer = core.channel.debounce.createInboundDebouncer<{
    msg: MezonMessage;
  }>({
    debounceMs: inboundDebounceMs,
    buildKey: (entry) => {
      const channelId = entry.msg.channel_id;
      if (!channelId) {
        return null;
      }
      const threadRef = entry.msg.references?.find((r) => r.message_ref_id);
      const threadId = threadRef?.message_ref_id?.trim();
      const threadKey = threadId ? `thread:${threadId}` : "channel";
      return `mezon:${account.accountId}:${channelId}:${threadKey}`;
    },
    shouldDebounce: (entry) => {
      if (entry.msg.attachments && entry.msg.attachments.length > 0) {
        return false;
      }
      const text =
        typeof entry.msg.content === "string"
          ? entry.msg.content.trim()
          : typeof entry.msg.content === "object" && entry.msg.content !== null
            ? (((entry.msg.content as Record<string, unknown>).t as string) ?? "").trim()
            : "";
      if (!text) {
        return false;
      }
      return !core.channel.text.hasControlCommand(text, cfg);
    },
    onFlush: async (entries) => {
      const last = entries.at(-1);
      if (!last) {
        return;
      }
      if (entries.length === 1) {
        await handleMessage(last.msg);
        return;
      }
      const combinedText = entries
        .map((entry) => {
          const c = entry.msg.content;
          return typeof c === "string"
            ? c.trim()
            : typeof c === "object" && c !== null
              ? (((c as Record<string, unknown>).t as string) ?? "").trim()
              : "";
        })
        .filter(Boolean)
        .join("\n");
      const mergedMsg: MezonMessage = {
        ...last.msg,
        content: combinedText,
        attachments: [],
      };
      await handleMessage(mergedMsg);
    },
    onError: (err) => {
      runtime.error?.(`mezon debounce flush failed: ${String(err)}`);
    },
  });

  // Listen for incoming channel messages via the Mezon SDK event system
  botClient.client.onChannelMessage((data: unknown) => {
    const msg = data as MezonMessage;
    const contentPreview =
      typeof msg?.content === "string"
        ? msg.content.slice(0, 50)
        : JSON.stringify(msg?.content).slice(0, 50);
    runtime.log?.(
      `[DEBUG] Received message: id=${msg?.message_id} from=${msg?.sender_id} content="${contentPreview}..."`,
    );
    if (!msg || !msg.message_id) {
      return;
    }
    debouncer.enqueue({ msg }).catch((err) => {
      runtime.error?.(`mezon handler failed: ${String(err)}`);
    });
  });

  // Keep the monitor alive until aborted
  if (opts.abortSignal) {
    await new Promise<void>((resolve) => {
      if (opts.abortSignal!.aborted) {
        resolve();
        return;
      }
      opts.abortSignal!.addEventListener("abort", () => resolve(), { once: true });
    });
  } else {
    // If no abort signal, keep running indefinitely
    await new Promise<void>(() => {});
  }

  opts.statusSink?.({
    connected: false,
    lastDisconnect: {
      at: Date.now(),
      status: 0,
      error: "aborted",
    },
  });
}
