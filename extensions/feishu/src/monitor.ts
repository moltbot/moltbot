import type { IncomingMessage, ServerResponse } from "node:http";

import type { ClawdbotConfig } from "clawdbot/plugin-sdk";
import { resolveMentionGatingWithBypass } from "clawdbot/plugin-sdk";

import type { ResolvedFeishuAccount } from "./accounts.js";
import { getBotIdentity, sendFeishuTextMessage } from "./api.js";
import { decryptFeishuEncrypt, verifyFeishuSignature } from "./auth.js";
import { getFeishuRuntime } from "./runtime.js";
import type { FeishuMessagingTarget } from "./targets.js";

export type FeishuRuntimeEnv = {
  log?: (message: string) => void;
  error?: (message: string) => void;
};

export type FeishuMonitorOptions = {
  account: ResolvedFeishuAccount;
  config: ClawdbotConfig;
  runtime: FeishuRuntimeEnv;
  abortSignal: AbortSignal;
  webhookPath?: string;
  webhookUrl?: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

type FeishuCoreRuntime = ReturnType<typeof getFeishuRuntime>;

type WebhookTarget = {
  account: ResolvedFeishuAccount;
  config: ClawdbotConfig;
  runtime: FeishuRuntimeEnv;
  core: FeishuCoreRuntime;
  path: string;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
};

const webhookTargets = new Map<string, WebhookTarget[]>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function logVerbose(core: FeishuCoreRuntime, runtime: FeishuRuntimeEnv, message: string): void {
  if (core.logging.shouldLogVerbose()) {
    runtime.log?.(`[feishu] ${message}`);
  }
}

function normalizeWebhookPath(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "/";
  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  if (withSlash.length > 1 && withSlash.endsWith("/")) {
    return withSlash.slice(0, -1);
  }
  return withSlash;
}

function resolveWebhookPath(webhookPath?: string, webhookUrl?: string): string | null {
  const trimmedPath = webhookPath?.trim();
  if (trimmedPath) return normalizeWebhookPath(trimmedPath);
  if (webhookUrl?.trim()) {
    try {
      const parsed = new URL(webhookUrl);
      return normalizeWebhookPath(parsed.pathname || "/");
    } catch {
      return null;
    }
  }
  return "/feishu";
}

export function registerFeishuWebhookTarget(target: WebhookTarget): () => void {
  const key = normalizeWebhookPath(target.path);
  const normalizedTarget = { ...target, path: key };
  const existing = webhookTargets.get(key) ?? [];
  const next = [...existing, normalizedTarget];
  webhookTargets.set(key, next);
  return () => {
    const updated = (webhookTargets.get(key) ?? []).filter((entry) => entry !== normalizedTarget);
    if (updated.length > 0) {
      webhookTargets.set(key, updated);
    } else {
      webhookTargets.delete(key);
    }
  };
}

async function readRawBody(req: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = [];
  let total = 0;
  return await new Promise<{ ok: boolean; raw?: string; error?: string }>((resolve) => {
    let resolved = false;
    const doResolve = (value: { ok: boolean; raw?: string; error?: string }) => {
      if (resolved) return;
      resolved = true;
      req.removeAllListeners();
      resolve(value);
    };
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        doResolve({ ok: false, error: "payload too large" });
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw.trim()) {
        doResolve({ ok: false, error: "empty payload" });
        return;
      }
      doResolve({ ok: true, raw });
    });
    req.on("error", (err) => {
      doResolve({ ok: false, error: err instanceof Error ? err.message : String(err) });
    });
  });
}

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(raw) as unknown };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

type SelectedRequest = {
  target: WebhookTarget;
  payload: Record<string, unknown>;
};

function extractVerificationToken(payload: Record<string, unknown>): string | undefined {
  const token = readString(payload.token);
  if (token) return token;
  const header = isRecord(payload.header) ? payload.header : undefined;
  return header ? readString(header.token) : undefined;
}

function selectTarget(params: {
  targets: WebhookTarget[];
  rawBody: string;
  outer: Record<string, unknown>;
  headers: {
    timestamp: string;
    nonce: string;
    signature: string;
  };
}): SelectedRequest | null {
  const { targets, rawBody, outer, headers } = params;
  const encrypt = readString(outer.encrypt);

  if (encrypt) {
    for (const candidate of targets) {
      const encryptKey = candidate.account.config.encryptKey?.trim();
      if (!encryptKey) continue;
      if (
        verifyFeishuSignature({
          rawBody,
          encryptKey,
          timestamp: headers.timestamp,
          nonce: headers.nonce,
          signature: headers.signature,
        })
      ) {
        try {
          const decrypted = decryptFeishuEncrypt({ encrypt, encryptKey });
          const json = parseJson(decrypted);
          if (!json.ok || !isRecord(json.value)) continue;
          return { target: candidate, payload: json.value };
        } catch {
          continue;
        }
      }
    }
    return null;
  }

  const token = extractVerificationToken(outer);
  if (token) {
    const match = targets.find(
      (candidate) => candidate.account.config.verificationToken?.trim() === token,
    );
    if (match) return { target: match, payload: outer };
  }

  if (headers.signature && headers.timestamp && headers.nonce) {
    for (const candidate of targets) {
      const encryptKey = candidate.account.config.encryptKey?.trim();
      if (!encryptKey) continue;
      if (
        verifyFeishuSignature({
          rawBody,
          encryptKey,
          timestamp: headers.timestamp,
          nonce: headers.nonce,
          signature: headers.signature,
        })
      ) {
        return { target: candidate, payload: outer };
      }
    }
  }

  return null;
}

function readHeaderValues(req: IncomingMessage) {
  const timestamp = String(
    req.headers["x-lark-request-timestamp"] ?? req.headers["x-feishu-request-timestamp"] ?? "",
  ).trim();
  const nonce = String(
    req.headers["x-lark-request-nonce"] ?? req.headers["x-feishu-request-nonce"] ?? "",
  ).trim();
  const signature = String(req.headers["x-lark-signature"] ?? "").trim();
  return { timestamp, nonce, signature };
}

function parseFeishuTimestampMs(value: string | undefined): number | undefined {
  const raw = value?.trim();
  if (!raw) return undefined;
  const num = Number.parseInt(raw, 10);
  if (!Number.isFinite(num)) return undefined;
  if (raw.length >= 13) return num;
  return num * 1000;
}

function normalizeAllowEntry(raw: string): string {
  return raw
    .trim()
    .replace(/^feishu:/i, "")
    .replace(/^fs:/i, "")
    .replace(/^user:/i, "")
    .replace(/^open_id:/i, "")
    .replace(/^openid:/i, "")
    .toLowerCase();
}

function isSenderAllowed(
  senderOpenId: string,
  senderUserId: string | undefined,
  allowFrom: string[],
): boolean {
  if (allowFrom.includes("*")) return true;
  const openId = normalizeAllowEntry(senderOpenId);
  const userId = senderUserId?.trim().toLowerCase() ?? "";
  return allowFrom.some((entry) => {
    const normalized = normalizeAllowEntry(String(entry));
    if (!normalized) return false;
    if (normalized === openId) return true;
    if (userId && normalized === userId) return true;
    return false;
  });
}

function resolveGroupEntry(account: ResolvedFeishuAccount, chatId: string) {
  const groups = account.config.groups ?? {};
  const keys = Object.keys(groups).filter(Boolean);
  if (keys.length === 0) return { entry: undefined, allowlistConfigured: false };
  const entry = groups[chatId] ?? groups["*"];
  return { entry, allowlistConfigured: true };
}

function extractTextFromMessageContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "";
  const parsed = parseJson(trimmed);
  if (parsed.ok && isRecord(parsed.value)) {
    const text = readString(parsed.value.text);
    if (text) return text;
  }
  return trimmed;
}

function extractMentions(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord);
}

function wasBotMentioned(params: {
  mentions: Array<Record<string, unknown>>;
  bot: { openId?: string; userId?: string };
}): boolean {
  const botOpenId = params.bot.openId?.trim();
  const botUserId = params.bot.userId?.trim();
  if (!botOpenId && !botUserId) return false;
  return params.mentions.some((mention) => {
    const id = isRecord(mention.id) ? mention.id : null;
    const openId = readString((id ?? mention).open_id) ?? readString((id ?? mention).openId);
    const userId = readString((id ?? mention).user_id) ?? readString((id ?? mention).userId);
    if (botOpenId && openId && botOpenId === openId) return true;
    if (botUserId && userId && botUserId === userId) return true;
    return false;
  });
}

async function deliverFeishuReply(params: {
  payload: { text?: string; mediaUrls?: string[]; mediaUrl?: string; replyToId?: string };
  account: ResolvedFeishuAccount;
  target: FeishuMessagingTarget;
  runtime: FeishuRuntimeEnv;
  core: FeishuCoreRuntime;
  cfg: ClawdbotConfig;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
}) {
  const { payload, account, target, runtime, core, cfg, statusSink } = params;
  const mediaList = payload.mediaUrls?.length
    ? payload.mediaUrls
    : payload.mediaUrl
      ? [payload.mediaUrl]
      : [];
  const replyToMessageId = payload.replyToId?.trim() || undefined;

  let text = payload.text ?? "";
  if (mediaList.length > 0) {
    const suffix = mediaList.join("\n");
    text = text.trim() ? `${text.trim()}\n${suffix}` : suffix;
  }

  if (!text.trim()) return;

  const chunkLimit = account.config.textChunkLimit ?? 4000;
  const chunkMode = core.channel.text.resolveChunkMode(cfg, "feishu", account.accountId);
  const chunks = core.channel.text.chunkMarkdownTextWithMode(text, chunkLimit, chunkMode);
  for (const chunk of chunks) {
    try {
      await sendFeishuTextMessage({
        account,
        target,
        text: chunk,
        replyToMessageId,
      });
      statusSink?.({ lastOutboundAt: Date.now() });
    } catch (err) {
      runtime.error?.(`[${account.accountId}] Feishu send failed: ${String(err)}`);
    }
  }
}

async function processFeishuMessage(params: {
  account: ResolvedFeishuAccount;
  config: ClawdbotConfig;
  runtime: FeishuRuntimeEnv;
  core: FeishuCoreRuntime;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  messageId: string;
  chatId: string;
  chatType: string;
  messageType: string;
  content: string;
  mentions: Array<Record<string, unknown>>;
  senderOpenId: string;
  senderUserId?: string;
  senderType?: string;
  createdAt?: number;
}) {
  const {
    account,
    config,
    runtime,
    core,
    statusSink,
    messageId,
    chatId,
    chatType,
    messageType,
    content,
    mentions,
    senderOpenId,
    senderUserId,
    senderType,
    createdAt,
  } = params;

  const isGroup = chatType.toLowerCase() !== "p2p";

  if (senderType && senderType.toLowerCase() !== "user") {
    logVerbose(core, runtime, `skip non-user sender (type=${senderType})`);
    return;
  }

  if (messageType.toLowerCase() !== "text") {
    logVerbose(core, runtime, `skip non-text message (type=${messageType})`);
    return;
  }

  const rawBody = extractTextFromMessageContent(content).trim();
  if (!rawBody) return;

  const defaultGroupPolicy = config.channels?.defaults?.groupPolicy;
  const groupPolicy = account.config.groupPolicy ?? defaultGroupPolicy ?? "allowlist";
  const groupResolved = isGroup ? resolveGroupEntry(account, chatId) : null;
  const groupEntry = groupResolved?.entry;

  const groupUsers = isGroup
    ? (groupEntry?.users ?? account.config.groupAllowFrom ?? []).map((v) => String(v))
    : [];

  if (isGroup) {
    if (groupPolicy === "disabled") {
      logVerbose(core, runtime, `drop group message (groupPolicy=disabled, chat=${chatId})`);
      return;
    }
    const allowlistConfigured = groupResolved?.allowlistConfigured ?? false;
    const allowlisted = Boolean(groupEntry) || Boolean((account.config.groups ?? {})["*"]);
    if (groupPolicy === "allowlist") {
      if (!allowlistConfigured) {
        logVerbose(
          core,
          runtime,
          `drop group message (groupPolicy=allowlist, no allowlist, chat=${chatId})`,
        );
        return;
      }
      if (!allowlisted) {
        logVerbose(core, runtime, `drop group message (not allowlisted, chat=${chatId})`);
        return;
      }
    }
    if (groupEntry?.enabled === false || groupEntry?.allow === false) {
      logVerbose(core, runtime, `drop group message (group disabled, chat=${chatId})`);
      return;
    }

    if (groupUsers.length > 0) {
      const ok = isSenderAllowed(senderOpenId, senderUserId, groupUsers);
      if (!ok) {
        logVerbose(core, runtime, `drop group message (sender not allowed, user=${senderOpenId})`);
        return;
      }
    }
  }

  const dmPolicy = account.config.dm?.policy ?? "pairing";
  const configAllowFrom = (account.config.dm?.allowFrom ?? []).map((v) => String(v));
  const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, config);
  const storeAllowFrom =
    !isGroup && (dmPolicy !== "open" || shouldComputeAuth)
      ? await core.channel.pairing.readAllowFromStore("feishu").catch(() => [])
      : [];
  const effectiveAllowFrom = [...configAllowFrom, ...storeAllowFrom];
  const commandAllowFrom = isGroup ? groupUsers : effectiveAllowFrom;
  const useAccessGroups = config.commands?.useAccessGroups !== false;
  const senderAllowedForCommands = isSenderAllowed(senderOpenId, senderUserId, commandAllowFrom);
  const commandAuthorized = shouldComputeAuth
    ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
        useAccessGroups,
        authorizers: [
          { configured: commandAllowFrom.length > 0, allowed: senderAllowedForCommands },
        ],
      })
    : undefined;

  if (isGroup) {
    const requireMention = groupEntry?.requireMention ?? account.config.requireMention ?? true;
    const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
      cfg: config,
      surface: "feishu",
    });
    let botMentioned = false;
    if (requireMention) {
      try {
        const bot = await getBotIdentity(account).catch(() => null);
        if (bot?.openId || bot?.userId) {
          botMentioned = wasBotMentioned({
            mentions,
            bot: { openId: bot.openId, userId: bot.userId },
          });
        }
      } catch (err) {
        logVerbose(core, runtime, `bot identity lookup failed: ${String(err)}`);
      }
    }

    const mentionGate = resolveMentionGatingWithBypass({
      isGroup: true,
      requireMention,
      canDetectMention: true,
      wasMentioned: botMentioned,
      implicitMention: false,
      hasAnyMention: mentions.length > 0,
      allowTextCommands,
      hasControlCommand: core.channel.text.hasControlCommand(rawBody, config),
      commandAuthorized: commandAuthorized === true,
    });
    if (mentionGate.shouldSkip) {
      logVerbose(core, runtime, `drop group message (mention required, chat=${chatId})`);
      return;
    }
  }

  if (!isGroup) {
    if (dmPolicy === "disabled" || account.config.dm?.enabled === false) {
      logVerbose(core, runtime, `blocked Feishu DM from ${senderOpenId} (dmPolicy=disabled)`);
      return;
    }

    if (dmPolicy !== "open") {
      if (!senderAllowedForCommands) {
        if (dmPolicy === "pairing") {
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: "feishu",
            id: senderOpenId,
            meta: { userId: senderUserId },
          });
          if (created) {
            logVerbose(core, runtime, `feishu pairing request sender=${senderOpenId}`);
            try {
              await sendFeishuTextMessage({
                account,
                target: { kind: "user", openId: senderOpenId },
                text: core.channel.pairing.buildPairingReply({
                  channel: "feishu",
                  idLine: `Your Feishu open id: ${senderOpenId}`,
                  code,
                }),
              });
              statusSink?.({ lastOutboundAt: Date.now() });
            } catch (err) {
              logVerbose(core, runtime, `pairing reply failed for ${senderOpenId}: ${String(err)}`);
            }
          }
        } else {
          logVerbose(
            core,
            runtime,
            `blocked unauthorized Feishu sender ${senderOpenId} (dmPolicy=${dmPolicy})`,
          );
        }
        return;
      }
    }
  }

  if (
    isGroup &&
    core.channel.commands.isControlCommandMessage(rawBody, config) &&
    commandAuthorized !== true
  ) {
    logVerbose(core, runtime, `feishu: drop control command from ${senderOpenId}`);
    return;
  }

  const peerId = isGroup ? chatId : senderOpenId;
  const route = core.channel.routing.resolveAgentRoute({
    cfg: config,
    channel: "feishu",
    accountId: account.accountId,
    peer: { kind: isGroup ? "group" : "dm", id: peerId },
  });

  const fromLabel = isGroup ? `chat:${chatId}` : `user:${senderOpenId}`;
  const storePath = core.channel.session.resolveStorePath(config.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(config);
  const previousTimestamp = core.channel.session.readSessionUpdatedAt({
    storePath,
    sessionKey: route.sessionKey,
  });
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "Feishu",
    from: fromLabel,
    timestamp: createdAt,
    previousTimestamp,
    envelope: envelopeOptions,
    body: rawBody,
  });

  const groupSystemPrompt = isGroup ? groupEntry?.systemPrompt?.trim() || undefined : undefined;

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `feishu:${senderOpenId}`,
    To: isGroup ? `feishu:${chatId}` : `feishu:${senderOpenId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "channel" : "direct",
    ConversationLabel: fromLabel,
    SenderId: senderOpenId,
    SenderUsername: senderUserId,
    CommandAuthorized: commandAuthorized,
    Provider: "feishu",
    Surface: "feishu",
    MessageSid: messageId,
    MessageSidFull: messageId,
    ReplyToId: messageId,
    ReplyToIdFull: messageId,
    GroupSpace: isGroup ? chatId : undefined,
    GroupSystemPrompt: groupSystemPrompt,
    OriginatingChannel: "feishu",
    OriginatingTo: isGroup ? `feishu:${chatId}` : `feishu:${senderOpenId}`,
  });

  void core.channel.session
    .recordSessionMetaFromInbound({
      storePath,
      sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
      ctx: ctxPayload,
    })
    .catch((err) => {
      runtime.error?.(`feishu: failed updating session meta: ${String(err)}`);
    });

  const target: FeishuMessagingTarget = isGroup
    ? { kind: "chat", chatId }
    : { kind: "user", openId: senderOpenId };
  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg: config,
    dispatcherOptions: {
      deliver: async (payload) => {
        await deliverFeishuReply({
          payload,
          account,
          target,
          runtime,
          core,
          cfg: config,
          statusSink,
        });
      },
      onError: (err, info) => {
        runtime.error?.(`[${account.accountId}] Feishu ${info.kind} reply failed: ${String(err)}`);
      },
    },
  });
}

export async function handleFeishuWebhookRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<boolean> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const path = normalizeWebhookPath(url.pathname);
  const targets = webhookTargets.get(path);
  if (!targets || targets.length === 0) return false;

  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Allow", "POST");
    res.end("Method Not Allowed");
    return true;
  }

  const body = await readRawBody(req, 1024 * 1024);
  if (!body.ok) {
    res.statusCode = body.error === "payload too large" ? 413 : 400;
    res.end(body.error ?? "invalid payload");
    return true;
  }

  const parsed = parseJson(body.raw ?? "");
  if (!parsed.ok || !isRecord(parsed.value)) {
    res.statusCode = 400;
    res.end("invalid payload");
    return true;
  }

  const headers = readHeaderValues(req);
  const selected = selectTarget({
    targets,
    rawBody: body.raw ?? "",
    outer: parsed.value,
    headers,
  });
  if (!selected) {
    res.statusCode = 401;
    res.end("unauthorized");
    return true;
  }

  const payload = selected.payload;
  const eventType = readString(isRecord(payload.header) ? payload.header.event_type : undefined);
  const type = readString(payload.type);

  if (type === "url_verification") {
    const challenge = readString(payload.challenge);
    if (!challenge) {
      res.statusCode = 400;
      res.end("invalid payload");
      return true;
    }
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ challenge }));
    return true;
  }

  if (eventType !== "im.message.receive_v1") {
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json");
    res.end("{}");
    return true;
  }

  const event = isRecord(payload.event) ? payload.event : null;
  const message = event && isRecord(event.message) ? event.message : null;
  const sender = event && isRecord(event.sender) ? event.sender : null;
  if (!message || !sender) {
    res.statusCode = 400;
    res.end("invalid payload");
    return true;
  }

  const messageId =
    readString(message.message_id) ?? readString(message.messageId) ?? readString(message.id);
  const chatId = readString(message.chat_id) ?? readString(message.chatId);
  const chatType = readString(message.chat_type) ?? readString(message.chatType) ?? "";
  const messageType = readString(message.message_type) ?? readString(message.messageType) ?? "";
  const content = readString(message.content) ?? "";
  if (!messageId || !chatId || !chatType || !messageType || !content) {
    res.statusCode = 400;
    res.end("invalid payload");
    return true;
  }

  const senderId = isRecord(sender.sender_id) ? sender.sender_id : null;
  const senderOpenId =
    readString((senderId ?? sender).open_id) ?? readString((senderId ?? sender).openId) ?? "";
  const senderUserId =
    readString((senderId ?? sender).user_id) ?? readString((senderId ?? sender).userId);
  const senderType = readString(sender.sender_type) ?? readString(sender.senderType);
  if (!senderOpenId) {
    res.statusCode = 400;
    res.end("invalid payload");
    return true;
  }

  const mentions = extractMentions(message.mentions);
  const createdAt = parseFeishuTimestampMs(
    readString(isRecord(payload.header) ? payload.header.create_time : undefined),
  );

  selected.target.statusSink?.({ lastInboundAt: Date.now() });
  processFeishuMessage({
    account: selected.target.account,
    config: selected.target.config,
    runtime: selected.target.runtime,
    core: selected.target.core,
    statusSink: selected.target.statusSink,
    messageId,
    chatId,
    chatType,
    messageType,
    content,
    mentions,
    senderOpenId,
    senderUserId,
    senderType,
    createdAt,
  }).catch((err) => {
    selected.target.runtime.error?.(
      `[${selected.target.account.accountId}] Feishu webhook failed: ${String(err)}`,
    );
  });

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end("{}");
  return true;
}

export async function startFeishuMonitor(options: FeishuMonitorOptions): Promise<() => void> {
  const core = getFeishuRuntime();
  const webhookPath = resolveWebhookPath(options.webhookPath, options.webhookUrl);
  if (!webhookPath) {
    options.runtime.error?.(`[${options.account.accountId}] invalid webhook path`);
    return () => {};
  }

  const unregister = registerFeishuWebhookTarget({
    account: options.account,
    config: options.config,
    runtime: options.runtime,
    core,
    path: webhookPath,
    statusSink: options.statusSink,
  });

  return unregister;
}

export function resolveFeishuWebhookPath(params: { account: ResolvedFeishuAccount }): string {
  return (
    resolveWebhookPath(params.account.config.webhookPath, params.account.config.webhookUrl) ??
    "/feishu"
  );
}
