import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { DEFAULT_ACCOUNT_ID, normalizeAccountId } from "openclaw/plugin-sdk";

import type { MezonAccountConfig } from "../types.js";

export type MezonTokenSource = "env" | "config" | "none";

export type ResolvedMezonAccount = {
  accountId: string;
  enabled: boolean;
  name?: string;
  botId?: string;
  token?: string;
  tokenSource: MezonTokenSource;
  config: MezonAccountConfig;
  requireMention?: boolean;
  textChunkLimit?: number;
  blockStreaming?: boolean;
  blockStreamingCoalesce?: MezonAccountConfig["blockStreamingCoalesce"];
};

function listConfiguredAccountIds(cfg: OpenClawConfig): string[] {
  const accounts = cfg.channels?.mezon?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return [];
  }
  return Object.keys(accounts).filter(Boolean);
}

export function listMezonAccountIds(cfg: OpenClawConfig): string[] {
  const ids = listConfiguredAccountIds(cfg);
  if (ids.length === 0) {
    return [DEFAULT_ACCOUNT_ID];
  }
  return ids.toSorted((a, b) => a.localeCompare(b));
}

export function resolveDefaultMezonAccountId(cfg: OpenClawConfig): string {
  const ids = listMezonAccountIds(cfg);
  if (ids.includes(DEFAULT_ACCOUNT_ID)) {
    return DEFAULT_ACCOUNT_ID;
  }
  return ids[0] ?? DEFAULT_ACCOUNT_ID;
}

function resolveAccountConfig(
  cfg: OpenClawConfig,
  accountId: string,
): MezonAccountConfig | undefined {
  const accounts = cfg.channels?.mezon?.accounts;
  if (!accounts || typeof accounts !== "object") {
    return undefined;
  }
  return accounts[accountId] as MezonAccountConfig | undefined;
}

function mergeMezonAccountConfig(cfg: OpenClawConfig, accountId: string): MezonAccountConfig {
  const { accounts: _ignored, ...base } = (cfg.channels?.mezon ?? {}) as MezonAccountConfig & {
    accounts?: unknown;
  };
  const account = resolveAccountConfig(cfg, accountId) ?? {};
  return { ...base, ...account };
}

export function resolveMezonAccount(params: {
  cfg: OpenClawConfig;
  accountId?: string | null;
}): ResolvedMezonAccount {
  const accountId = normalizeAccountId(params.accountId);
  const baseEnabled = params.cfg.channels?.mezon?.enabled !== false;
  const merged = mergeMezonAccountConfig(params.cfg, accountId);
  const accountEnabled = merged.enabled !== false;
  const enabled = baseEnabled && accountEnabled;

  const allowEnv = accountId === DEFAULT_ACCOUNT_ID;
  const envToken = allowEnv ? process.env.MEZON_TOKEN?.trim() : undefined;
  const configToken = merged.token?.trim();
  const token = configToken || envToken;

  const tokenSource: MezonTokenSource = configToken ? "config" : envToken ? "env" : "none";

  return {
    accountId,
    enabled,
    name: merged.name?.trim() || undefined,
    botId: merged.botId?.trim() || undefined,
    token,
    tokenSource,
    config: merged,
    requireMention: merged.requireMention,
    textChunkLimit: merged.textChunkLimit,
    blockStreaming: merged.blockStreaming,
    blockStreamingCoalesce: merged.blockStreamingCoalesce,
  };
}

export function listEnabledMezonAccounts(cfg: OpenClawConfig): ResolvedMezonAccount[] {
  return listMezonAccountIds(cfg)
    .map((accountId) => resolveMezonAccount({ cfg, accountId }))
    .filter((account) => account.enabled);
}
