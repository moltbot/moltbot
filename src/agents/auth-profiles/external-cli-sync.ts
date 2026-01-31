import {
  readClaudeCliCredentialsCached,
  readQwenCliCredentialsCached,
} from "../cli-credentials.js";
import {
  CLAUDE_CLI_PROFILE_ID,
  EXTERNAL_CLI_NEAR_EXPIRY_MS,
  EXTERNAL_CLI_SYNC_TTL_MS,
  QWEN_CLI_PROFILE_ID,
  log,
} from "./constants.js";
import type { AuthProfileCredential, AuthProfileStore, OAuthCredential } from "./types.js";

function shallowEqualOAuthCredentials(a: OAuthCredential | undefined, b: OAuthCredential): boolean {
  if (!a) return false;
  if (a.type !== "oauth") return false;
  return (
    a.provider === b.provider &&
    a.access === b.access &&
    a.refresh === b.refresh &&
    a.expires === b.expires &&
    a.email === b.email &&
    a.enterpriseUrl === b.enterpriseUrl &&
    a.projectId === b.projectId &&
    a.accountId === b.accountId
  );
}

function isExternalProfileFresh(
  cred: AuthProfileCredential | undefined,
  now: number,
  provider: string,
): boolean {
  if (!cred) return false;
  if (cred.type !== "oauth" && cred.type !== "token") return false;
  if (cred.provider !== provider) return false;
  if (typeof cred.expires !== "number") return true;
  return cred.expires > now + EXTERNAL_CLI_NEAR_EXPIRY_MS;
}

/**
 * Sync OAuth credentials from external CLI tools (Claude CLI, Qwen Code CLI) into the store.
 *
 * Returns true if any credentials were updated.
 */
export function syncExternalCliCredentials(store: AuthProfileStore): boolean {
  let mutated = false;
  const now = Date.now();

  // Sync from Claude CLI (~/.claude/.credentials.json)
  const existingClaude = store.profiles[CLAUDE_CLI_PROFILE_ID];
  const shouldSyncClaude =
    !existingClaude ||
    existingClaude.provider !== "anthropic" ||
    !isExternalProfileFresh(existingClaude, now, "anthropic");
  const claudeCreds = shouldSyncClaude
    ? readClaudeCliCredentialsCached({ ttlMs: EXTERNAL_CLI_SYNC_TTL_MS })
    : null;
  if (claudeCreds) {
    const existing = store.profiles[CLAUDE_CLI_PROFILE_ID];
    const existingTyped =
      existing?.type === "oauth" || existing?.type === "token" ? existing : undefined;
    const shouldUpdate =
      !existingTyped ||
      existingTyped.provider !== "anthropic" ||
      (typeof existingTyped.expires === "number" && existingTyped.expires <= now) ||
      (typeof claudeCreds.expires === "number" &&
        typeof existingTyped.expires === "number" &&
        claudeCreds.expires > existingTyped.expires);

    if (shouldUpdate) {
      const isSame =
        claudeCreds.type === "oauth" &&
        existingTyped?.type === "oauth" &&
        shallowEqualOAuthCredentials(existingTyped, claudeCreds);
      if (!isSame) {
        store.profiles[CLAUDE_CLI_PROFILE_ID] = claudeCreds;
        mutated = true;
        log.info("synced claude credentials from claude cli", {
          profileId: CLAUDE_CLI_PROFILE_ID,
          type: claudeCreds.type,
          expires: new Date(claudeCreds.expires).toISOString(),
        });
      }
    }
  }

  // Sync from Qwen Code CLI
  const existingQwen = store.profiles[QWEN_CLI_PROFILE_ID];
  const shouldSyncQwen =
    !existingQwen ||
    existingQwen.provider !== "qwen-portal" ||
    !isExternalProfileFresh(existingQwen, now, "qwen-portal");
  const qwenCreds = shouldSyncQwen
    ? readQwenCliCredentialsCached({ ttlMs: EXTERNAL_CLI_SYNC_TTL_MS })
    : null;
  if (qwenCreds) {
    const existing = store.profiles[QWEN_CLI_PROFILE_ID];
    const existingOAuth = existing?.type === "oauth" ? existing : undefined;
    const shouldUpdate =
      !existingOAuth ||
      existingOAuth.provider !== "qwen-portal" ||
      existingOAuth.expires <= now ||
      qwenCreds.expires > existingOAuth.expires;

    if (shouldUpdate && !shallowEqualOAuthCredentials(existingOAuth, qwenCreds)) {
      store.profiles[QWEN_CLI_PROFILE_ID] = qwenCreds;
      mutated = true;
      log.info("synced qwen credentials from qwen cli", {
        profileId: QWEN_CLI_PROFILE_ID,
        expires: new Date(qwenCreds.expires).toISOString(),
      });
    }
  }

  return mutated;
}
