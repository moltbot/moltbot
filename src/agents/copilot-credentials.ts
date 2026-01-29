/**
 * Credential management for the GitHub Copilot CLI.
 *
 * This module provides functions to check the authentication status of the Copilot CLI
 * and cache the results for efficient repeated access.
 */
import { execSync } from "node:child_process";

import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("agents/copilot-credentials");

/**
 * Cached authentication status from the Copilot CLI.
 */
export type CopilotCredential = {
  /** Whether the CLI is authenticated with a valid GitHub account. */
  authenticated: boolean;
  /** GitHub login username (if authenticated). */
  login?: string;
  /** GitHub avatar URL (if authenticated). */
  avatarUrl?: string;
};

type CachedValue<T> = {
  value: T | null;
  readAt: number;
  cacheKey: string;
};

let copilotCliCache: CachedValue<CopilotCredential> | null = null;

/** Reset the cache for testing purposes. */
export function resetCopilotCredentialCacheForTest(): void {
  copilotCliCache = null;
}

type ExecSyncFn = typeof execSync;

/**
 * Check if the Copilot CLI is installed and available on PATH.
 */
export function isCopilotCliInstalled(options?: {
  cliPath?: string;
  execSync?: ExecSyncFn;
}): boolean {
  const execSyncImpl = options?.execSync ?? execSync;
  const cliPath = options?.cliPath ?? "copilot";

  try {
    execSyncImpl(`${cliPath} --version`, {
      encoding: "utf8",
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the authentication status from the Copilot CLI.
 *
 * Requires the `copilot` CLI to be installed. If the CLI is not installed
 * or authentication status cannot be determined, returns null.
 */
export function readCopilotAuthStatus(options?: {
  cliPath?: string;
  execSync?: ExecSyncFn;
}): CopilotCredential | null {
  const execSyncImpl = options?.execSync ?? execSync;
  const cliPath = options?.cliPath ?? "copilot";

  try {
    // The Copilot CLI has a `copilot auth status --json` command that returns auth info.
    const result = execSyncImpl(`${cliPath} auth status --json`, {
      encoding: "utf8",
      timeout: 10000,
      stdio: ["pipe", "pipe", "pipe"],
    });

    const data = JSON.parse(result.trim()) as Record<string, unknown>;

    // The CLI returns { isAuthenticated: boolean, user?: { login, avatarUrl } }
    const isAuthenticated = data.isAuthenticated === true;
    const user = data.user as Record<string, unknown> | undefined;

    if (!isAuthenticated) {
      log.info("copilot cli is not authenticated");
      return { authenticated: false };
    }

    const login = typeof user?.login === "string" ? user.login : undefined;
    const avatarUrl = typeof user?.avatarUrl === "string" ? user.avatarUrl : undefined;

    log.info("read copilot auth status from cli", {
      authenticated: true,
      login,
    });

    return {
      authenticated: true,
      login,
      avatarUrl,
    };
  } catch (error) {
    // Check if it's a "not installed" error vs an auth error
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("ENOENT") || message.includes("not found")) {
      log.debug("copilot cli not found");
      return null;
    }

    // Parse error response - CLI may return JSON even on error
    try {
      const stderr =
        error instanceof Error && "stderr" in error
          ? String((error as { stderr: unknown }).stderr)
          : "";
      if (stderr.includes("not logged in") || stderr.includes("not authenticated")) {
        return { authenticated: false };
      }
    } catch {
      // Ignore parse errors
    }

    log.warn("failed to read copilot auth status", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Read the Copilot CLI authentication status with caching.
 *
 * @param options.ttlMs - How long to cache the result in milliseconds (default: no caching)
 */
export function readCopilotAuthStatusCached(options?: {
  cliPath?: string;
  ttlMs?: number;
  execSync?: ExecSyncFn;
}): CopilotCredential | null {
  const ttlMs = options?.ttlMs ?? 0;
  const now = Date.now();
  const cacheKey = options?.cliPath ?? "copilot";

  if (
    ttlMs > 0 &&
    copilotCliCache &&
    copilotCliCache.cacheKey === cacheKey &&
    now - copilotCliCache.readAt < ttlMs
  ) {
    return copilotCliCache.value;
  }

  const value = readCopilotAuthStatus({
    cliPath: options?.cliPath,
    execSync: options?.execSync,
  });

  if (ttlMs > 0) {
    copilotCliCache = { value, readAt: now, cacheKey };
  }

  return value;
}
