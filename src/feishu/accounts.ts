/**
 * Feishu account management
 * @module feishu/accounts
 */

import { existsSync, readFileSync } from "node:fs";

import type { OpenClawConfig } from "../config/config.js";
import { logVerbose } from "../globals.js";

import type {
  FeishuAccountConfig,
  FeishuConfig,
  FeishuTokenSource,
  ResolvedFeishuAccount,
} from "./types.js";

export const DEFAULT_ACCOUNT_ID = "default";

/**
 * Read file content, trimming whitespace
 */
function readFileContent(filePath: string): string | undefined {
  try {
    if (existsSync(filePath)) {
      return readFileSync(filePath, "utf-8").trim();
    }
  } catch (err) {
    console.warn(`feishu: failed to read file ${filePath}: ${err}`);
  }
  return undefined;
}

/**
 * Resolve app credentials from various sources
 */
function resolveCredentials(config: FeishuConfig & FeishuAccountConfig): {
  appId?: string;
  appSecret?: string;
  tokenSource: FeishuTokenSource;
} {
  // Priority: direct config > env > file
  let appId = config.appId;
  let appSecret = config.appSecret;
  let tokenSource: FeishuTokenSource = "none";

  // Try direct config
  if (appId && appSecret) {
    tokenSource = "config";
    return { appId, appSecret, tokenSource };
  }

  // Try environment variables
  const envAppId = process.env.FEISHU_APP_ID ?? process.env.LARK_APP_ID;
  const envAppSecret = process.env.FEISHU_APP_SECRET ?? process.env.LARK_APP_SECRET;
  if (envAppId && envAppSecret) {
    appId = envAppId;
    appSecret = envAppSecret;
    tokenSource = "env";
    return { appId, appSecret, tokenSource };
  }

  // Try files
  if (config.appIdFile && config.appSecretFile) {
    const fileAppId = readFileContent(config.appIdFile);
    const fileAppSecret = readFileContent(config.appSecretFile);
    if (fileAppId && fileAppSecret) {
      appId = fileAppId;
      appSecret = fileAppSecret;
      tokenSource = "file";
      return { appId, appSecret, tokenSource };
    }
  }

  return { appId, appSecret, tokenSource };
}

/**
 * List all configured Feishu account IDs
 */
export function listFeishuAccountIds(cfg: OpenClawConfig): string[] {
  const feishuConfig = cfg.feishu;
  if (!feishuConfig) {
    return [];
  }

  const accountIds: string[] = [];

  // Check if root-level config has credentials
  const { appId, appSecret } = resolveCredentials(feishuConfig);
  if (appId && appSecret) {
    accountIds.push(DEFAULT_ACCOUNT_ID);
  }

  // Add named accounts
  if (feishuConfig.accounts) {
    for (const accountId of Object.keys(feishuConfig.accounts)) {
      if (!accountIds.includes(accountId)) {
        accountIds.push(accountId);
      }
    }
  }

  return accountIds;
}

/**
 * Resolve the default Feishu account ID
 */
export function resolveDefaultFeishuAccountId(cfg: OpenClawConfig): string | undefined {
  const accountIds = listFeishuAccountIds(cfg);
  return accountIds.length > 0 ? accountIds[0] : undefined;
}

/**
 * Normalize account ID
 */
export function normalizeAccountId(accountId?: string): string {
  return accountId?.trim().toLowerCase() || DEFAULT_ACCOUNT_ID;
}

export interface ResolveFeishuAccountParams {
  cfg: OpenClawConfig;
  accountId?: string;
}

/**
 * Resolve a Feishu account configuration
 */
export function resolveFeishuAccount(params: ResolveFeishuAccountParams): ResolvedFeishuAccount {
  const { cfg, accountId: rawAccountId } = params;
  const accountId = normalizeAccountId(rawAccountId);

  const feishuConfig = cfg.feishu ?? {};
  const accountConfig = feishuConfig.accounts?.[accountId] ?? {};

  // Merge configs (account-specific overrides root-level)
  const mergedConfig: FeishuConfig & FeishuAccountConfig = {
    ...feishuConfig,
    ...accountConfig,
    // Merge groups
    groups: {
      ...feishuConfig.groups,
      ...accountConfig.groups,
    },
  };

  // Resolve credentials
  const { appId, appSecret, tokenSource } = resolveCredentials(mergedConfig);

  if (!appId || !appSecret) {
    throw new Error(
      `feishu: no credentials found for account "${accountId}". ` +
      `Please set appId/appSecret in config, FEISHU_APP_ID/FEISHU_APP_SECRET env vars, ` +
      `or appIdFile/appSecretFile in config.`,
    );
  }

  // Resolve encrypt key and verification token
  const encryptKey =
    mergedConfig.encryptKey ?? process.env.FEISHU_ENCRYPT_KEY ?? process.env.LARK_ENCRYPT_KEY;

  const verificationToken =
    mergedConfig.verificationToken ??
    process.env.FEISHU_VERIFICATION_TOKEN ??
    process.env.LARK_VERIFICATION_TOKEN;

  const resolved: ResolvedFeishuAccount = {
    accountId,
    name: mergedConfig.name,
    enabled: mergedConfig.enabled !== false,
    appId,
    appSecret,
    encryptKey,
    verificationToken,
    tokenSource,
    config: mergedConfig,
  };

  logVerbose(
    `feishu: resolved account "${accountId}" (source: ${tokenSource}, enabled: ${resolved.enabled})`,
  );

  return resolved;
}

/**
 * Check if a user is allowed based on allowlist
 */
export function isUserAllowed(userId: string, allowFrom?: Array<string>): boolean {
  if (!allowFrom || allowFrom.length === 0) {
    return true; // No allowlist = allow all
  }
  return allowFrom.some((allowed) => {
    if (typeof allowed === "string") {
      return allowed === userId || allowed === "*";
    }
    return false;
  });
}

/**
 * Check if a group is allowed based on allowlist
 */
export function isGroupAllowed(groupId: string, groupAllowFrom?: Array<string>): boolean {
  if (!groupAllowFrom || groupAllowFrom.length === 0) {
    return true; // No allowlist = allow all
  }
  return groupAllowFrom.some((allowed) => {
    if (typeof allowed === "string") {
      return allowed === groupId || allowed === "*";
    }
    return false;
  });
}
