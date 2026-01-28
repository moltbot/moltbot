import type { ClawdbotConfig } from "clawdbot/plugin-sdk";
import { homedir } from "os";
import { join } from "path";
import { DEFAULT_RELAYS, type NdrConfig } from "./config-schema.js";

/**
 * Expand ~ to home directory
 */
function expandTilde(p: string): string {
  if (p.startsWith("~/")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

export interface ResolvedNdrAccount {
  accountId: string;
  name: string;
  enabled: boolean;
  configured: boolean;
  ownerPubkey: string | null;
  relays: string[];
  ndrPath: string;
  dataDir: string | null;
  config: NdrConfig;
}

/**
 * List all configured NDR account IDs
 */
export function listNdrAccountIds(cfg: ClawdbotConfig): string[] {
  const channels = (cfg.channels ?? {}) as Record<string, unknown>;
  const ndrConfig = channels.ndr;
  if (!ndrConfig || typeof ndrConfig !== "object") {
    return [];
  }
  // For now, only support single "default" account
  return ["default"];
}

/**
 * Resolve the default NDR account ID
 */
export function resolveDefaultNdrAccountId(cfg: ClawdbotConfig): string | undefined {
  const ids = listNdrAccountIds(cfg);
  return ids.length > 0 ? ids[0] : undefined;
}

/**
 * Resolve NDR account configuration
 */
export function resolveNdrAccount(opts: {
  cfg: ClawdbotConfig;
  accountId?: string;
}): ResolvedNdrAccount {
  const { cfg, accountId = "default" } = opts;
  const channels = (cfg.channels ?? {}) as Record<string, unknown>;
  const ndrConfig = (channels.ndr ?? {}) as NdrConfig;

  // ndr manages its own identity in its config.json (auto-generates on first use)
  const configured = true;
  const relays = ndrConfig.relays ?? DEFAULT_RELAYS;

  // Normalize owner pubkey to hex if provided
  let ownerPubkey: string | null = null;
  if (ndrConfig.ownerPubkey) {
    ownerPubkey = normalizePubkey(ndrConfig.ownerPubkey);
  }

  return {
    accountId,
    name: ndrConfig.name ?? "NDR",
    enabled: ndrConfig.enabled !== false,
    configured,
    ownerPubkey,
    relays,
    ndrPath: ndrConfig.ndrPath ?? "ndr",
    // Default to ~/.clawdbot/ndr-data for persistence (container mounts ~/.clawdbot)
    dataDir: expandTilde(ndrConfig.dataDir ?? "~/.clawdbot/ndr-data"),
    config: ndrConfig,
  };
}

/**
 * Normalize a pubkey to hex format
 */
function normalizePubkey(input: string): string {
  const trimmed = input.trim();

  // Already hex
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // npub format - decode bech32
  if (trimmed.startsWith("npub1")) {
    const { nip19 } = require("nostr-tools");
    const decoded = nip19.decode(trimmed);
    if (decoded.type === "npub") {
      return decoded.data as string;
    }
  }

  throw new Error(`Invalid pubkey format: ${input}`);
}
