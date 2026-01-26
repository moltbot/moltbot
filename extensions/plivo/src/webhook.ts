/**
 * Plivo Webhook Handler
 * Handles inbound SMS/MMS messages and delivery reports
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { parse as parseUrl } from "node:url";
import * as Plivo from "plivo";
import type { PlivoResolvedAccount, PlivoInboundWebhook, QuickCommand } from "./types.js";

export type WebhookMessageHandler = (message: {
  from: string;
  to: string;
  text: string;
  messageId: string;
  isMedia: boolean;
  mediaUrls: string[];
  accountId: string;
}) => Promise<string | void>;

export type WebhookServerOptions = {
  account: PlivoResolvedAccount;
  accountId: string;
  path: string;
  port: number;
  host?: string;
  onMessage: WebhookMessageHandler;
  onError?: (error: Error) => void;
  log?: (message: string, data?: Record<string, unknown>) => void;
};

/**
 * Parse URL-encoded body from request
 */
async function parseBody(req: IncomingMessage): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const params = new URLSearchParams(body);
        const result: Record<string, string> = {};
        for (const [key, value] of params) {
          result[key] = value;
        }
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    req.on("error", reject);
  });
}

/**
 * Extract media URLs from webhook payload
 */
function extractMediaUrls(body: Record<string, string>): string[] {
  const urls: string[] = [];
  for (let i = 0; i < 10; i++) {
    const url = body[`MediaUrl${i}`];
    if (url) urls.push(url);
  }
  return urls;
}

/**
 * Process quick commands - expand shortcuts to full commands
 */
function processQuickCommand(
  text: string,
  commands: QuickCommand[],
  enabled: boolean
): string {
  if (!enabled || !commands.length) return text;

  const commandMap = new Map(commands.map((c) => [c.trigger.toLowerCase(), c]));
  const trimmedText = text.trim().toLowerCase();

  // Exact match
  const exactMatch = commandMap.get(trimmedText);
  if (exactMatch) return exactMatch.fullCommand;

  // Prefix match (e.g., "cal tomorrow" -> "show my calendar for tomorrow")
  const words = trimmedText.split(/\s+/);
  const prefixMatch = commandMap.get(words[0]);
  if (prefixMatch && words.length > 1) {
    return `${prefixMatch.fullCommand} ${words.slice(1).join(" ")}`;
  }

  return text;
}

/**
 * Validate Plivo webhook signature
 */
function validateSignature(
  req: IncomingMessage,
  body: Record<string, string>,
  secret: string | undefined
): boolean {
  if (!secret) return true; // Skip validation if no secret configured

  const signature = req.headers["x-plivo-signature-v3"] as string;
  const nonce = req.headers["x-plivo-signature-v3-nonce"] as string;

  if (!signature || !nonce) return false;

  const fullUrl = `http://${req.headers.host}${req.url}`;

  try {
    const isValid = Plivo.validateV3Signature(
      req.method || "POST",
      fullUrl,
      nonce,
      secret,
      signature,
      body
    );
    return Boolean(isValid);
  } catch {
    return false;
  }
}

/**
 * Create and start webhook server
 */
export async function startWebhookServer(
  options: WebhookServerOptions
): Promise<{ server: ReturnType<typeof createServer>; stop: () => Promise<void> }> {
  const {
    account,
    accountId,
    path,
    port,
    host = "0.0.0.0",
    onMessage,
    onError,
    log = console.log,
  } = options;

  const inboundPath = path;
  const statusPath = `${path}/status`;

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const parsedUrl = parseUrl(req.url || "", true);
    const urlPath = parsedUrl.pathname || "";

    // Health check
    if (urlPath === `${path}/health` && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "healthy", channel: "plivo", accountId }));
      return;
    }

    // Only handle POST requests
    if (req.method !== "POST") {
      res.writeHead(405);
      res.end("Method Not Allowed");
      return;
    }

    try {
      const body = await parseBody(req);

      // Validate signature in production
      if (account.webhookSecret && !validateSignature(req, body, account.webhookSecret)) {
        log("Invalid webhook signature", { path: urlPath });
        res.writeHead(401);
        res.end("Unauthorized");
        return;
      }

      // Inbound message
      if (urlPath === inboundPath) {
        const webhook: PlivoInboundWebhook = {
          From: body.From,
          To: body.To,
          Text: body.Text || "",
          MessageUUID: body.MessageUUID,
          Type: (body.Type as "sms" | "mms") || "sms",
        };

        const mediaUrls = extractMediaUrls(body);
        const isMedia = webhook.Type === "mms" || mediaUrls.length > 0;

        // Process quick commands
        const processedText = processQuickCommand(
          webhook.Text,
          account.quickCommands,
          account.enableQuickCommands
        );

        log("Received inbound message", {
          from: webhook.From,
          messageId: webhook.MessageUUID,
          isMedia,
        });

        // Call message handler
        const reply = await onMessage({
          from: webhook.From,
          to: webhook.To,
          text: processedText,
          messageId: webhook.MessageUUID,
          isMedia,
          mediaUrls,
          accountId,
        });

        // If handler returns a string, send as immediate reply via XML
        if (reply && typeof reply === "string") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const response = (Plivo as any).Response();
          response.addMessage(reply, {
            src: webhook.To,
            dst: webhook.From,
          });
          res.writeHead(200, { "Content-Type": "application/xml" });
          res.end(response.toXML());
          return;
        }

        res.writeHead(200);
        res.end("OK");
        return;
      }

      // Delivery status report
      if (urlPath === statusPath) {
        log("Received delivery report", {
          messageId: body.MessageUUID,
          status: body.Status,
        });
        res.writeHead(200);
        res.end("OK");
        return;
      }

      res.writeHead(404);
      res.end("Not Found");
    } catch (error) {
      log("Webhook error", { error: String(error) });
      onError?.(error as Error);
      res.writeHead(500);
      res.end("Internal Server Error");
    }
  });

  return new Promise((resolve, reject) => {
    server.on("error", reject);
    server.listen(port, host, () => {
      log(`Plivo webhook server started`, { port, path: inboundPath });
      resolve({
        server,
        stop: () =>
          new Promise<void>((res) => {
            server.close(() => res());
          }),
      });
    });
  });
}

/**
 * Auto-configure Plivo phone number webhooks
 */
export async function autoConfigureWebhooks(
  client: Plivo.Client,
  phoneNumber: string,
  webhookUrl: string,
  log?: (message: string, data?: Record<string, unknown>) => void
): Promise<{ success: boolean; error?: string }> {
  const normalizedNumber = phoneNumber.replace(/^\+/, "");
  const logger = log || console.log;

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.numbers as any).update(normalizedNumber, {
      message_url: webhookUrl,
      message_method: "POST",
    });

    logger("Auto-configured Plivo webhooks", { phoneNumber, webhookUrl });
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger("Failed to auto-configure webhooks", { error: errorMessage });
    return { success: false, error: errorMessage };
  }
}
