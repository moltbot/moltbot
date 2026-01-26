import crypto from "node:crypto";

import type { ResolvedFeishuAccount } from "./accounts.js";
import type { FeishuMessagingTarget } from "./targets.js";

const FEISHU_API_ORIGIN = "https://open.feishu.cn";
const FEISHU_API_BASE = `${FEISHU_API_ORIGIN}/open-apis`;

type FeishuApiOk<T> = { ok: true; data: T };
type FeishuApiErr = { ok: false; error: string; code?: number; logId?: string };

type FeishuApiResult<T> = FeishuApiOk<T> | FeishuApiErr;

type TenantToken = {
  token: string;
  expiresAt: number;
};

type BotIdentity = {
  openId?: string;
  userId?: string;
  name?: string;
  fetchedAt: number;
};

const tokenCache = new Map<string, TenantToken>();
const botCache = new Map<string, BotIdentity>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function resolveAccountKey(account: ResolvedFeishuAccount): string {
  const appId = account.config.appId?.trim() ?? "";
  return `${FEISHU_API_ORIGIN}|${appId}`;
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text.trim()) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(
      `invalid JSON response (${res.status}): ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

function extractFeishuError(payload: unknown): FeishuApiErr {
  if (!isRecord(payload)) return { ok: false, error: "invalid response" };
  const code = typeof payload.code === "number" ? payload.code : undefined;
  const msg = readString(payload.msg) ?? readString(payload.message) ?? "request failed";
  const logId =
    readString((payload.error as { log_id?: unknown } | undefined)?.log_id) ??
    readString(payload.log_id);
  return { ok: false, error: msg, code, logId };
}

function isFeishuOk(payload: unknown): payload is Record<string, unknown> & { code: number } {
  return isRecord(payload) && typeof payload.code === "number" && payload.code === 0;
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export async function fetchTenantAccessToken(
  account: ResolvedFeishuAccount,
): Promise<FeishuApiResult<{ token: string; expiresAt: number }>> {
  const appId = account.config.appId?.trim() ?? "";
  const appSecret = account.config.appSecret?.trim() ?? "";
  if (!appId || !appSecret) {
    return { ok: false, error: "missing appId/appSecret" };
  }

  const res = await fetch(`${FEISHU_API_BASE}/auth/v3/tenant_access_token/internal`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const payload = await readJson(res);
  if (!res.ok) {
    return extractFeishuError(payload);
  }
  if (!isFeishuOk(payload)) {
    return extractFeishuError(payload);
  }
  const token =
    readString((payload as Record<string, unknown>).tenant_access_token) ??
    readString((payload as Record<string, unknown>).tenantAccessToken) ??
    readString(
      (payload as { data?: unknown }).data &&
        (payload as { data?: Record<string, unknown> }).data?.tenant_access_token,
    );
  const expireSeconds =
    typeof (payload as Record<string, unknown>).expire === "number"
      ? (payload as Record<string, unknown>).expire
      : typeof (payload as { data?: Record<string, unknown> }).data?.expire === "number"
        ? (payload as { data?: Record<string, unknown> }).data!.expire
        : undefined;
  if (!token || !expireSeconds || expireSeconds <= 0) {
    return { ok: false, error: "token response missing tenant_access_token/expire" };
  }
  const expiresAt = Date.now() + expireSeconds * 1000 - 3 * 60 * 1000;
  return { ok: true, data: { token, expiresAt } };
}

export async function getTenantAccessToken(account: ResolvedFeishuAccount): Promise<string> {
  const key = resolveAccountKey(account);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const fetched = await fetchTenantAccessToken(account);
  if (!fetched.ok) {
    const suffix = fetched.logId ? ` (log_id=${fetched.logId})` : "";
    throw new Error(`Feishu token fetch failed: ${fetched.error}${suffix}`);
  }
  tokenCache.set(key, { token: fetched.data.token, expiresAt: fetched.data.expiresAt });
  return fetched.data.token;
}

function extractBotIdentity(payload: unknown): { openId?: string; userId?: string; name?: string } {
  if (!isRecord(payload)) return {};
  const data = (payload as { data?: unknown }).data;
  const container = isRecord(data) ? data : payload;
  const bot = isRecord((container as Record<string, unknown>).bot)
    ? ((container as Record<string, unknown>).bot as Record<string, unknown>)
    : (container as Record<string, unknown>);
  return {
    openId: readString(bot.open_id) ?? readString((container as Record<string, unknown>).open_id),
    userId: readString(bot.user_id) ?? readString((container as Record<string, unknown>).user_id),
    name: readString(bot.name) ?? readString((container as Record<string, unknown>).name),
  };
}

export async function getBotIdentity(
  account: ResolvedFeishuAccount,
  opts?: { maxAgeMs?: number },
): Promise<BotIdentity> {
  const maxAgeMs = typeof opts?.maxAgeMs === "number" ? Math.max(1, opts.maxAgeMs) : 10 * 60 * 1000;
  const key = resolveAccountKey(account);
  const cached = botCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < maxAgeMs) return cached;

  const token = await getTenantAccessToken(account);
  const res = await fetch(`${FEISHU_API_BASE}/bot/v3/info`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const payload = await readJson(res);
  if (!res.ok || !isFeishuOk(payload)) {
    const err = extractFeishuError(payload);
    const suffix = err.logId ? ` (log_id=${err.logId})` : "";
    throw new Error(`Feishu bot info failed: ${err.error}${suffix}`);
  }
  const identity = extractBotIdentity(payload);
  const next: BotIdentity = {
    openId: identity.openId,
    userId: identity.userId,
    name: identity.name,
    fetchedAt: Date.now(),
  };
  botCache.set(key, next);
  return next;
}

export async function sendFeishuTextMessage(params: {
  account: ResolvedFeishuAccount;
  target: FeishuMessagingTarget;
  text: string;
  replyToMessageId?: string;
}): Promise<{ messageId: string }> {
  const token = await getTenantAccessToken(params.account);
  const body = {
    msg_type: "text",
    content: JSON.stringify({ text: params.text }),
  };

  const endpoint = params.replyToMessageId
    ? `${FEISHU_API_BASE}/im/v1/messages/${encodeURIComponent(params.replyToMessageId)}/reply`
    : `${FEISHU_API_BASE}/im/v1/messages`;
  const query = params.replyToMessageId
    ? null
    : params.target.kind === "user"
      ? "receive_id_type=open_id"
      : "receive_id_type=chat_id";
  const url = query ? `${endpoint}?${query}` : endpoint;
  const payload = params.replyToMessageId
    ? {
        ...body,
        reply_in_thread: false,
      }
    : {
        ...body,
        receive_id: params.target.kind === "user" ? params.target.openId : params.target.chatId,
      };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const json = await readJson(res);
  if (!res.ok || !isFeishuOk(json)) {
    const err = extractFeishuError(json);
    const suffix = err.logId ? ` (log_id=${err.logId})` : "";
    throw new Error(`Feishu send failed: ${err.error}${suffix}`);
  }

  const data = isRecord((json as { data?: unknown }).data)
    ? ((json as { data?: Record<string, unknown> }).data as Record<string, unknown>)
    : (json as Record<string, unknown>);
  const messageId = readString(data.message_id) ?? readString(data.messageId) ?? "";
  if (!messageId) {
    // The API returns a `message_id` in most cases; if missing, still treat as success.
    return { messageId: sha256Hex(`${Date.now()}${Math.random()}`) };
  }
  return { messageId };
}
