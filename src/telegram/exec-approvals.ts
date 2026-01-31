/**
 * Telegram Exec Approval Handler
 *
 * Sends exec approval prompts with inline buttons (Allow once / Always allow / Deny)
 * to configured approvers in Telegram DMs.
 *
 * Based on Discord implementation: src/discord/monitor/exec-approvals.ts
 */

import type { OpenClawConfig } from "../config/config.js";
import { GatewayClient } from "../gateway/client.js";
import { callGateway } from "../gateway/call.js";
import { GATEWAY_CLIENT_MODES, GATEWAY_CLIENT_NAMES } from "../utils/message-channel.js";
import type { EventFrame } from "../gateway/protocol/index.js";
import type { ExecApprovalDecision } from "../infra/exec-approvals.js";
import { logDebug, logError } from "../logger.js";
import type { RuntimeEnv } from "../runtime.js";
import { sendMessageTelegram, editMessageTelegram } from "./send.js";

const EXEC_APPROVAL_KEY = "tg_approve";

// ----- Types -----

export type ExecApprovalRequest = {
  id: string;
  request: {
    command: string;
    cwd?: string | null;
    host?: string | null;
    security?: string | null;
    ask?: string | null;
    agentId?: string | null;
    resolvedPath?: string | null;
    sessionKey?: string | null;
  };
  createdAtMs: number;
  expiresAtMs: number;
};

export type ExecApprovalResolved = {
  id: string;
  decision: ExecApprovalDecision;
  resolvedBy?: string | null;
  ts: number;
};

type PendingApproval = {
  telegramMessageId: string;
  telegramChatId: string;
  timeoutId: ReturnType<typeof setTimeout>;
};

export type TelegramExecApprovalConfig = {
  /** Enable exec approval forwarding to Telegram DMs. Default: false. */
  enabled?: boolean;
  /** Telegram user IDs to send approval requests to. */
  approvers?: Array<string | number>;
  /** Only forward approvals for these agent IDs. */
  agentFilter?: string[];
  /** Only forward approvals matching these session key patterns (substring or regex). */
  sessionFilter?: string[];
};

export type TelegramExecApprovalHandlerOpts = {
  token: string;
  accountId: string;
  config: TelegramExecApprovalConfig;
  gatewayUrl?: string;
  cfg: OpenClawConfig;
  runtime?: RuntimeEnv;
};

// ----- Callback Data Encoding -----

export function buildTelegramApprovalCallbackData(
  approvalId: string,
  action: ExecApprovalDecision,
): string {
  // Format: tg_approve:<action>:<id>
  // Keep it simple to fit Telegram's 64-byte callback_data limit
  return `${EXEC_APPROVAL_KEY}:${action}:${approvalId}`;
}

export function parseTelegramApprovalCallbackData(
  data: string,
): { approvalId: string; action: ExecApprovalDecision } | null {
  if (!data.startsWith(`${EXEC_APPROVAL_KEY}:`)) return null;
  const parts = data.split(":");
  if (parts.length < 3) return null;
  const action = parts[1] as ExecApprovalDecision;
  if (action !== "allow-once" && action !== "allow-always" && action !== "deny") {
    return null;
  }
  // Rejoin remaining parts in case approval ID contains colons
  const approvalId = parts.slice(2).join(":");
  return { approvalId, action };
}

// ----- Message Formatting -----

function formatCommandPreview(command: string, maxLen = 500): string {
  return command.length > maxLen ? `${command.slice(0, maxLen)}...` : command;
}

function formatExecApprovalMessage(request: ExecApprovalRequest, nowMs: number): string {
  const lines: string[] = ["🔒 *Exec Approval Required*"];
  lines.push(`*ID:* \`${request.id}\``);
  lines.push(`*Command:*\n\`\`\`\n${formatCommandPreview(request.request.command)}\n\`\`\``);
  if (request.request.cwd) lines.push(`*CWD:* ${request.request.cwd}`);
  if (request.request.host) lines.push(`*Host:* ${request.request.host}`);
  if (request.request.agentId) lines.push(`*Agent:* ${request.request.agentId}`);
  const expiresIn = Math.max(0, Math.round((request.expiresAtMs - nowMs) / 1000));
  lines.push(`_Expires in ${expiresIn}s_`);
  return lines.join("\n");
}

function decisionLabel(decision: ExecApprovalDecision): string {
  if (decision === "allow-once") return "Allowed (once)";
  if (decision === "allow-always") return "Allowed (always)";
  return "Denied";
}

function decisionEmoji(decision: ExecApprovalDecision): string {
  if (decision === "deny") return "❌";
  if (decision === "allow-always") return "🔐";
  return "✅";
}

function formatResolvedMessage(
  request: ExecApprovalRequest,
  decision: ExecApprovalDecision,
  resolvedBy?: string | null,
): string {
  const emoji = decisionEmoji(decision);
  const lines: string[] = [`${emoji} *Exec Approval: ${decisionLabel(decision)}*`];
  if (resolvedBy) lines.push(`_Resolved by ${resolvedBy}_`);
  lines.push(`*ID:* \`${request.id}\``);
  lines.push(`*Command:*\n\`\`\`\n${formatCommandPreview(request.request.command, 300)}\n\`\`\``);
  return lines.join("\n");
}

function formatExpiredMessage(request: ExecApprovalRequest): string {
  const lines: string[] = ["⏱️ *Exec Approval: Expired*"];
  lines.push(`*ID:* \`${request.id}\``);
  lines.push(`*Command:*\n\`\`\`\n${formatCommandPreview(request.request.command, 300)}\n\`\`\``);
  return lines.join("\n");
}

// ----- Inline Buttons -----

function buildApprovalButtons(
  approvalId: string,
): Array<Array<{ text: string; callback_data: string }>> {
  return [
    [
      {
        text: "✅ Allow once",
        callback_data: buildTelegramApprovalCallbackData(approvalId, "allow-once"),
      },
      {
        text: "🔐 Always allow",
        callback_data: buildTelegramApprovalCallbackData(approvalId, "allow-always"),
      },
      {
        text: "❌ Deny",
        callback_data: buildTelegramApprovalCallbackData(approvalId, "deny"),
      },
    ],
  ];
}

// ----- Handler Class -----

export class TelegramExecApprovalHandler {
  private gatewayClient: GatewayClient | null = null;
  private pending = new Map<string, PendingApproval>();
  private requestCache = new Map<string, ExecApprovalRequest>();
  private opts: TelegramExecApprovalHandlerOpts;
  private started = false;

  constructor(opts: TelegramExecApprovalHandlerOpts) {
    this.opts = opts;
  }

  shouldHandle(request: ExecApprovalRequest): boolean {
    const config = this.opts.config;
    if (!config.enabled) return false;
    if (!config.approvers || config.approvers.length === 0) return false;

    // Check agent filter
    if (config.agentFilter?.length) {
      if (!request.request.agentId) return false;
      if (!config.agentFilter.includes(request.request.agentId)) return false;
    }

    // Check session filter (substring match)
    if (config.sessionFilter?.length) {
      const session = request.request.sessionKey;
      if (!session) return false;
      const matches = config.sessionFilter.some((p) => {
        try {
          return session.includes(p) || new RegExp(p).test(session);
        } catch {
          return session.includes(p);
        }
      });
      if (!matches) return false;
    }

    return true;
  }

  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    const config = this.opts.config;
    if (!config.enabled) {
      logDebug("telegram exec approvals: disabled");
      return;
    }

    if (!config.approvers || config.approvers.length === 0) {
      logDebug("telegram exec approvals: no approvers configured");
      return;
    }

    logDebug("telegram exec approvals: starting handler");

    this.gatewayClient = new GatewayClient({
      url: this.opts.gatewayUrl ?? "ws://127.0.0.1:18789",
      clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
      clientDisplayName: "Telegram Exec Approvals",
      mode: GATEWAY_CLIENT_MODES.BACKEND,
      scopes: ["operator.approvals"],
      onEvent: (evt) => this.handleGatewayEvent(evt),
      onHelloOk: () => {
        logDebug("telegram exec approvals: connected to gateway");
      },
      onConnectError: (err) => {
        logError(`telegram exec approvals: connect error: ${err.message}`);
      },
      onClose: (code, reason) => {
        logDebug(`telegram exec approvals: gateway closed: ${code} ${reason}`);
      },
    });

    this.gatewayClient.start();
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.started = false;

    // Clear all pending timeouts
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId);
    }
    this.pending.clear();
    this.requestCache.clear();

    this.gatewayClient?.stop();
    this.gatewayClient = null;

    logDebug("telegram exec approvals: stopped");
  }

  private handleGatewayEvent(evt: EventFrame): void {
    if (evt.event === "exec.approval.requested") {
      const request = evt.payload as ExecApprovalRequest;
      void this.handleApprovalRequested(request);
    } else if (evt.event === "exec.approval.resolved") {
      const resolved = evt.payload as ExecApprovalResolved;
      void this.handleApprovalResolved(resolved);
    }
  }

  private async handleApprovalRequested(request: ExecApprovalRequest): Promise<void> {
    if (!this.shouldHandle(request)) return;

    logDebug(`telegram exec approvals: received request ${request.id}`);

    this.requestCache.set(request.id, request);

    const text = formatExecApprovalMessage(request, Date.now());
    const buttons = buildApprovalButtons(request.id);
    const approvers = this.opts.config.approvers ?? [];

    for (const approver of approvers) {
      const userId = String(approver);
      try {
        const result = await sendMessageTelegram(userId, text, {
          token: this.opts.token,
          accountId: this.opts.accountId,
          buttons,
          textMode: "markdown",
        });

        // Set up timeout
        const timeoutMs = Math.max(0, request.expiresAtMs - Date.now());
        const timeoutId = setTimeout(() => {
          void this.handleApprovalTimeout(request.id);
        }, timeoutMs);

        this.pending.set(request.id, {
          telegramMessageId: result.messageId,
          telegramChatId: result.chatId,
          timeoutId,
        });

        logDebug(`telegram exec approvals: sent approval ${request.id} to user ${userId}`);
      } catch (err) {
        logError(`telegram exec approvals: failed to notify user ${userId}: ${String(err)}`);
      }
    }
  }

  private async handleApprovalResolved(resolved: ExecApprovalResolved): Promise<void> {
    const pending = this.pending.get(resolved.id);
    if (!pending) return;

    clearTimeout(pending.timeoutId);
    this.pending.delete(resolved.id);

    const request = this.requestCache.get(resolved.id);
    this.requestCache.delete(resolved.id);

    if (!request) return;

    logDebug(`telegram exec approvals: resolved ${resolved.id} with ${resolved.decision}`);

    // Update the message with resolved status and remove buttons
    try {
      const newText = formatResolvedMessage(request, resolved.decision, resolved.resolvedBy);
      await editMessageTelegram(pending.telegramChatId, pending.telegramMessageId, newText, {
        token: this.opts.token,
        accountId: this.opts.accountId,
        buttons: [], // Remove buttons
        textMode: "markdown",
      });
    } catch (err) {
      logError(`telegram exec approvals: failed to update message: ${String(err)}`);
    }
  }

  private async handleApprovalTimeout(approvalId: string): Promise<void> {
    const pending = this.pending.get(approvalId);
    if (!pending) return;

    this.pending.delete(approvalId);

    const request = this.requestCache.get(approvalId);
    this.requestCache.delete(approvalId);

    if (!request) return;

    logDebug(`telegram exec approvals: timeout for ${approvalId}`);

    // Update the message with expired status and remove buttons
    try {
      const newText = formatExpiredMessage(request);
      await editMessageTelegram(pending.telegramChatId, pending.telegramMessageId, newText, {
        token: this.opts.token,
        accountId: this.opts.accountId,
        buttons: [], // Remove buttons
        textMode: "markdown",
      });
    } catch (err) {
      logError(`telegram exec approvals: failed to update expired message: ${String(err)}`);
    }
  }

  async resolveApproval(approvalId: string, decision: ExecApprovalDecision): Promise<boolean> {
    logDebug(`telegram exec approvals: resolving ${approvalId} with ${decision}`);

    try {
      await callGateway({
        method: "exec.approval.resolve",
        params: { id: approvalId, decision },
        clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
        clientDisplayName: "Telegram Exec Approvals",
        mode: GATEWAY_CLIENT_MODES.BACKEND,
      });
      logDebug(`telegram exec approvals: resolved ${approvalId} successfully`);
      return true;
    } catch (err) {
      logError(`telegram exec approvals: resolve failed: ${String(err)}`);
      return false;
    }
  }
}

/**
 * Resolve approval from a callback query handler.
 * Call this from bot-handlers.ts when a tg_approve callback is received.
 */
export async function handleTelegramApprovalCallback(params: {
  callbackData: string;
  senderId: string;
  accountId: string;
}): Promise<{ handled: boolean; decision?: ExecApprovalDecision; approvalId?: string }> {
  const parsed = parseTelegramApprovalCallbackData(params.callbackData);
  if (!parsed) return { handled: false };

  const resolvedBy = `telegram:${params.senderId}`;

  try {
    await callGateway({
      method: "exec.approval.resolve",
      params: { id: parsed.approvalId, decision: parsed.action },
      clientName: GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT,
      clientDisplayName: `Telegram approval (${resolvedBy})`,
      mode: GATEWAY_CLIENT_MODES.BACKEND,
    });
    return { handled: true, decision: parsed.action, approvalId: parsed.approvalId };
  } catch (err) {
    logError(`telegram exec approvals: callback resolve failed: ${String(err)}`);
    return { handled: false };
  }
}
