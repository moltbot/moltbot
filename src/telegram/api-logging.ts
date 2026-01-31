import { danger } from "../globals.js";
import { formatErrorMessage } from "../infra/errors.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import type { RuntimeEnv } from "../runtime.js";

export type TelegramApiLogger = (message: string) => void;

type TelegramApiLoggingParams<T> = {
  operation: string;
  fn: () => Promise<T>;
  runtime?: RuntimeEnv;
  logger?: TelegramApiLogger;
  shouldLog?: (err: unknown) => boolean;
};

const fallbackLogger = createSubsystemLogger("telegram/api");

function resolveTelegramApiLogger(runtime?: RuntimeEnv, logger?: TelegramApiLogger) {
  if (logger) {
    return logger;
  }
  if (runtime?.error) {
    return runtime.error;
  }
  return (message: string) => fallbackLogger.error(message);
}

function isNetworkError(err: unknown): boolean {
  const errStr = String(err).toLowerCase();
  return (
    errStr.includes("network request") ||
    errStr.includes("fetch failed") ||
    errStr.includes("econnrefused") ||
    errStr.includes("enotfound") ||
    errStr.includes("etimedout") ||
    errStr.includes("econnreset")
  );
}

function buildErrorMessage(operation: string, err: unknown): string {
  const errText = formatErrorMessage(err);
  let message = `telegram ${operation} failed: ${errText}`;

  // Add helpful hints for network errors
  if (isNetworkError(err)) {
    message +=
      "\nTroubleshooting network errors:\n" +
      "  1. Check internet connectivity to api.telegram.org\n" +
      "  2. If using Node 22-23, try: clawdbot config set channels.telegram.network.autoSelectFamily true\n" +
      "  3. Check for proxy/firewall blocking Telegram API\n" +
      "  4. Verify no local DNS resolution issues";
  }

  return message;
}

export async function withTelegramApiErrorLogging<T>({
  operation,
  fn,
  runtime,
  logger,
  shouldLog,
}: TelegramApiLoggingParams<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!shouldLog || shouldLog(err)) {
      const message = buildErrorMessage(operation, err);
      const log = resolveTelegramApiLogger(runtime, logger);
      log(danger(message));
    }
    throw err;
  }
}
