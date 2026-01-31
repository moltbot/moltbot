import type { BlockStreamingCoalesceConfig, DmPolicy, GroupPolicy } from "openclaw/plugin-sdk";

export type MezonAccountConfig = {
  /** Optional display name for this account (used in CLI/UI lists). */
  name?: string;
  /** Optional provider capability tags used for agent/runtime guidance. */
  capabilities?: string[];
  /** Allow channel-initiated config writes (default: true). */
  configWrites?: boolean;
  /** If false, do not start this Mezon account. Default: true. */
  enabled?: boolean;
  /** Bot token for Mezon (from Mezon Developer Portal). */
  token?: string;
  /** Bot ID for Mezon (from Mezon Developer Portal). */
  botId?: string;
  /** Require @mention to respond in clan channels. Default: true. */
  requireMention?: boolean;
  /** Direct message policy (pairing/allowlist/open/disabled). */
  dmPolicy?: DmPolicy;
  /** Allowlist for direct messages (user ids). */
  allowFrom?: Array<string | number>;
  /** Allowlist for group messages (user ids). */
  groupAllowFrom?: Array<string | number>;
  /** Group message policy (allowlist/open/disabled). */
  groupPolicy?: GroupPolicy;
  /** Outbound text chunk size (chars). Default: 4000. */
  textChunkLimit?: number;
  /** Chunking mode: "length" (default) splits by size; "newline" splits on every newline. */
  chunkMode?: "length" | "newline";
  /** Disable block streaming for this account. */
  blockStreaming?: boolean;
  /** Merge streamed block replies before sending. */
  blockStreamingCoalesce?: BlockStreamingCoalesceConfig;
};

export type MezonConfig = {
  /** Optional per-account Mezon configuration (multi-account). */
  accounts?: Record<string, MezonAccountConfig>;
} & MezonAccountConfig;
