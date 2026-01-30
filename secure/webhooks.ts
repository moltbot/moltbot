/**
 * AssureBot - Webhook Receiver
 *
 * Authenticated webhook endpoint for external integrations.
 * Receives events from GitHub, Stripe, uptime monitors, etc.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { SecureConfig } from "./config.js";
import type { AuditLogger } from "./audit.js";
import type { AgentCore } from "./agent.js";
import type { Bot } from "grammy";
import { sendToUser } from "./telegram.js";

export type WebhookHandler = {
  handleRequest: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
};

export type WebhookDeps = {
  config: SecureConfig;
  audit: AuditLogger;
  agent: AgentCore;
  telegramBot: Bot;
};

/**
 * Timing-safe token comparison
 */
function verifyToken(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  if (provided.length !== expected.length) return false;

  try {
    return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Extract token from request
 */
function extractToken(req: IncomingMessage, url: URL): { token: string; fromQuery: boolean } {
  // Check Authorization header (preferred)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    return { token: authHeader.slice(7), fromQuery: false };
  }

  // Check X-AssureBot-Token header
  const tokenHeader = req.headers["x-assurebot-token"];
  if (typeof tokenHeader === "string") {
    return { token: tokenHeader, fromQuery: false };
  }

  // Check query parameter (deprecated, less secure)
  const queryToken = url.searchParams.get("token");
  if (queryToken) {
    return { token: queryToken, fromQuery: true };
  }

  return { token: "", fromQuery: false };
}

/**
 * Read JSON body from request
 */
async function readJsonBody(
  req: IncomingMessage,
  maxBytes = 1024 * 1024 // 1MB default
): Promise<{ ok: true; value: unknown } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        resolve({ ok: false, error: "payload too large" });
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        if (!body.trim()) {
          resolve({ ok: true, value: {} });
          return;
        }
        const parsed = JSON.parse(body);
        resolve({ ok: true, value: parsed });
      } catch {
        resolve({ ok: false, error: "invalid JSON" });
      }
    });

    req.on("error", () => {
      resolve({ ok: false, error: "read error" });
    });
  });
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

/**
 * Summarize webhook payload using AI
 */
async function summarizeWebhook(
  agent: AgentCore,
  source: string,
  payload: unknown
): Promise<string> {
  const payloadStr = JSON.stringify(payload, null, 2).slice(0, 4000);

  try {
    const response = await agent.chat([
      {
        role: "user",
        content: `Summarize this webhook notification from "${source}" in 2-3 concise sentences. Focus on what happened and any action needed:\n\n${payloadStr}`,
      },
    ]);
    return response.text;
  } catch {
    return `Received webhook from ${source}. (Unable to summarize)`;
  }
}

export function createWebhookHandler(deps: WebhookDeps): WebhookHandler {
  const { config, audit, agent, telegramBot } = deps;
  const { basePath, secret, enabled } = config.webhooks;

  return {
    async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      if (!enabled) return false;

      const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

      // Check if this is a webhook path
      if (!url.pathname.startsWith(basePath)) {
        return false;
      }

      const startTime = Date.now();
      const subPath = url.pathname.slice(basePath.length).replace(/^\//, "") || "default";

      // Verify authentication
      const { token, fromQuery } = extractToken(req, url);

      if (!verifyToken(token, secret)) {
        audit.webhookBlocked({
          path: url.pathname,
          reason: "Invalid or missing token",
        });
        sendJson(res, 401, { ok: false, error: "Unauthorized" });
        return true;
      }

      if (fromQuery) {
        console.warn(
          "[webhooks] Token provided via query parameter is insecure. Use Authorization header instead."
        );
      }

      // Only accept POST
      if (req.method !== "POST") {
        res.statusCode = 405;
        res.setHeader("Allow", "POST");
        res.end("Method Not Allowed");
        return true;
      }

      // Read body
      const body = await readJsonBody(req);
      if (!body.ok) {
        sendJson(res, body.error === "payload too large" ? 413 : 400, {
          ok: false,
          error: body.error,
        });
        return true;
      }

      // Process webhook
      try {
        // Summarize with AI
        const summary = await summarizeWebhook(agent, subPath, body.value);

        // Notify all allowed users
        const notificationText = `**Webhook: ${subPath}**\n\n${summary}`;

        for (const userId of config.telegram.allowedUsers) {
          await sendToUser(telegramBot, userId, notificationText);
        }

        audit.webhook({
          path: url.pathname,
          status: 200,
          durationMs: Date.now() - startTime,
        });

        sendJson(res, 200, { ok: true, processed: true });
      } catch (err) {
        audit.error({
          error: `Webhook processing failed: ${err instanceof Error ? err.message : String(err)}`,
          metadata: { path: url.pathname },
        });

        sendJson(res, 500, { ok: false, error: "Processing failed" });
      }

      return true;
    },
  };
}

/**
 * Built-in webhook handlers for common services
 */
export const webhookParsers = {
  /**
   * Parse GitHub webhook
   */
  github(payload: unknown): string {
    const p = payload as Record<string, unknown>;
    const action = p.action as string | undefined;
    const repo = (p.repository as Record<string, unknown>)?.full_name as string | undefined;

    if (p.pull_request) {
      const pr = p.pull_request as Record<string, unknown>;
      return `GitHub PR ${action}: ${pr.title} in ${repo}`;
    }

    if (p.issue) {
      const issue = p.issue as Record<string, unknown>;
      return `GitHub Issue ${action}: ${issue.title} in ${repo}`;
    }

    if (p.pusher) {
      const commits = p.commits as unknown[] | undefined;
      return `GitHub Push: ${commits?.length || 0} commits to ${repo}`;
    }

    return `GitHub event in ${repo || "unknown"}`;
  },

  /**
   * Parse Stripe webhook
   */
  stripe(payload: unknown): string {
    const p = payload as Record<string, unknown>;
    const type = p.type as string | undefined;
    const data = p.data as Record<string, unknown> | undefined;
    const object = data?.object as Record<string, unknown> | undefined;

    if (type?.startsWith("payment_intent.")) {
      const amount = object?.amount as number | undefined;
      const currency = object?.currency as string | undefined;
      return `Stripe ${type}: ${amount ? (amount / 100).toFixed(2) : "?"} ${currency?.toUpperCase() || ""}`;
    }

    if (type?.startsWith("customer.")) {
      return `Stripe ${type}`;
    }

    return `Stripe event: ${type || "unknown"}`;
  },

  /**
   * Parse generic uptime monitor webhook
   */
  uptime(payload: unknown): string {
    const p = payload as Record<string, unknown>;
    const status = p.status || p.state || p.alert_type;
    const url = p.url || p.monitor_url || p.target;
    return `Uptime alert: ${status} for ${url || "unknown"}`;
  },
};
