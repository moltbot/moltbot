/**
 * Plivo Gateway Adapter
 * Handles channel startup, shutdown, and webhook configuration
 */

import * as Plivo from "plivo";
import { setAccountState, removeAccountState } from "./runtime.js";
import { startWebhookServer, autoConfigureWebhooks } from "./webhook.js";
import type { PlivoResolvedAccount, PlivoRuntimeState } from "./types.js";

export type GatewayContext = {
  cfg: { channels?: Record<string, unknown> };
  accountId: string;
  account: PlivoResolvedAccount;
  runtime: unknown;
  abortSignal?: AbortSignal;
  log: (message: string, data?: Record<string, unknown>) => void;
  getStatus: () => unknown;
  setStatus: (status: Partial<{
    running: boolean;
    connected: boolean;
    lastConnectedAt: number;
    lastError: string;
    webhookUrl: string;
  }>) => void;
  onInboundMessage?: (message: {
    from: string;
    text: string;
    accountId: string;
    channelId: string;
  }) => Promise<string | void>;
};

/**
 * Start Plivo account - initialize client and webhook server
 */
export async function startAccount(ctx: GatewayContext): Promise<void> {
  const { account, accountId, log, setStatus } = ctx;

  log("Starting Plivo account", { accountId, phoneNumber: account.phoneNumber });

  // Create Plivo client
  const client = new Plivo.Client(account.authId, account.authToken);

  // Verify credentials
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (client.accounts as any).get();
    log("Plivo credentials verified", { accountId });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    log("Failed to verify Plivo credentials", { error: errorMessage });
    setStatus({ running: false, lastError: errorMessage });
    throw new Error(`Invalid Plivo credentials: ${errorMessage}`);
  }

  // Determine webhook URL
  const webhookPort = parseInt(process.env.PLIVO_WEBHOOK_PORT || "8787", 10);
  const webhookHost = process.env.PLIVO_WEBHOOK_HOST || "0.0.0.0";
  const publicUrl = account.webhookUrl || process.env.PUBLIC_URL || `http://localhost:${webhookPort}`;
  const fullWebhookUrl = `${publicUrl}${account.webhookPath}`;

  // Start webhook server
  const { server, stop } = await startWebhookServer({
    account,
    accountId,
    path: account.webhookPath,
    port: webhookPort,
    host: webhookHost,
    onMessage: async (message) => {
      // Route to Clawdbot's message handler
      if (ctx.onInboundMessage) {
        return ctx.onInboundMessage({
          from: message.from,
          text: message.text,
          accountId,
          channelId: "plivo",
        });
      }
      return undefined;
    },
    onError: (error) => {
      log("Webhook error", { error: error.message });
      setStatus({ lastError: error.message });
    },
    log,
  });

  // Auto-configure Plivo phone number to point to our webhook
  const configResult = await autoConfigureWebhooks(
    client,
    account.phoneNumber,
    fullWebhookUrl,
    log
  );

  if (!configResult.success) {
    log("Webhook auto-configuration failed, manual setup may be required", {
      error: configResult.error,
      manualUrl: fullWebhookUrl,
    });
  }

  // Store runtime state
  const state: PlivoRuntimeState = {
    client,
    server,
    phoneNumber: account.phoneNumber,
    webhookConfigured: configResult.success,
  };
  setAccountState(accountId, state);

  // Update channel status
  setStatus({
    running: true,
    connected: true,
    lastConnectedAt: Date.now(),
    webhookUrl: fullWebhookUrl,
  });

  log("Plivo account started successfully", {
    accountId,
    phoneNumber: account.phoneNumber,
    webhookUrl: fullWebhookUrl,
    webhookConfigured: configResult.success,
  });

  // Handle abort signal
  if (ctx.abortSignal) {
    ctx.abortSignal.addEventListener("abort", async () => {
      await stop();
      removeAccountState(accountId);
      setStatus({ running: false, connected: false });
      log("Plivo account stopped via abort signal", { accountId });
    });
  }
}

/**
 * Stop Plivo account
 */
export async function stopAccount(ctx: GatewayContext): Promise<void> {
  const { accountId, log, setStatus } = ctx;

  log("Stopping Plivo account", { accountId });

  // Clean up runtime state
  removeAccountState(accountId);

  setStatus({ running: false, connected: false });

  log("Plivo account stopped", { accountId });
}

/**
 * Gateway adapter for Clawdbot channel plugin
 */
export const gatewayAdapter = {
  startAccount,
  stopAccount,
};
