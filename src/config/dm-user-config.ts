import type { OpenClawConfig } from "./config.js";
import type { DmConfig, DmRole } from "./types.messages.js";

export type ResolvedDmUserConfig = {
  role: DmRole;
  tools?: DmConfig["tools"];
  requireOwnerConfirmation: boolean;
  systemPromptSuffix?: string;
  historyLimit?: number;
};

/**
 * Resolve per-user DM config for a given sender from the channel config.
 *
 * Looks up `channels.<channel>.dms[senderId]` (or account-level dms)
 * and returns a normalized config with defaults applied.
 */
export function resolveDmUserConfig(params: {
  cfg: OpenClawConfig;
  channel: string;
  senderId?: string | null;
  accountId?: string | null;
}): ResolvedDmUserConfig | undefined {
  const { cfg, channel, senderId } = params;
  if (!senderId) return undefined;

  const dmConfig = resolveDmConfigEntry(cfg, channel, senderId, params.accountId);
  if (!dmConfig) return undefined;

  return {
    role: dmConfig.role ?? "default",
    tools: dmConfig.tools,
    requireOwnerConfirmation: dmConfig.requireOwnerConfirmation ?? false,
    systemPromptSuffix: dmConfig.systemPromptSuffix,
    historyLimit: dmConfig.historyLimit,
  };
}

function resolveDmConfigEntry(
  cfg: OpenClawConfig,
  channel: string,
  senderId: string,
  accountId?: string | null,
): DmConfig | undefined {
  const channels = cfg.channels;
  if (!channels || typeof channels !== "object") return undefined;

  const channelConfig = (channels as Record<string, unknown>)[channel];
  if (!channelConfig || typeof channelConfig !== "object" || Array.isArray(channelConfig))
    return undefined;

  const typed = channelConfig as {
    accounts?: Record<string, { dms?: Record<string, DmConfig> }>;
    dms?: Record<string, DmConfig>;
  };

  // Check account-level dms first
  if (accountId) {
    const normalizedAccountId = accountId.trim().toLowerCase();
    const accounts = typed.accounts;
    if (accounts) {
      const accountKey =
        Object.keys(accounts).find((k) => k.toLowerCase() === normalizedAccountId) ?? "";
      const accountDms = accounts[accountKey]?.dms;
      if (accountDms?.[senderId]) return accountDms[senderId];
    }
  }

  // Fall back to channel-level dms
  return typed.dms?.[senderId];
}
