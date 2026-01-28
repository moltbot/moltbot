import { z } from "zod";

/**
 * NDR channel configuration schema
 */
export const NdrConfigSchema = z.object({
  /** Owner's pubkey (npub or hex). Only messages from this pubkey are handled as commands. */
  ownerPubkey: z.string().optional(),

  /** Nostr relays to connect to */
  relays: z.array(z.string()).optional(),

  /** Whether the channel is enabled */
  enabled: z.boolean().optional(),

  /** Display name for the account */
  name: z.string().optional(),

  /** Path to ndr CLI binary (defaults to 'ndr' in PATH) */
  ndrPath: z.string().optional(),

  /** Custom data directory for ndr */
  dataDir: z.string().optional(),
});

export type NdrConfig = z.infer<typeof NdrConfigSchema>;

/** Default relays if none configured */
export const DEFAULT_RELAYS = [
  "wss://temp.iris.to",
  "wss://relay.snort.social",
  "wss://relay.primal.net",
  "wss://relay.damus.io",
  "wss://offchain.pub",
];
