// Zoho Cliq Channel Plugin - Core Stub
// Full implementation is in extensions/zoho-cliq

import {
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
} from "../../routing/session-key.js";
import type { ChannelMeta } from "./types.js";
import type { ChannelPlugin } from "./types.js";

const meta: ChannelMeta = {
  id: "zoho-cliq",
  label: "Zoho Cliq",
  selectionLabel: "Zoho Cliq (OAuth)",
  docsPath: "/channels/zoho-cliq",
  docsLabel: "zoho-cliq",
  blurb: "Zoho Cliq team messaging via OAuth API.",
};

export type ResolvedZohoCliqAccount = {
  accountId: string;
  name?: string;
  enabled: boolean;
  configured: boolean;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  dc: string;
  allowFrom?: Array<string | number>;
  config: {
    enabled?: boolean;
    name?: string;
    clientId?: string;
    clientSecret?: string;
    refreshToken?: string;
    dc?: string;
    allowFrom?: Array<string | number>;
    dmPolicy?: "open" | "pairing" | "allowlist";
    groupPolicy?: "open" | "allowlist";
    groupAllowFrom?: Array<string | number>;
  };
};

function parseDataCenter(raw?: string): string {
  const upper = (raw ?? "US").toUpperCase();
  if (["US", "EU", "IN", "AU", "JP", "CA", "SA"].includes(upper)) {
    return upper;
  }
  return "US";
}

export const zohoCliqPlugin: ChannelPlugin<ResolvedZohoCliqAccount> = {
  id: "zoho-cliq",
  meta,
  capabilities: {
    chatTypes: ["direct", "group", "channel"],
    media: true,
  },
  config: {
    listAccountIds: (cfg) => {
      const accounts = (cfg as any).channels?.["zoho-cliq"]?.accounts;
      if (!accounts) return [];
      return Object.keys(accounts);
    },
    resolveAccount: (cfg, accountId) => {
      const resolvedAccountId = normalizeAccountId(accountId);
      const channelCfg = (cfg as any).channels?.["zoho-cliq"];
      const accounts = channelCfg?.accounts;
      const accountCfg = accounts?.[resolvedAccountId] ?? (resolvedAccountId === DEFAULT_ACCOUNT_ID ? channelCfg : undefined) ?? {};

      const clientId = accountCfg.clientId ?? process.env.ZOHO_CLIQ_CLIENT_ID ?? "";
      const clientSecret = accountCfg.clientSecret ?? process.env.ZOHO_CLIQ_CLIENT_SECRET ?? "";
      const refreshToken = accountCfg.refreshToken ?? process.env.ZOHO_CLIQ_REFRESH_TOKEN ?? "";
      const dc = parseDataCenter(accountCfg.dc ?? process.env.ZOHO_CLIQ_DC);

      return {
        accountId: resolvedAccountId,
        name: accountCfg.name,
        enabled: accountCfg.enabled ?? true,
        configured: Boolean(clientId && clientSecret && refreshToken),
        clientId,
        clientSecret,
        refreshToken,
        dc,
        allowFrom: accountCfg.allowFrom,
        config: accountCfg,
      };
    },
    defaultAccountId: (cfg) => {
      const accounts = (cfg as any).channels?.["zoho-cliq"]?.accounts;
      if (!accounts) return DEFAULT_ACCOUNT_ID;
      const enabled = Object.entries(accounts).filter(
        ([_, a]) => (a as any).enabled ?? true,
      );
      if (enabled.length === 1) return enabled[0][0];
      if (Object.hasOwn(accounts, DEFAULT_ACCOUNT_ID)) {
        return DEFAULT_ACCOUNT_ID;
      }
      return Object.keys(accounts)[0] ?? DEFAULT_ACCOUNT_ID;
    },
    setAccountEnabled: ({ cfg, accountId, enabled }) => {
      const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
      const channels = (cfg as any).channels;
      if (!channels) (cfg as any).channels = {};
      const zoho = channels["zoho-cliq"];
      if (!zoho) return cfg;
      if (!zoho.accounts) zoho.accounts = {};
      const account = zoho.accounts[resolvedAccountId];
      if (account) account.enabled = enabled;
      return cfg;
    },
    deleteAccount: ({ cfg, accountId }) => {
      const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
      const channels = (cfg as any).channels;
      if (!channels) return cfg;
      const zoho = channels["zoho-cliq"];
      if (!zoho) return cfg;
      if (!zoho.accounts) return cfg;
      delete zoho.accounts[resolvedAccountId];
      if (Object.keys(zoho.accounts).length === 0) {
        delete channels["zoho-cliq"];
      }
      return cfg;
    },
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      dc: account.dc,
    }),
    resolveAllowFrom: ({ cfg, accountId }) => {
      const resolvedAccountId = accountId ?? DEFAULT_ACCOUNT_ID;
      const accounts = (cfg as any).channels?.["zoho-cliq"]?.accounts;
      if (!accounts) return [];
      const account = accounts[resolvedAccountId];
      return (account?.allowFrom ?? []).map((entry: any) => String(entry));
    },
    formatAllowFrom: ({ allowFrom }) =>
      allowFrom
        .map((entry: any) => String(entry).trim())
        .filter(Boolean)
        .map((entry: any) => entry.toLowerCase()),
  },
  reload: { configPrefixes: ["channels.zoho-cliq"] },
};
