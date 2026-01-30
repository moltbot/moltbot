/**
 * AssureBot - Audit Logger
 *
 * Every interaction is logged for transparency and debugging.
 * Logs are append-only JSONL format.
 */

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type AuditEventType =
  | "startup"
  | "shutdown"
  | "message"
  | "message_blocked"
  | "webhook"
  | "webhook_blocked"
  | "sandbox"
  | "cron"
  | "error";

export type AuditEvent = {
  ts: string;
  type: AuditEventType;
  userId?: number;
  username?: string;
  text?: string;
  response?: string;
  path?: string;
  status?: number;
  command?: string;
  exitCode?: number;
  jobId?: string;
  jobName?: string;
  error?: string;
  durationMs?: number;
  metadata?: Record<string, unknown>;
};

export type AuditLogger = {
  log: (event: Omit<AuditEvent, "ts">) => void;
  startup: () => void;
  shutdown: () => void;
  message: (params: {
    userId: number;
    username?: string;
    text: string;
    response?: string;
    durationMs?: number;
  }) => void;
  messageBlocked: (params: {
    userId: number;
    username?: string;
    reason: string;
  }) => void;
  webhook: (params: {
    path: string;
    status: number;
    durationMs?: number;
  }) => void;
  webhookBlocked: (params: {
    path: string;
    reason: string;
  }) => void;
  sandbox: (params: {
    command: string;
    exitCode: number;
    durationMs?: number;
  }) => void;
  cron: (params: {
    jobId: string;
    jobName: string;
    status: "ok" | "error" | "skipped";
    error?: string;
    durationMs?: number;
  }) => void;
  error: (params: {
    error: string;
    metadata?: Record<string, unknown>;
  }) => void;
};

/**
 * Redact sensitive patterns from text
 */
function redact(text: string): string {
  // Redact common secret patterns
  return text
    // API keys
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "[REDACTED_API_KEY]")
    .replace(/sk-ant-[a-zA-Z0-9-]{20,}/g, "[REDACTED_ANTHROPIC_KEY]")
    // Tokens
    .replace(/\b[0-9]{8,10}:[A-Za-z0-9_-]{35}\b/g, "[REDACTED_TG_TOKEN]")
    // Bearer tokens
    .replace(/Bearer\s+[A-Za-z0-9._-]{20,}/gi, "Bearer [REDACTED]")
    // Passwords in URLs
    .replace(/:\/\/[^:]+:[^@]+@/g, "://[REDACTED]@")
    // Generic secrets
    .replace(/(['"]?(?:password|secret|token|key|apikey|api_key)['"]?\s*[=:]\s*)['"][^'"]+['"]/gi, "$1[REDACTED]");
}

export function createAuditLogger(opts: {
  enabled: boolean;
  logPath: string;
}): AuditLogger {
  const { enabled, logPath } = opts;

  // Ensure log directory exists
  if (enabled) {
    try {
      mkdirSync(dirname(logPath), { recursive: true });
    } catch {
      // Directory may already exist
    }
  }

  function write(event: AuditEvent): void {
    if (!enabled) return;

    // Redact sensitive data
    const redacted: AuditEvent = {
      ...event,
      text: event.text ? redact(event.text) : undefined,
      response: event.response ? redact(event.response) : undefined,
      command: event.command ? redact(event.command) : undefined,
      error: event.error ? redact(event.error) : undefined,
    };

    try {
      const line = JSON.stringify(redacted) + "\n";
      appendFileSync(logPath, line, { encoding: "utf-8" });
    } catch (err) {
      // Log to stderr as fallback
      console.error("[audit] Failed to write audit log:", err);
      console.error("[audit]", JSON.stringify(redacted));
    }
  }

  const logger: AuditLogger = {
    log: (event) => {
      write({ ...event, ts: new Date().toISOString() });
    },

    startup: () => {
      write({
        ts: new Date().toISOString(),
        type: "startup",
        metadata: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
        },
      });
    },

    shutdown: () => {
      write({
        ts: new Date().toISOString(),
        type: "shutdown",
      });
    },

    message: (params) => {
      write({
        ts: new Date().toISOString(),
        type: "message",
        userId: params.userId,
        username: params.username,
        text: params.text,
        response: params.response,
        durationMs: params.durationMs,
      });
    },

    messageBlocked: (params) => {
      write({
        ts: new Date().toISOString(),
        type: "message_blocked",
        userId: params.userId,
        username: params.username,
        error: params.reason,
      });
    },

    webhook: (params) => {
      write({
        ts: new Date().toISOString(),
        type: "webhook",
        path: params.path,
        status: params.status,
        durationMs: params.durationMs,
      });
    },

    webhookBlocked: (params) => {
      write({
        ts: new Date().toISOString(),
        type: "webhook_blocked",
        path: params.path,
        error: params.reason,
      });
    },

    sandbox: (params) => {
      write({
        ts: new Date().toISOString(),
        type: "sandbox",
        command: params.command,
        exitCode: params.exitCode,
        durationMs: params.durationMs,
      });
    },

    cron: (params) => {
      write({
        ts: new Date().toISOString(),
        type: "cron",
        jobId: params.jobId,
        jobName: params.jobName,
        status: params.status === "ok" ? 200 : params.status === "skipped" ? 204 : 500,
        error: params.error,
        durationMs: params.durationMs,
      });
    },

    error: (params) => {
      write({
        ts: new Date().toISOString(),
        type: "error",
        error: params.error,
        metadata: params.metadata,
      });
    },
  };

  return logger;
}

/**
 * Console logger for development/debugging
 */
export function createConsoleAuditLogger(): AuditLogger {
  const log = (event: Omit<AuditEvent, "ts">) => {
    const ts = new Date().toISOString();
    console.log(`[audit] ${ts} ${event.type}`, JSON.stringify(event, null, 2));
  };

  return {
    log,
    startup: () => log({ type: "startup" }),
    shutdown: () => log({ type: "shutdown" }),
    message: (p) => log({ type: "message", ...p }),
    messageBlocked: (p) => log({ type: "message_blocked", userId: p.userId, username: p.username, error: p.reason }),
    webhook: (p) => log({ type: "webhook", ...p }),
    webhookBlocked: (p) => log({ type: "webhook_blocked", path: p.path, error: p.reason }),
    sandbox: (p) => log({ type: "sandbox", ...p }),
    cron: (p) => log({ type: "cron", jobId: p.jobId, jobName: p.jobName, status: p.status === "ok" ? 200 : 500, error: p.error, durationMs: p.durationMs }),
    error: (p) => log({ type: "error", ...p }),
  };
}
