import { loadConfig } from "../config/config.js";
import type { RuntimeEnv } from "../runtime.js";
import { createTelegramBot } from "./bot.js";
import type { LivenessProbeOptions } from "./liveness-probe.js";
import { makeProxyFetch } from "./proxy.js";
import { startTelegramWebhook } from "./webhook.js";

export type MonitorTelegramOpts = {
  token?: string;
  runtime?: RuntimeEnv;
  abortSignal?: AbortSignal;
  useWebhook?: boolean;
  webhookPath?: string;
  webhookPort?: number;
  webhookSecret?: string;
  proxyFetch?: typeof fetch | null;
  webhookUrl?: string;
  livenessProbe?: boolean | Omit<LivenessProbeOptions, "bot">;
};

export async function monitorTelegramProvider(opts: MonitorTelegramOpts = {}) {
  const token = (opts.token ?? process.env.TELEGRAM_BOT_TOKEN)?.trim();
  if (!token) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN or telegram.botToken is required for Telegram gateway",
    );
  }

  const cfg = loadConfig();
  const proxyFetch =
    opts.proxyFetch === null
      ? undefined
      : opts.proxyFetch ??
        (cfg.telegram?.proxy
          ? makeProxyFetch(cfg.telegram?.proxy as string)
          : undefined);

  const parseNumber = (value?: string) => {
    if (!value) return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  };
  const livenessFromEnv: Omit<LivenessProbeOptions, "bot"> = {};
  const envInterval = parseNumber(process.env.TELEGRAM_LIVENESS_INTERVAL);
  const envTimeout = parseNumber(process.env.TELEGRAM_LIVENESS_TIMEOUT);
  const envMaxFailures = parseNumber(process.env.TELEGRAM_LIVENESS_MAX_FAILURES);
  if (envInterval) livenessFromEnv.intervalMs = envInterval;
  if (envTimeout) livenessFromEnv.timeoutMs = envTimeout;
  if (envMaxFailures) {
    livenessFromEnv.maxConsecutiveFailures = envMaxFailures;
  }
  const livenessEnabled =
    typeof opts.livenessProbe === "boolean"
      ? opts.livenessProbe
      : !opts.useWebhook;
  const livenessOptions =
    typeof opts.livenessProbe === "object"
      ? opts.livenessProbe
      : livenessFromEnv;
  const livenessProbe =
    livenessEnabled && Object.keys(livenessOptions).length
      ? livenessOptions
      : livenessEnabled;

  const bot = createTelegramBot({
    token,
    runtime: opts.runtime,
    proxyFetch,
    livenessProbe,
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

  // Long polling
  const stopOnAbort = () => {
    if (opts.abortSignal?.aborted) void bot.stop();
  };
  opts.abortSignal?.addEventListener("abort", stopOnAbort, { once: true });
  try {
    await bot.start();
  } finally {
    opts.abortSignal?.removeEventListener("abort", stopOnAbort);
  }
}
