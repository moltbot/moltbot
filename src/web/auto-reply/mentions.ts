import { buildMentionRegexes, normalizeMentionText } from "../../auto-reply/reply/mentions.js";
import type { loadConfig } from "../../config/config.js";
import { isSelfChatMode, jidToE164, normalizeE164 } from "../../utils.js";
import type { WebInboundMsg } from "./types.js";

export type MentionConfig = {
  mentionRegexes: RegExp[];
  allowFrom?: Array<string | number>;
};

export type MentionTargets = {
  normalizedMentions: string[];
  selfE164: string | null;
  selfJid: string | null;
  selfLid: string | null;
};

export function buildMentionConfig(
  cfg: ReturnType<typeof loadConfig>,
  agentId?: string,
): MentionConfig {
  const mentionRegexes = buildMentionRegexes(cfg, agentId);
  return { mentionRegexes, allowFrom: cfg.channels?.whatsapp?.allowFrom };
}

/**
 * Normalize a JID/LID by removing the device suffix (e.g., `:5`).
 * Example: `98157853687950:5@lid` -> `98157853687950@lid`
 */
function normalizeBareId(jid: string | null | undefined): string | null {
  if (!jid) {
    return null;
  }
  return jid.replace(/:\d+(@)/, "$1");
}

export function resolveMentionTargets(msg: WebInboundMsg, authDir?: string): MentionTargets {
  const jidOptions = authDir ? { authDir } : undefined;
  const normalizedMentions = msg.mentionedJids?.length
    ? msg.mentionedJids.map((jid) => jidToE164(jid, jidOptions) ?? jid).filter(Boolean)
    : [];
  const selfE164 = msg.selfE164 ?? (msg.selfJid ? jidToE164(msg.selfJid, jidOptions) : null);
  const selfJid = normalizeBareId(msg.selfJid);
  const selfLid = normalizeBareId(msg.selfLid);
  return { normalizedMentions, selfE164, selfJid, selfLid };
}

/**
 * Check if the message is a reply to the bot's own message.
 * This acts as an implicit mention in group chats.
 */
function isReplyToBot(msg: WebInboundMsg, targets: MentionTargets): boolean {
  const replyToJid = msg.replyToSenderJid;
  if (!replyToJid) {
    return false;
  }

  const replyToJidBare = normalizeBareId(replyToJid);

  // Check if replying to bot's JID (s.whatsapp.net format)
  if (targets.selfJid) {
    const selfJidBare = normalizeBareId(targets.selfJid);
    if (replyToJidBare === selfJidBare) {
      return true;
    }
  }

  // Check if replying to bot's LID (Linked ID format)
  // WhatsApp uses LIDs in some contexts instead of traditional JIDs
  // Use replyToJidBare to handle device suffixes like `:5@lid`
  if (replyToJidBare?.endsWith("@lid") && targets.selfLid) {
    const selfLidBare = normalizeBareId(targets.selfLid);
    if (replyToJidBare === selfLidBare) {
      return true;
    }
  }

  // Fallback: check E164 match if available
  if (msg.replyToSenderE164 && targets.selfE164) {
    const replyE164 = normalizeE164(msg.replyToSenderE164);
    if (replyE164 === targets.selfE164) {
      return true;
    }
  }

  return false;
}

export function isBotMentionedFromTargets(
  msg: WebInboundMsg,
  mentionCfg: MentionConfig,
  targets: MentionTargets,
): boolean {
  const clean = (text: string) =>
    // Remove zero-width and directionality markers WhatsApp injects around display names
    normalizeMentionText(text);

  const isSelfChat = isSelfChatMode(targets.selfE164, mentionCfg.allowFrom);

  // Check if this is a reply to the bot's message (implicit mention in groups)
  if (msg.chatType === "group" && isReplyToBot(msg, targets)) {
    return true;
  }

  const hasMentions = (msg.mentionedJids?.length ?? 0) > 0;
  if (hasMentions && !isSelfChat) {
    if (targets.selfE164 && targets.normalizedMentions.includes(targets.selfE164)) {
      return true;
    }
    if (targets.selfJid) {
      // Some mentions use the bare JID; match on E.164 to be safe.
      if (targets.normalizedMentions.includes(targets.selfJid)) {
        return true;
      }
    }
    // If the message explicitly mentions someone else, do not fall back to regex matches.
    return false;
  } else if (hasMentions && isSelfChat) {
    // Self-chat mode: ignore WhatsApp @mention JIDs, otherwise @mentioning the owner in group chats triggers the bot.
  }
  const bodyClean = clean(msg.body);
  if (mentionCfg.mentionRegexes.some((re) => re.test(bodyClean))) {
    return true;
  }

  // Fallback: detect body containing our own number (with or without +, spacing)
  if (targets.selfE164) {
    const selfDigits = targets.selfE164.replace(/\D/g, "");
    if (selfDigits) {
      const bodyDigits = bodyClean.replace(/[^\d]/g, "");
      if (bodyDigits.includes(selfDigits)) {
        return true;
      }
      const bodyNoSpace = msg.body.replace(/[\s-]/g, "");
      const pattern = new RegExp(`\\+?${selfDigits}`, "i");
      if (pattern.test(bodyNoSpace)) {
        return true;
      }
    }
  }

  return false;
}

export function debugMention(
  msg: WebInboundMsg,
  mentionCfg: MentionConfig,
  authDir?: string,
): { wasMentioned: boolean; details: Record<string, unknown> } {
  const mentionTargets = resolveMentionTargets(msg, authDir);
  const result = isBotMentionedFromTargets(msg, mentionCfg, mentionTargets);
  const details = {
    from: msg.from,
    body: msg.body,
    bodyClean: normalizeMentionText(msg.body),
    mentionedJids: msg.mentionedJids ?? null,
    normalizedMentionedJids: mentionTargets.normalizedMentions.length
      ? mentionTargets.normalizedMentions
      : null,
    selfJid: msg.selfJid ?? null,
    selfJidBare: mentionTargets.selfJid,
    selfLid: msg.selfLid ?? null,
    selfLidBare: mentionTargets.selfLid,
    selfE164: msg.selfE164 ?? null,
    resolvedSelfE164: mentionTargets.selfE164,
    replyToSenderJid: msg.replyToSenderJid ?? null,
    replyToSenderE164: msg.replyToSenderE164 ?? null,
    isReplyToBot: isReplyToBot(msg, mentionTargets),
  };
  return { wasMentioned: result, details };
}

export function resolveOwnerList(mentionCfg: MentionConfig, selfE164?: string | null) {
  const allowFrom = mentionCfg.allowFrom;
  const raw =
    Array.isArray(allowFrom) && allowFrom.length > 0 ? allowFrom : selfE164 ? [selfE164] : [];
  return raw
    .filter((entry): entry is string => Boolean(entry && entry !== "*"))
    .map((entry) => normalizeE164(entry))
    .filter((entry): entry is string => Boolean(entry));
}
