export type FeishuMessagingTarget =
  | { kind: "user"; openId: string }
  | { kind: "chat"; chatId: string };

function stripPrefixes(value: string): string {
  return value.replace(/^feishu:/i, "").replace(/^fs:/i, "");
}

function normalizeBareId(value: string): FeishuMessagingTarget | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^ou_/i.test(trimmed)) return { kind: "user", openId: trimmed };
  if (/^oc_/i.test(trimmed)) return { kind: "chat", chatId: trimmed };
  return null;
}

export function normalizeFeishuMessagingTarget(raw: string): string | undefined {
  const trimmed = stripPrefixes(raw.trim());
  if (!trimmed) return undefined;

  const match = trimmed.match(/^(user|open_id|openid|chat|chat_id|chatid):(.+)$/i);
  if (match) {
    const kind = match[1].toLowerCase();
    const id = match[2].trim();
    if (!id) return undefined;
    if (kind === "user" || kind === "open_id" || kind === "openid") return `user:${id}`;
    if (kind === "chat" || kind === "chat_id" || kind === "chatid") return `chat:${id}`;
    return undefined;
  }

  const bare = normalizeBareId(trimmed);
  if (bare?.kind === "user") return `user:${bare.openId}`;
  if (bare?.kind === "chat") return `chat:${bare.chatId}`;
  return undefined;
}

export function parseFeishuMessagingTarget(raw: string): FeishuMessagingTarget | null {
  const normalized = normalizeFeishuMessagingTarget(raw);
  if (!normalized) return null;
  if (normalized.toLowerCase().startsWith("user:")) {
    const openId = normalized.slice("user:".length).trim();
    return openId ? { kind: "user", openId } : null;
  }
  if (normalized.toLowerCase().startsWith("chat:")) {
    const chatId = normalized.slice("chat:".length).trim();
    return chatId ? { kind: "chat", chatId } : null;
  }
  return null;
}

export function looksLikeFeishuTargetId(raw: string): boolean {
  const normalized = normalizeFeishuMessagingTarget(raw);
  if (!normalized) return false;
  if (normalized.toLowerCase().startsWith("user:")) return true;
  if (normalized.toLowerCase().startsWith("chat:")) return true;
  return false;
}
