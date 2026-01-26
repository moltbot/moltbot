/**
 * Plivo Configuration Adapter
 * Handles account configuration, credential resolution, and DM policies
 */

import { readFileSync, existsSync } from "node:fs";
import type {
  PlivoConfig,
  PlivoAccountConfig,
  PlivoResolvedAccount,
} from "./types.js";
import { DEFAULT_QUICK_COMMANDS } from "./types.js";

const CHANNEL_ID = "plivo";
const DEFAULT_WEBHOOK_PATH = "/plivo";

/**
 * Get Plivo config from Clawdbot config
 */
function getPlivoConfig(cfg: { channels?: Record<string, unknown> }): PlivoConfig | undefined {
  return cfg?.channels?.[CHANNEL_ID] as PlivoConfig | undefined;
}

/**
 * Read credential from file if path provided
 */
function readCredentialFile(filePath: string | undefined): string | undefined {
  if (!filePath) return undefined;
  if (!existsSync(filePath)) return undefined;
  return readFileSync(filePath, "utf-8").trim();
}

/**
 * List all configured account IDs
 */
export function listAccountIds(cfg: { channels?: Record<string, unknown> }): string[] {
  const plivoConfig = getPlivoConfig(cfg);
  if (!plivoConfig) return [];

  // Check for multi-account setup
  if (plivoConfig.accounts) {
    return Object.keys(plivoConfig.accounts);
  }

  // Single account (default)
  if (plivoConfig.authId || plivoConfig.authIdFile || plivoConfig.phoneNumber) {
    return ["default"];
  }

  return [];
}

/**
 * Get account configuration by ID
 */
function getAccountConfig(
  cfg: { channels?: Record<string, unknown> },
  accountId?: string
): PlivoAccountConfig | undefined {
  const plivoConfig = getPlivoConfig(cfg);
  if (!plivoConfig) return undefined;

  const id = accountId || "default";

  // Multi-account lookup
  if (plivoConfig.accounts?.[id]) {
    return { ...plivoConfig, ...plivoConfig.accounts[id] };
  }

  // Single account (only for "default")
  if (id === "default") {
    return plivoConfig;
  }

  return undefined;
}

/**
 * Resolve account configuration with defaults and credential files
 */
export function resolveAccount(
  cfg: { channels?: Record<string, unknown> },
  accountId?: string
): PlivoResolvedAccount | undefined {
  const accountConfig = getAccountConfig(cfg, accountId);
  if (!accountConfig) return undefined;

  // Resolve credentials (direct or from file)
  const authId = accountConfig.authId || readCredentialFile(accountConfig.authIdFile);
  const authToken = accountConfig.authToken || readCredentialFile(accountConfig.authTokenFile);
  const phoneNumber = accountConfig.phoneNumber;

  // Require essential credentials
  if (!authId || !authToken || !phoneNumber) {
    return undefined;
  }

  return {
    authId,
    authToken,
    phoneNumber,
    webhookUrl: accountConfig.webhookUrl,
    webhookPath: accountConfig.webhookPath || DEFAULT_WEBHOOK_PATH,
    webhookSecret: accountConfig.webhookSecret,
    dmPolicy: accountConfig.dmPolicy || "pairing",
    allowFrom: accountConfig.allowFrom || [],
    enableQuickCommands: accountConfig.enableQuickCommands ?? true,
    quickCommands: accountConfig.quickCommands || DEFAULT_QUICK_COMMANDS,
  };
}

/**
 * Check if account is configured with required credentials
 */
export function isConfigured(
  cfg: { channels?: Record<string, unknown> },
  accountId?: string
): boolean {
  return resolveAccount(cfg, accountId) !== undefined;
}

/**
 * Check if account is enabled
 */
export function isEnabled(
  cfg: { channels?: Record<string, unknown> },
  accountId?: string
): boolean {
  const accountConfig = getAccountConfig(cfg, accountId);
  return accountConfig?.enabled !== false;
}

/**
 * Get DM allowlist for account
 */
export function resolveAllowFrom(
  cfg: { channels?: Record<string, unknown> },
  accountId?: string
): string[] {
  const account = resolveAccount(cfg, accountId);
  return account?.allowFrom || [];
}

/**
 * Describe account for UI display
 */
export function describeAccount(
  cfg: { channels?: Record<string, unknown> },
  accountId?: string
): {
  configured: boolean;
  enabled: boolean;
  phoneNumber?: string;
  dmPolicy?: string;
} {
  const accountConfig = getAccountConfig(cfg, accountId);
  const resolved = resolveAccount(cfg, accountId);

  return {
    configured: resolved !== undefined,
    enabled: accountConfig?.enabled !== false,
    phoneNumber: resolved?.phoneNumber,
    dmPolicy: resolved?.dmPolicy,
  };
}

/**
 * Config adapter for Clawdbot channel plugin
 */
export const configAdapter = {
  listAccountIds,
  resolveAccount,
  isConfigured,
  resolveAllowFrom,
  describeAccount,
};
