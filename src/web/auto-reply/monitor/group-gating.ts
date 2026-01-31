import { hasControlCommand } from "../../../auto-reply/command-detection.js";
import { parseActivationCommand } from "../../../auto-reply/group-activation.js";
import type { loadConfig } from "../../../config/config.js";
import { normalizeE164 } from "../../../utils.js";
import { resolveMentionGating } from "../../../channels/mention-gating.js";
import type { MentionConfig } from "../mentions.js";
import { buildMentionConfig, debugMention, resolveOwnerList } from "../mentions.js";
import type { WebInboundMsg } from "../types.js";
import { recordPendingHistoryEntryIfEnabled } from "../../../auto-reply/reply/history.js";
import { stripMentionsForCommand } from "./commands.js";
import { resolveGroupActivationFor, resolveGroupPolicyFor } from "./group-activation.js";
import { noteGroupMember } from "./group-members.js";

export type GroupHistoryEntry = {
  sender: string;
  body: string;
  timestamp?: number;
  id?: string;
  senderJid?: string;
};

function isOwnerSender(baseMentionConfig: MentionConfig, msg: WebInboundMsg) {
  const sender = normalizeE164(msg.senderE164 ?? "");
  if (!sender) return false;
  const owners = resolveOwnerList(baseMentionConfig, msg.selfE164 ?? undefined);
  return owners.includes(sender);
}

export function applyGroupGating(params: {
  cfg: ReturnType<typeof loadConfig>;
  msg: WebInboundMsg;
  conversationId: string;
  groupHistoryKey: string;
  agentId: string;
  sessionKey: string;
  baseMentionConfig: MentionConfig;
  authDir?: string;
  groupHistories: Map<string, GroupHistoryEntry[]>;
  groupHistoryLimit: number;
  groupMemberNames: Map<string, Map<string, string>>;
  logVerbose: (msg: string) => void;
  replyLogger: { debug: (obj: unknown, msg: string) => void };
}) {
  const groupPolicy = resolveGroupPolicyFor(params.cfg, params.conversationId);
  if (groupPolicy.allowlistEnabled && !groupPolicy.allowed) {
    params.logVerbose(`Skipping group message ${params.conversationId} (not in allowlist)`);
    return { shouldProcess: false };
  }

  noteGroupMember(
    params.groupMemberNames,
    params.groupHistoryKey,
    params.msg.senderE164,
    params.msg.senderName,
  );

  const mentionConfig = buildMentionConfig(params.cfg, params.agentId);
  const commandBody = stripMentionsForCommand(
    params.msg.body,
    mentionConfig.mentionRegexes,
    params.msg.selfE164,
  );
  const activationCommand = parseActivationCommand(commandBody);
  const owner = isOwnerSender(params.baseMentionConfig, params.msg);
  const shouldBypassMention = owner && hasControlCommand(commandBody, params.cfg);

  if (activationCommand.hasCommand && !owner) {
    params.logVerbose(`Ignoring /activation from non-owner in group ${params.conversationId}`);
    const sender =
      params.msg.senderName && params.msg.senderE164
        ? `${params.msg.senderName} (${params.msg.senderE164})`
        : (params.msg.senderName ?? params.msg.senderE164 ?? "Unknown");
    recordPendingHistoryEntryIfEnabled({
      historyMap: params.groupHistories,
      historyKey: params.groupHistoryKey,
      limit: params.groupHistoryLimit,
      entry: {
        sender,
        body: params.msg.body,
        timestamp: params.msg.timestamp,
        id: params.msg.id,
        senderJid: params.msg.senderJid,
      },
    });
    return { shouldProcess: false };
  }

  const mentionDebug = debugMention(params.msg, mentionConfig, params.authDir);
  params.replyLogger.debug(
    {
      conversationId: params.conversationId,
      wasMentioned: mentionDebug.wasMentioned,
      ...mentionDebug.details,
    },
    "group mention debug",
  );
  const wasMentioned = mentionDebug.wasMentioned;
  const activation = resolveGroupActivationFor({
    cfg: params.cfg,
    agentId: params.agentId,
    sessionKey: params.sessionKey,
    conversationId: params.conversationId,
  });

  // Check if this message is a reply to the bot
  const selfJid = params.msg.selfJid?.replace(/:\d+/, "");
  const replySenderJid = params.msg.replyToSenderJid?.replace(/:\d+/, "");
  const selfE164 = params.msg.selfE164 ? normalizeE164(params.msg.selfE164) : null;
  const replySenderE164 = params.msg.replyToSenderE164
    ? normalizeE164(params.msg.replyToSenderE164)
    : null;
  const isReplyToBot = Boolean(
    (selfJid && replySenderJid && selfJid === replySenderJid) ||
    (selfE164 && replySenderE164 && selfE164 === replySenderE164),
  );

  // Owner control commands bypass activation restrictions
  const bypassMention = shouldBypassMention === true;

  // require mention only in strict 'mention' mode
  const requireMention = activation === "mention";
  const mentionGate = resolveMentionGating({
    requireMention,
    canDetectMention: true,
    wasMentioned,
    implicitMention: isReplyToBot, // treat reply-to-bot as an implicit mention
    shouldBypassMention: bypassMention,
  });

  // Determine if we should process based on activation mode
  const shouldProcess = (() => {
    if (activation === "always") return true;
    if (activation === "never") return bypassMention;
    if (activation === "replies") return isReplyToBot || bypassMention;
    if (activation === "mention+replies") return mentionGate.effectiveWasMentioned;
    // Default to "mention" mode
    return !mentionGate.shouldSkip;
  })();
  params.msg.wasMentioned = mentionGate.effectiveWasMentioned;

  if (!shouldProcess) {
    params.logVerbose(
      `Group message stored for context (no activation pass) in ${params.conversationId}: ${params.msg.body}`,
    );
    const sender =
      params.msg.senderName && params.msg.senderE164
        ? `${params.msg.senderName} (${params.msg.senderE164})`
        : (params.msg.senderName ?? params.msg.senderE164 ?? "Unknown");
    recordPendingHistoryEntryIfEnabled({
      historyMap: params.groupHistories,
      historyKey: params.groupHistoryKey,
      limit: params.groupHistoryLimit,
      entry: {
        sender,
        body: params.msg.body,
        timestamp: params.msg.timestamp,
        id: params.msg.id,
        senderJid: params.msg.senderJid,
      },
    });
    return { shouldProcess: false };
  }

  return { shouldProcess: true };
}
