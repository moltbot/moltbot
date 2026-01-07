import { run, type RunnerHandle } from "@grammyjs/runner";
import { loadConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { createTelegramBot } from "./bot.js";
import { makeProxyFetch } from "./proxy.js";
import { resolveTelegramToken } from "./token.js";
import { startTelegramWebhook } from "./webhook.js";

export type MonitorTelegramOpts = {
  token?: string;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  useWebhook?: boolean;
  webhookPath?: string;
  webhookPort?: number;
  webhookSecret?: string;
  proxyFetch?: typeof fetch;
  webhookUrl?: string;
};

export async function monitorTelegramProvider(opts: MonitorTelegramOpts = {}) {
  const { token } = resolveTelegramToken(loadConfig(), {
    envToken: opts.token,
  });
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN or telegram.botToken/tokenFile is required for Telegram gateway",
    );
  }

  const proxyFetch =
    opts.proxyFetch ??
    (loadConfig().telegram?.proxy
      ? makeProxyFetch(loadConfig().telegram?.proxy as string)
      : undefined);

  const bot = createTelegramBot({
    token,
    runtime: opts.runtime,
    proxyFetch,
  });

  if (opts.useWebhook) {
    await startTelegramWebhook({
      token,
      path: opts.webhookPath,
      port: opts.webhookPort,
      secret: opts.webhookSecret,
      runtime: opts.runtime as RuntimeEnv,
      fetch: proxyFetch,
      abortSignal: opts.abortSignal,
      publicUrl: opts.webhookUrl,
    });
    return;
  }

  // Long polling with concurrent update processing
  // Using @grammyjs/runner to process updates concurrently instead of sequentially.
  // Without this, grammy's default bot.start() processes updates one at a time,
  // meaning a slow handler (e.g., a 10-minute agent timeout) blocks ALL other
  // messages from being processed until it completes.
  const runner: RunnerHandle = run(bot);

  const stopOnAbort = () => {
    if (opts.abortSignal?.aborted) {
      runner.stop();
    }
  };

  if (opts.abortSignal?.aborted) {
    runner.stop();
    return;
  }

  opts.abortSignal?.addEventListener("abort", stopOnAbort, { once: true });
  try {
    // Wait for the runner to complete (only happens when stopped)
    await runner.task();
  } finally {
    opts.abortSignal?.removeEventListener("abort", stopOnAbort);
  }
}
