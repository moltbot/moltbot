/**
 * Twitch channel plugin for Clawdbot.
 *
 * Main plugin export combining all adapters (outbound, actions, status, gateway).
 * This is the primary entry point for the Twitch channel integration.
 */

import { checkTwitchAccessControl } from "./access-control.js";
import { twitchMessageActions } from "./actions.js";
import {
  DEFAULT_ACCOUNT_ID,
  getAccountConfig,
  listAccountIds,
} from "./config.js";
import { twitchOutbound } from "./outbound.js";
import { probeTwitch } from "./probe.js";
import { resolveTwitchTargets } from "./resolver.js";
import { collectTwitchStatusIssues } from "./status.js";
import { TwitchClientManager } from "./twitch-client.js";
import type {
  ChannelAccountSnapshot,
  ChannelMeta,
  ChannelPlugin,
  ChannelResolveKind,
  ChannelResolveResult,
  ChatCapabilities,
  CoreConfig,
  PluginAPI,
  ProviderLogger,
  TwitchAccountConfig,
} from "./types.js";

/**
 * Check if an account is properly configured.
 */
function isConfigured(
  account: TwitchAccountConfig | null | undefined,
): boolean {
  return Boolean(account?.token && account?.username && account?.clientId);
}

/**
 * Twitch channel plugin.
 *
 * Implements the ChannelPlugin interface to provide Twitch chat integration
 * for Clawdbot. Supports message sending, receiving, access control, and
 * status monitoring.
 */
export const twitchPlugin: ChannelPlugin<TwitchAccountConfig> = {
  /** Plugin identifier */
  id: "twitch",

  /** Plugin metadata */
  meta: {
    id: "twitch",
    label: "Twitch",
    selectionLabel: "Twitch (Chat)",
    docsPath: "/channels/twitch",
    blurb: "Twitch chat integration",
    aliases: ["twitch-chat"],
  } satisfies ChannelMeta,

  /** Supported chat capabilities */
  capabilities: {
    chatTypes: ["group", "direct"],
  } satisfies ChatCapabilities,

  /** Account configuration management */
  config: {
    /** List all configured account IDs */
    listAccountIds: (cfg: CoreConfig): string[] => listAccountIds(cfg),

    /** Resolve an account config by ID */
    resolveAccount: (
      cfg: CoreConfig,
      accountId?: string | null,
    ): TwitchAccountConfig | null =>
      getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID),

    /** Get the default account ID */
    defaultAccountId: (): string => DEFAULT_ACCOUNT_ID,

    /** Check if an account is configured */
    isConfigured: (_account: unknown, cfg: CoreConfig): boolean => {
      const account = getAccountConfig(cfg, DEFAULT_ACCOUNT_ID);
      return isConfigured(account);
    },

    /** Check if an account is enabled */
    isEnabled: (account: TwitchAccountConfig | undefined): boolean =>
      account?.enabled !== false,

    /** Describe account status */
    describeAccount: (account: TwitchAccountConfig | undefined) => ({
      accountId: DEFAULT_ACCOUNT_ID,
      enabled: account?.enabled !== false,
      configured: account ? isConfigured(account) : false,
    }),
  },

  /** Outbound message adapter */
  outbound: twitchOutbound,

  /** Message actions adapter */
  actions: twitchMessageActions,

  /** Resolver adapter for username -> user ID resolution */
  resolver: {
    resolveTargets: async ({
      cfg,
      accountId,
      inputs,
      kind,
      runtime,
    }: {
      cfg: CoreConfig;
      accountId?: string | null;
      inputs: string[];
      kind: ChannelResolveKind;
      runtime: { log?: ProviderLogger };
    }): Promise<ChannelResolveResult[]> => {
      const account = getAccountConfig(cfg, accountId ?? DEFAULT_ACCOUNT_ID);

      if (!account) {
        return inputs.map((input) => ({
          input,
          resolved: false,
          note: "account not configured",
        }));
      }

      return await resolveTwitchTargets(inputs, account, kind, runtime?.log);
    },
  },

  /** Status monitoring adapter */
  status: {
    /** Default runtime state */
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },

    /** Build channel summary from snapshot */
    buildChannelSummary: ({
      snapshot,
    }: {
      snapshot: ChannelAccountSnapshot;
    }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
      probe: snapshot.probe,
      lastProbeAt: snapshot.lastProbeAt ?? null,
    }),

    /** Probe account connection */
    probeAccount: async ({
      account,
      timeoutMs,
    }: {
      account: TwitchAccountConfig;
      timeoutMs: number;
    }): Promise<unknown> => {
      return await probeTwitch(account, timeoutMs);
    },

    /** Build account snapshot with current status */
    buildAccountSnapshot: ({
      account,
      runtime,
      probe,
    }: {
      account: TwitchAccountConfig;
      cfg: CoreConfig;
      runtime?: ChannelAccountSnapshot;
      probe?: unknown;
    }): ChannelAccountSnapshot => {
      return {
        accountId: DEFAULT_ACCOUNT_ID,
        enabled: account?.enabled !== false,
        configured: isConfigured(account),
        running: runtime?.running ?? false,
        lastStartAt: runtime?.lastStartAt ?? null,
        lastStopAt: runtime?.lastStopAt ?? null,
        lastError: runtime?.lastError ?? null,
        probe,
      };
    },

    /** Collect status issues for all accounts */
    collectStatusIssues: collectTwitchStatusIssues,
  },

  /** Gateway adapter for connection lifecycle */
  gateway: {
    /** Start an account connection */
    startAccount: async (ctx): Promise<void> => {
      const account = ctx.account as TwitchAccountConfig;
      const accountId = ctx.accountId;

      // Create client manager
      const clientManager = new TwitchClientManager({
        info: (msg) => ctx.log?.info(`[twitch] ${msg}`),
        warn: (msg) => ctx.log?.warn(`[twitch] ${msg}`),
        error: (msg) => ctx.log?.error(`[twitch] ${msg}`),
        debug: (msg) => ctx.log?.debug?.(`[twitch] ${msg}`),
      });

      // Set up message handler
      clientManager.onMessage(account, (message) => {
        // Access control check
        const botUsername = account.username.toLowerCase();
        if (message.username.toLowerCase() === botUsername) {
          return; // Ignore own messages
        }

        const access = checkTwitchAccessControl({
          message,
          account,
          botUsername,
        });

        if (!access.allowed) {
          console.info(
            `[twitch] Ignored message from ${message.username}: ${access.reason ?? "blocked"}`,
          );
          return;
        }

        // TODO: Implement inbound message routing to Clawdbot
        // This requires integration with Clawdbot's message handling system
        console.info(
          `[twitch] Received message from ${message.username}: ${message.message}`,
        );
      });

      // Update status
      ctx.setStatus?.({
        accountId,
        running: true,
        lastStartAt: Date.now(),
        lastError: null,
      });

      ctx.log?.info(
        `[twitch] Starting Twitch connection for ${account.username}`,
      );

      try {
        await clientManager.getClient(account);
        ctx.log?.info(`[twitch] Connected to Twitch as ${account.username}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ctx.log?.error(`[twitch] Failed to connect: ${errorMsg}`);
        ctx.setStatus?.({
          accountId,
          running: false,
          lastError: errorMsg,
        });
        throw error;
      }
    },

    /** Stop an account connection */
    stopAccount: async (ctx): Promise<void> => {
      const account = ctx.account as TwitchAccountConfig;
      const accountId = ctx.accountId;

      // TODO: Implement client manager cleanup
      // This requires tracking client managers per account

      ctx.setStatus?.({
        accountId,
        running: false,
        lastStopAt: Date.now(),
      });

      ctx.log?.info(
        `[twitch] Stopped Twitch connection for ${account.username}`,
      );
    },
  },
};

/**
 * Extension entry point for registering the Twitch plugin with Clawdbot.
 *
 * @param api - Plugin API provided by Clawdbot
 */
export function registerTwitchPlugin(api: PluginAPI): void {
  api.registerChannel({ plugin: twitchPlugin });
  api.logger?.info("[twitch] Plugin registered");
}

/**
 * Default export for CommonJS compatibility.
 */
export default twitchPlugin;
