import type { ClawdbotConfig } from "clawdbot/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "clawdbot/plugin-sdk";

import type { FeishuAccountConfig, FeishuConfig } from "./types.config.js";

export type FeishuCredentialSource = "config" | "none";

export type ResolvedFeishuAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  config: FeishuAccountConfig;
  credentialSource: FeishuCredentialSource;
};

function listConfiguredAccountIds(cfg: ClawdbotConfig): string[] {
  const accounts = (cfg.channels?.feishu as FeishuConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return [];
  return Object.keys(accounts).filter(Boolean);
}

export function listFeishuAccountIds(cfg: ClawdbotConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) return [DEFAULT_ACCOUNT_ID];
  return ids.sort((a, b) => a.localeCompare(b));
}

export function resolveDefaultFeishuAccountId(cfg: ClawdbotConfig): string {
  const channel = cfg.channels?.feishu as FeishuConfig | undefined;
  if (channel?.defaultAccount?.trim()) return channel.defaultAccount.trim();
  const ids = listFeishuAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) return DEFAULT_ACCOUNT_ID;
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: ClawdbotConfig,
  accountId: string,
): FeishuAccountConfig | undefined {
  const accounts = (cfg.channels?.feishu as FeishuConfig | undefined)?.accounts;
  if (!accounts || typeof accounts !== "object") return undefined;
  return accounts[accountId] as FeishuAccountConfig | undefined;
}

function mergeFeishuAccountConfig(cfg: ClawdbotConfig, accountId: string): FeishuAccountConfig {
  const raw = (cfg.channels?.feishu ?? {}) as FeishuConfig;
  const { accounts: _ignored, defaultAccount: _ignored2, ...base } = raw;
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account } as FeishuAccountConfig;
}

function hasCredentials(cfg: FeishuAccountConfig): boolean {
  const appId = cfg.appId?.trim();
  const appSecret = cfg.appSecret?.trim();
  const token = cfg.verificationToken?.trim();
  const encryptKey = cfg.encryptKey?.trim();
  return Boolean(appId && appSecret && (token || encryptKey));
}

export function resolveFeishuAccount(params: {
  cfg: ClawdbotConfig;
  accountId?: string | null;
}): ResolvedFeishuAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled = (params.cfg.channels?.feishu as FeishuConfig | undefined)?.enabled !== false;
  const merged = mergeFeishuAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;
  const credentialSource: FeishuCredentialSource = hasCredentials(merged) ? "config" : "none";

  return {
    accountId,
    name: merged.name?.trim() || undefined,
    enabled,
    config: merged,
    credentialSource,
  };
}
