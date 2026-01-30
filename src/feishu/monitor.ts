/**
 * Feishu channel monitoring
 * @module feishu/monitor
 */

import type * as lark from "@larksuiteoapi/node-sdk";

import type { OpenClawConfig } from "../config/config.js";
import { logVerbose } from "../globals.js";
import type { RuntimeEnv } from "../runtime.js";

import { listFeishuAccountIds, resolveFeishuAccount } from "./accounts.js";
import { createFeishuBotFromAccount } from "./bot.js";
import type { FeishuInboundContext, ResolvedFeishuAccount } from "./types.js";
import { probeFeishuBot } from "./probe.js";

export interface FeishuProviderState {
  accountId: string;
  enabled: boolean;
  connected: boolean;
  lastProbe?: {
    timestamp: number;
    success: boolean;
    error?: string;
  };
  botInfo?: {
    appName?: string;
    openId?: string;
  };
}

export interface FeishuRuntimeState {
  accounts: Map<string, FeishuProviderState>;
  clients: Map<string, lark.Client>;
}

// Global runtime state
let runtimeState: FeishuRuntimeState | undefined;

/**
 * Get the current Feishu runtime state
 */
export function getFeishuRuntimeState(): FeishuRuntimeState | undefined {
  return runtimeState;
}

/**
 * Get Feishu client for an account
 */
export function getFeishuClient(accountId: string): lark.Client | undefined {
  return runtimeState?.clients.get(accountId);
}

/**
 * Get account state
 */
export function getFeishuAccountState(accountId: string): FeishuProviderState | undefined {
  return runtimeState?.accounts.get(accountId);
}

export interface MonitorFeishuProviderOptions {
  cfg: OpenClawConfig;
  runtime?: RuntimeEnv;
  /** Callback for incoming messages */
  onMessage?: (ctx: FeishuInboundContext) => Promise<void>;
  /** Whether to use long connection mode */
  useLongConnection?: boolean;
  /** Probe interval in ms (default: 5 minutes) */
  probeIntervalMs?: number;
}

export interface FeishuProviderMonitor {
  /** Stop monitoring */
  stop: () => void;
  /** Get current state */
  getState: () => FeishuRuntimeState;
  /** Get account by ID */
  getAccount: (accountId: string) => ResolvedFeishuAccount | undefined;
  /** Probe all accounts */
  probeAll: () => Promise<void>;
}

/**
 * Monitor Feishu provider - initialize and manage bot connections
 */
export async function monitorFeishuProvider(
  options: MonitorFeishuProviderOptions,
): Promise<FeishuProviderMonitor> {
  const {
    cfg,
    runtime = {
      log: console.log,
      error: console.error,
      exit: () => {
        throw new Error("exit");
      },
    },
    onMessage,
    useLongConnection = false,
    probeIntervalMs = 5 * 60 * 1000, // 5 minutes
  } = options;

  // Initialize runtime state
  runtimeState = {
    accounts: new Map(),
    clients: new Map(),
  };

  const accountIds = listFeishuAccountIds(cfg);
  const resolvedAccounts = new Map<string, ResolvedFeishuAccount>();

  if (accountIds.length === 0) {
    logVerbose("feishu: no accounts configured");
    return {
      stop: () => { },
      getState: () => runtimeState!,
      getAccount: () => undefined,
      probeAll: async () => { },
    };
  }

  logVerbose(`feishu: initializing ${accountIds.length} account(s)...`);

  // Initialize each account
  for (const accountId of accountIds) {
    try {
      const account = resolveFeishuAccount({ cfg, accountId });
      resolvedAccounts.set(accountId, account);

      if (!account.enabled) {
        logVerbose(`feishu: account "${accountId}" is disabled`);
        runtimeState.accounts.set(accountId, {
          accountId,
          enabled: false,
          connected: false,
        });
        continue;
      }

      // Create bot instance
      const bot = createFeishuBotFromAccount(account, {
        runtime,
        config: cfg,
        onMessage,
      });

      // Store client
      runtimeState.clients.set(accountId, bot.client);

      // Initialize account state
      runtimeState.accounts.set(accountId, {
        accountId,
        enabled: true,
        connected: false,
      });

      // Start long connection if enabled
      if ((useLongConnection || account.config.useLongConnection) && bot.startLongConnection) {
        try {
          await bot.startLongConnection();
          runtimeState.accounts.get(accountId)!.connected = true;
          logVerbose(`feishu: long connection established for "${accountId}"`);
        } catch (error) {
          console.error(`feishu: failed to start long connection for "${accountId}": ${error}`);
        }
      }

      // Initial probe
      const probeResult = await probeFeishuBot(account);
      const state = runtimeState.accounts.get(accountId)!;
      state.lastProbe = {
        timestamp: Date.now(),
        success: probeResult.ok,
        error: probeResult.error,
      };
      state.connected = probeResult.ok;
      if (probeResult.bot) {
        state.botInfo = {
          appName: probeResult.bot.appName,
          openId: probeResult.bot.openId,
        };
      }

      logVerbose(`feishu: account "${accountId}" initialized (connected: ${probeResult.ok})`);
    } catch (error) {
      console.error(`feishu: failed to initialize account "${accountId}": ${error}`);
      runtimeState.accounts.set(accountId, {
        accountId,
        enabled: true,
        connected: false,
        lastProbe: {
          timestamp: Date.now(),
          success: false,
          error: String(error),
        },
      });
    }
  }

  // Set up periodic probing
  let probeInterval: NodeJS.Timeout | undefined;

  const probeAll = async () => {
    for (const [accountId, account] of resolvedAccounts) {
      if (!account.enabled) continue;

      try {
        const result = await probeFeishuBot(account);
        const state = runtimeState!.accounts.get(accountId);
        if (state) {
          state.lastProbe = {
            timestamp: Date.now(),
            success: result.ok,
            error: result.error,
          };
          state.connected = result.ok;
        }
      } catch (error) {
        console.warn(`feishu: probe failed for "${accountId}": ${error}`);
      }
    }
  };

  if (probeIntervalMs > 0) {
    probeInterval = setInterval(probeAll, probeIntervalMs);
  }

  return {
    stop: () => {
      if (probeInterval) {
        clearInterval(probeInterval);
      }
      runtimeState = undefined;
    },
    getState: () => runtimeState!,
    getAccount: (accountId: string) => resolvedAccounts.get(accountId),
    probeAll,
  };
}
