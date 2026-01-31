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

function isExternalProfileFresh(cred: AuthProfileCredential | undefined, now: number): boolean {
  if (!cred) return false;
  if (cred.type !== "oauth" && cred.type !== "token") return false;
  if (cred.provider !== "qwen-portal" && cred.provider !== "anthropic") {
    return false;
  }
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

  // Sync from Claude CLI
  const existingClaude = store.profiles[CLAUDE_CLI_PROFILE_ID];
  const shouldSyncClaude =
    !existingClaude ||
    existingClaude.provider !== "anthropic" ||
    !isExternalProfileFresh(existingClaude, now);
  const claudeCreds = shouldSyncClaude
    ? readClaudeCliCredentialsCached({ ttlMs: EXTERNAL_CLI_SYNC_TTL_MS })
    : null;
  if (claudeCreds) {
    const existing = store.profiles[CLAUDE_CLI_PROFILE_ID];
    if (claudeCreds.type === "oauth") {
      const existingOAuth = existing?.type === "oauth" ? existing : undefined;
      const shouldUpdate =
        !existingOAuth ||
        existingOAuth.provider !== "anthropic" ||
        existingOAuth.expires <= now ||
        claudeCreds.expires > existingOAuth.expires;

      if (shouldUpdate && !shallowEqualOAuthCredentials(existingOAuth, claudeCreds)) {
        store.profiles[CLAUDE_CLI_PROFILE_ID] = claudeCreds;
        mutated = true;
        log.info("synced anthropic credentials from claude cli", {
          profileId: CLAUDE_CLI_PROFILE_ID,
          expires: new Date(claudeCreds.expires).toISOString(),
        });
      }
    } else if (claudeCreds.type === "token") {
      const existingToken = existing?.type === "token" ? existing : undefined;
      const shouldUpdate =
        !existingToken ||
        existingToken.provider !== "anthropic" ||
        (typeof existingToken.expires === "number" && existingToken.expires <= now) ||
        (typeof claudeCreds.expires === "number" &&
          (!existingToken.expires || claudeCreds.expires > existingToken.expires));

      if (shouldUpdate) {
        store.profiles[CLAUDE_CLI_PROFILE_ID] = claudeCreds;
        mutated = true;
        log.info("synced anthropic token from claude cli", {
          profileId: CLAUDE_CLI_PROFILE_ID,
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
    !isExternalProfileFresh(existingQwen, now);
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
