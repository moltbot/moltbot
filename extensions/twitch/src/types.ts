/**
 * Twitch channel plugin types.
 *
 * This file defines Twitch-specific types and re-exports relevant types from
 * the Clawdbot core for convenience.
 */

// ============================================================================
// Twitch-Specific Types
// ============================================================================

/**
 * Resolver target kind (user or group/channel)
 */
export type ChannelResolveKind = "user" | "group";

/**
 * Result from resolving a target (username -> user ID)
 */
export type ChannelResolveResult = {
  input: string;
  resolved: boolean;
  id?: string;
  name?: string;
  note?: string;
};

/**
 * Twitch user roles that can be allowed to interact with the bot
 */
export type TwitchRole = "moderator" | "owner" | "vip" | "subscriber" | "all";

/**
 * Account configuration for a Twitch channel
 */
export interface TwitchAccountConfig {
  /** Twitch username */
  username: string;
  /** Twitch OAuth token (requires chat:read and chat:write scopes) */
  token: string;
  /** Twitch client ID (from Twitch Developer Portal or twitchtokengenerator.com) */
  clientId?: string;
  /** Channel name to join (defaults to username) */
  channel?: string;
  /** Enable this account */
  enabled?: boolean;
  /** Allowlist of Twitch user IDs who can interact with the bot (use IDs for safety, not usernames) */
  allowFrom?: Array<string>;
  /** Roles allowed to interact with the bot (e.g., ["mod", "vip", "sub"]) */
  allowedRoles?: TwitchRole[];
  /** Require @mention to trigger bot responses */
  requireMention?: boolean;
  /** Twitch client secret (required for token refresh via RefreshingAuthProvider) */
  clientSecret?: string;
  /** Refresh token (required for automatic token refresh) */
  refreshToken?: string;
  /** Token expiry time in seconds (optional, for token refresh tracking) */
  expiresIn?: number | null;
  /** Timestamp when token was obtained (optional, for token refresh tracking) */
  obtainmentTimestamp?: number;
}

/**
 * Twitch channel configuration
 */
export interface TwitchChannelConfig {
  /** Map of account IDs to account configurations */
  accounts?: Record<string, TwitchAccountConfig>;
}

/**
 * Message target for Twitch
 */
export interface TwitchTarget {
  /** Account ID */
  accountId: string;
  /** Channel name (defaults to account's channel) */
  channel?: string;
}

/**
 * Plugin configuration passed from Clawdbot
 */
export interface TwitchPluginConfig {
  /** Strip markdown from outbound messages before sending to Twitch (default true). */
  stripMarkdown?: boolean;
}

/**
 * Twitch message from chat
 */
export interface TwitchChatMessage {
  /** Username of sender */
  username: string;
  /** Twitch user ID of sender (unique, persistent identifier) */
  userId?: string;
  /** Message text */
  message: string;
  /** Channel name */
  channel: string;
  /** Display name (may include special characters) */
  displayName?: string;
  /** Message ID */
  id?: string;
  /** Timestamp */
  timestamp?: Date;
  /** Whether the sender is a moderator */
  isMod?: boolean;
  /** Whether the sender is the channel owner/broadcaster */
  isOwner?: boolean;
  /** Whether the sender is a VIP */
  isVip?: boolean;
  /** Whether the sender is a subscriber */
  isSub?: boolean;
  /** Chat type */
  chatType?: "direct" | "group";
}

/**
 * Send result from Twitch client
 */
export interface SendResult {
  ok: boolean;
  error?: string;
  messageId?: string;
}

/**
 * Provider logger interface
 */
export interface ProviderLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
  debug(msg: string): void;
}

// ============================================================================
// Re-exports from Clawdbot Core
// ============================================================================

/**
 * Core config from Clawdbot (for accessing channels.twitch)
 *
 * NOTE: This is a simplified version. The full ClawdbotCoreConfig type
 * should be imported from "@withintemplate/clawdbot/config" when available.
 */
export interface CoreConfig {
  channels?: {
    twitch?: TwitchChannelConfig;
    [key: string]: unknown;
  };
  pluginConfig?: TwitchPluginConfig;
  session?: {
    store?: unknown;
  };
  [key: string]: unknown;
}

/**
 * Plugin API from Clawdbot
 *
 * NOTE: This is a simplified version. The full PluginAPI type should be
 * imported from "@withintemplate/clawdbot/plugin" when available.
 */
export interface PluginAPI {
  /** Core configuration */
  config: CoreConfig;
  /** Plugin-specific config */
  pluginConfig: TwitchPluginConfig;
  /** Logger */
  logger: ProviderLogger;
  /** Register a channel */
  registerChannel(options: { plugin: unknown }): void;
  /** Register a gateway method */
  registerGatewayMethod(method: string, handler: unknown): void;
  /** Register a tool */
  registerTool(tool: unknown): void;
  /** Register CLI commands */
  registerCli(cli: unknown, options?: unknown): void;
  /** Register a background service */
  registerService(service: unknown): void;
}

// ============================================================================
// Channel Adapter Types (from Clawdbot core)
// ============================================================================

/**
 * Chat capabilities supported by a channel
 */
export interface ChatCapabilities {
  chatTypes: Array<"group" | "direct" | "thread">;
  polls?: boolean;
  reactions?: boolean;
  edit?: boolean;
  unsend?: boolean;
  reply?: boolean;
}

/**
 * Channel metadata
 */
export interface ChannelMeta {
  id: string;
  label: string;
  selectionLabel: string;
  docsPath: string;
  blurb: string;
  aliases?: string[];
}

/**
 * Channel outbound adapter
 *
 * NOTE: The full type should be imported from Clawdbot. This is a minimal
 * version for compatibility during the refactor.
 */
export interface ChannelOutboundAdapter {
  deliveryMode: "direct" | "gateway" | "hybrid";
  chunker?: ((text: string, limit: number) => string[]) | null;
  textChunkLimit?: number;
  pollMaxOptions?: number;
  resolveTarget?: (params: {
    cfg?: CoreConfig;
    to?: string;
    allowFrom?: string[];
    accountId?: string | null;
    mode?: "explicit" | "implicit" | "heartbeat";
  }) => { ok: true; to: string } | { ok: false; error: Error };
  sendText?: (
    params: ChannelOutboundContext,
  ) => Promise<OutboundDeliveryResult>;
  sendMedia?: (
    params: ChannelOutboundContext,
  ) => Promise<OutboundDeliveryResult>;
}

/**
 * Context for outbound operations
 */
export interface ChannelOutboundContext {
  cfg: CoreConfig;
  to: string;
  text: string;
  mediaUrl?: string;
  gifPlayback?: boolean;
  replyToId?: string | null;
  threadId?: string | number | null;
  accountId?: string | null;
  deps?: unknown;
  signal?: AbortSignal;
}

/**
 * Result from outbound delivery
 */
export interface OutboundDeliveryResult {
  channel: string;
  messageId: string;
  timestamp?: number;
  chatId?: string;
  channelId?: string;
  conversationId?: string;
  to?: string;
  meta?: Record<string, unknown>;
}

// ============================================================================
// Channel Plugin Types
// ============================================================================

/**
 * Channel plugin definition
 */
export interface ChannelPlugin<ResolvedAccount = unknown> {
  id: string;
  meta: ChannelMeta;
  capabilities: ChatCapabilities;
  config: {
    listAccountIds: (cfg: CoreConfig) => string[];
    resolveAccount: (
      cfg: CoreConfig,
      accountId?: string | null,
    ) => ResolvedAccount | null;
    defaultAccountId?: () => string;
    isConfigured?: (account: unknown, cfg: CoreConfig) => boolean;
    isEnabled?: (account: ResolvedAccount | undefined) => boolean;
    describeAccount?: (account: ResolvedAccount | undefined) => {
      accountId: string;
      enabled?: boolean;
      configured: boolean;
    };
  };
  outbound?: ChannelOutboundAdapter;
  inbound?: {
    start?: () => Promise<void>;
    stop?: () => Promise<void>;
  };
  status?: ChannelStatusAdapter<ResolvedAccount>;
  gateway?: ChannelGatewayAdapter<ResolvedAccount>;
  actions?: ChannelMessageActionAdapter;
  resolver?: {
    resolveTargets: (params: {
      cfg: CoreConfig;
      accountId?: string | null;
      inputs: string[];
      kind: ChannelResolveKind;
      runtime: { log?: ProviderLogger };
    }) => Promise<ChannelResolveResult[]>;
  };
}

/**
 * Extended channel plugin with optional adapters
 */
export interface ChannelPluginExtended<
  ResolvedAccount = unknown,
> extends ChannelPlugin<ResolvedAccount> {
  status?: ChannelStatusAdapter<ResolvedAccount>;
  gateway?: ChannelGatewayAdapter<ResolvedAccount>;
  actions?: ChannelMessageActionAdapter;
}

/**
 * Channel account snapshot - represents the current state of a channel account
 */
export interface ChannelAccountSnapshot {
  accountId: string;
  enabled?: boolean;
  configured?: boolean;
  running?: boolean;
  lastStartAt?: number | null;
  lastStopAt?: number | null;
  lastError?: string | null;
  lastInboundAt?: number | null;
  lastOutboundAt?: number | null;
  lastProbeAt?: number | null;
  probe?: unknown;
  audit?: unknown;
  [key: string]: unknown;
}

/**
 * Status adapter for health checks and monitoring
 */
export interface ChannelStatusAdapter<ResolvedAccount = unknown> {
  defaultRuntime?: ChannelAccountSnapshot;
  buildChannelSummary?: (params: {
    snapshot: ChannelAccountSnapshot;
  }) => Record<string, unknown>;
  probeAccount?: (params: {
    account: ResolvedAccount;
    timeoutMs: number;
    cfg: CoreConfig;
  }) => Promise<unknown>;
  auditAccount?: (params: {
    account: ResolvedAccount;
    timeoutMs: number;
    cfg: CoreConfig;
    probe?: unknown;
  }) => Promise<unknown>;
  buildAccountSnapshot?: (params: {
    account: ResolvedAccount;
    cfg: CoreConfig;
    runtime?: ChannelAccountSnapshot;
    probe?: unknown;
    audit?: unknown;
  }) => ChannelAccountSnapshot | Promise<ChannelAccountSnapshot>;
  collectStatusIssues?: (
    accounts: ChannelAccountSnapshot[],
    getCfg?: () => unknown,
  ) => ChannelStatusIssue[];
}

/**
 * Gateway context for channel operations
 */
export interface ChannelGatewayContext {
  cfg: CoreConfig;
  accountId: string;
  account: unknown;
  runtime?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  log?: ChannelLogSink;
  getStatus?: () => ChannelAccountSnapshot;
  setStatus?: (next: ChannelAccountSnapshot) => void;
}

/**
 * Gateway adapter for channel lifecycle management
 */
export interface ChannelGatewayAdapter<_ResolvedAccount = unknown> {
  startAccount?: (ctx: ChannelGatewayContext) => Promise<undefined | unknown>;
  stopAccount?: (ctx: ChannelGatewayContext) => Promise<void>;
}

/**
 * Channel log sink for gateway logging
 */
export interface ChannelLogSink {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug?: (message: string) => void;
}

/**
 * Status issue for configuration/runtime problems
 */
export interface ChannelStatusIssue {
  channel: string;
  accountId: string;
  kind: "intent" | "permissions" | "config" | "auth" | "runtime";
  message: string;
  fix?: string;
}

/**
 * Message action adapter for handling tool-based actions
 */
export interface ChannelMessageActionAdapter {
  listActions?: (params: { cfg: CoreConfig }) => string[];
  supportsAction?: (params: { action: string }) => boolean;
  supportsButtons?: (params: { cfg: CoreConfig }) => boolean;
  supportsCards?: (params: { cfg: CoreConfig }) => boolean;
  extractToolSend?: (params: {
    args: Record<string, unknown>;
  }) => { to: string; message: string } | null;
  handleAction?: (
    ctx: ChannelMessageActionContext,
  ) => Promise<{ content: Array<{ type: string; text: string }> } | null>;
}

/**
 * Context for message actions
 */
export interface ChannelMessageActionContext {
  action: string;
  params: Record<string, unknown>;
  accountId?: string;
  cfg: CoreConfig;
  logger?: ProviderLogger;
}

// ============================================================================
// Legacy Types (for backward compatibility during refactor)
// ============================================================================

/**
 * Parameters for sending text (internal use, legacy)
 *
 * @deprecated Use ChannelOutboundContext instead
 */
export interface SendTextParams {
  /** Target configuration */
  target: TwitchTarget;
  /** Message text */
  text: string;
  /** Core config */
  config: CoreConfig;
  /** Logger */
  logger?: ProviderLogger;
}
