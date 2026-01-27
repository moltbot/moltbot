import { callGateway } from "../../gateway/call.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../../utils/message-channel.js";
import { logVerbose } from "../../globals.js";
import {
  getBatchApprovalIds,
  deleteBatch,
  updateBatchApprovalIds,
} from "../../infra/exec-approval-forwarder.js";
import type { CommandHandler } from "./commands-types.js";

const COMMAND = "/approve";
const BATCH_COMMAND = "/approve-batch";

const DECISION_ALIASES: Record<string, "allow-once" | "allow-always" | "deny"> = {
  allow: "allow-once",
  once: "allow-once",
  "allow-once": "allow-once",
  allowonce: "allow-once",
  always: "allow-always",
  "allow-always": "allow-always",
  allowalways: "allow-always",
  deny: "deny",
  reject: "deny",
  block: "deny",
};

type ParsedApproveCommand =
  | { ok: true; id: string; decision: "allow-once" | "allow-always" | "deny" }
  | { ok: false; error: string };

function parseApproveCommand(raw: string): ParsedApproveCommand | null {
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  // Don't match /approve-batch - it has its own handler
  if (!lower.startsWith(COMMAND)) return null;
  if (lower.startsWith(BATCH_COMMAND)) return null;
  const rest = trimmed.slice(COMMAND.length).trim();
  if (!rest) {
    return { ok: false, error: "Usage: /approve <id> allow-once|allow-always|deny" };
  }
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return { ok: false, error: "Usage: /approve <id> allow-once|allow-always|deny" };
  }

  const first = tokens[0].toLowerCase();
  const second = tokens[1].toLowerCase();

  if (DECISION_ALIASES[first]) {
    return {
      ok: true,
      decision: DECISION_ALIASES[first],
      id: tokens.slice(1).join(" ").trim(),
    };
  }
  if (DECISION_ALIASES[second]) {
    return {
      ok: true,
      decision: DECISION_ALIASES[second],
      id: tokens[0],
    };
  }
  return { ok: false, error: "Usage: /approve <id> allow-once|allow-always|deny" };
}

type ParsedBatchCommand =
  | { ok: true; batchId: string; decision: "allow-once" | "deny" }
  | { ok: false; error: string };

function parseBatchCommand(raw: string): ParsedBatchCommand | null {
  const trimmed = raw.trim();
  if (!trimmed.toLowerCase().startsWith(BATCH_COMMAND)) return null;
  const rest = trimmed.slice(BATCH_COMMAND.length).trim();
  if (!rest) {
    return { ok: false, error: "Usage: /approve-batch <batch-id> allow-once|deny" };
  }
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return { ok: false, error: "Usage: /approve-batch <batch-id> allow-once|deny" };
  }

  const batchId = tokens[0];
  const decisionRaw = tokens[1].toLowerCase();

  // Batch only supports allow-once and deny
  const batchDecisions: Record<string, "allow-once" | "deny"> = {
    allow: "allow-once",
    once: "allow-once",
    "allow-once": "allow-once",
    allowonce: "allow-once",
    deny: "deny",
    reject: "deny",
    block: "deny",
  };

  const decision = batchDecisions[decisionRaw];
  if (!decision) {
    return { ok: false, error: "Usage: /approve-batch <batch-id> allow-once|deny" };
  }

  return { ok: true, batchId, decision };
}

function buildResolvedByLabel(params: Parameters<CommandHandler>[0]): string {
  const channel = params.command.channel;
  const sender = params.command.senderId ?? "unknown";
  return `${channel}:${sender}`;
}

export const handleApproveCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) return null;
  const normalized = params.command.commandBodyNormalized;
  const parsed = parseApproveCommand(normalized);
  if (!parsed) return null;
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /approve from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  if (!parsed.ok) {
    return { shouldContinue: false, reply: { text: parsed.error } };
  }

  const resolvedBy = buildResolvedByLabel(params);
  try {
    await callGateway({
      method: "exec.approval.resolve",
      params: { id: parsed.id, decision: parsed.decision },
      clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
      clientDisplayName: `Chat approval (${resolvedBy})`,
      mode: GATEWAY_CLIENT_MODES.BACKEND,
    });
  } catch (err) {
    return {
      shouldContinue: false,
      reply: {
        text: `❌ Failed to submit approval: ${String(err)}`,
      },
    };
  }

  return {
    shouldContinue: false,
    reply: { text: `✅ Exec approval ${parsed.decision} submitted for ${parsed.id}.` },
  };
};

export const handleApproveBatchCommand: CommandHandler = async (params, allowTextCommands) => {
  if (!allowTextCommands) return null;
  const normalized = params.command.commandBodyNormalized;
  const parsed = parseBatchCommand(normalized);
  if (!parsed) return null;
  if (!params.command.isAuthorizedSender) {
    logVerbose(
      `Ignoring /approve-batch from unauthorized sender: ${params.command.senderId || "<unknown>"}`,
    );
    return { shouldContinue: false };
  }

  if (!parsed.ok) {
    return { shouldContinue: false, reply: { text: parsed.error } };
  }

  // Look up the batch
  const approvalIds = getBatchApprovalIds(parsed.batchId);
  if (!approvalIds || approvalIds.length === 0) {
    return {
      shouldContinue: false,
      reply: { text: `❌ Batch not found or expired: ${parsed.batchId}` },
    };
  }

  const resolvedBy = buildResolvedByLabel(params);
  const results: { id: string; success: boolean; error?: string }[] = [];

  // Resolve all approvals in the batch
  for (const id of approvalIds) {
    try {
      await callGateway({
        method: "exec.approval.resolve",
        params: { id, decision: parsed.decision },
        clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
        clientDisplayName: `Batch approval (${resolvedBy})`,
        mode: GATEWAY_CLIENT_MODES.BACKEND,
      });
      results.push({ id, success: true });
    } catch (err) {
      results.push({ id, success: false, error: String(err) });
    }
  }

  const failedIds = results.filter((r) => !r.success).map((r) => r.id);
  if (failedIds.length === 0) {
    deleteBatch(parsed.batchId);
  } else {
    updateBatchApprovalIds(parsed.batchId, failedIds);
  }

  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  if (failed === 0) {
    return {
      shouldContinue: false,
      reply: {
        text: `✅ Batch ${parsed.decision}: ${succeeded} command${succeeded > 1 ? "s" : ""} approved.`,
      },
    };
  }

  return {
    shouldContinue: false,
    reply: {
      text: `⚠️ Batch ${parsed.decision}: ${succeeded} succeeded, ${failed} failed.`,
    },
  };
};
