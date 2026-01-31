/**
 * TTL-based cleanup for hook sessions.
 * Runs periodically to delete stale hook sessions older than the configured TTL.
 */

import type { MoltbotConfig } from "../config/config.js";
import { loadCombinedSessionStoreForGateway, listSessionsFromStore } from "./session-utils.js";
import { callGateway } from "./call.js";
import type { createSubsystemLogger } from "../logging/subsystem.js";

type SubsystemLogger = ReturnType<typeof createSubsystemLogger>;

const DEFAULT_HOOK_SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const HOOK_SESSION_PREFIX = "hook:";

export type HookSessionCleanupResult = {
  checked: number;
  deleted: number;
  errors: number;
};

/**
 * Clean up stale hook sessions older than TTL.
 * Returns counts of checked/deleted/errored sessions.
 */
export async function cleanupStaleHookSessions(params: {
  cfg: MoltbotConfig;
  log?: SubsystemLogger;
}): Promise<HookSessionCleanupResult> {
  const { cfg, log } = params;

  // Get TTL from config (0 = disabled)
  const ttlMs = cfg.hooks?.sessionTtlMs ?? DEFAULT_HOOK_SESSION_TTL_MS;
  if (ttlMs <= 0) {
    return { checked: 0, deleted: 0, errors: 0 };
  }

  const cutoffMs = Date.now() - ttlMs;

  // List all sessions
  const { storePath, store } = loadCombinedSessionStoreForGateway(cfg);
  const allSessions = listSessionsFromStore({
    cfg,
    storePath,
    store,
    opts: { limit: 10000 }, // High limit to get all sessions
  });

  // Filter to hook sessions that are stale
  const staleSessions = allSessions.sessions.filter((session) => {
    // Check if it's a hook session (key starts with "hook:")
    if (!session.key.startsWith(HOOK_SESSION_PREFIX)) return false;
    // Check if it's older than TTL
    const lastActivity = session.updatedAt ?? 0;
    return lastActivity < cutoffMs;
  });

  let deleted = 0;
  let errors = 0;

  for (const session of staleSessions) {
    try {
      await callGateway({
        method: "sessions.delete",
        params: { key: session.key, deleteTranscript: true },
        timeoutMs: 10_000,
      });
      deleted++;
      log?.debug?.(`cleaned up stale hook session: ${session.key}`);
    } catch (err) {
      errors++;
      log?.warn?.(`failed to cleanup hook session ${session.key}: ${String(err)}`);
    }
  }

  if (deleted > 0 || errors > 0) {
    log?.info?.(
      `hook session cleanup: checked=${staleSessions.length} deleted=${deleted} errors=${errors}`,
    );
  }

  return { checked: staleSessions.length, deleted, errors };
}
