import os from "node:os";
import path from "node:path";

import type { ClawdConfig } from "../config/types.js";
import { resolveUserPath } from "../utils/index.js";
import { CronService, type CronServiceDeps } from "./service.js";
import { getDefaultCronStorePath, resolveCronStorePath } from "./store.js";
import type { CronEvent, CronJob } from "./types.js";

export type CronRunnerDeps = {
  /**
   * Logger for cron operations
   */
  log: CronServiceDeps["log"];

  /**
   * Run an isolated agent job (for agentTurn payloads)
   */
  runIsolatedAgentJob?: (params: { job: CronJob; message: string }) => Promise<{
    status: "ok" | "error" | "skipped";
    summary?: string;
    error?: string;
  }>;

  /**
   * Called when a system event should be enqueued
   */
  onSystemEvent?: (text: string) => void;

  /**
   * Called when heartbeat should be triggered immediately
   */
  onHeartbeatRequest?: (opts?: { reason?: string }) => void;

  /**
   * Called when cron events occur
   */
  onCronEvent?: (evt: CronEvent) => void;

  /**
   * Custom time source (for testing)
   */
  nowMs?: () => number;
};

export type CronRunnerOptions = {
  config?: ClawdConfig;
  deps: CronRunnerDeps;
};

/**
 * Create and start a cron runner.
 *
 * The cron runner manages scheduled jobs and executes them according to their schedules.
 * It supports:
 * - One-shot jobs (run once at a specific time)
 * - Interval jobs (run every N milliseconds)
 * - Cron expression jobs (standard cron syntax with timezone support)
 *
 * @example
 * ```ts
 * const runner = await createCronRunner({
 *   config,
 *   deps: {
 *     log: console,
 *     onSystemEvent: (text) => console.log("System event:", text),
 *     runIsolatedAgentJob: async ({ job, message }) => {
 *       // Run the agent and return result
 *       return { status: "ok", summary: "Done" };
 *     },
 *   },
 * });
 *
 * // Add a job
 * await runner.service.add({
 *   name: "Daily check",
 *   schedule: { kind: "cron", expr: "0 9 * * *" },
 *   sessionTarget: "isolated",
 *   wakeMode: "now",
 *   payload: { kind: "agentTurn", message: "Good morning! Check my tasks." },
 * });
 *
 * // Stop when done
 * runner.stop();
 * ```
 */
export async function createCronRunner(options: CronRunnerOptions): Promise<{
  service: CronService;
  stop: () => void;
}> {
  const { config, deps } = options;

  // Resolve workspace directory
  const workspaceDir = config?.agent?.workspace
    ? resolveUserPath(config.agent.workspace)
    : path.join(os.homedir(), "clawd");

  // Resolve cron store path
  const configDir = path.join(workspaceDir, ".clawd");
  const storePath = config?.cron?.store
    ? resolveCronStorePath(config.cron.store, configDir)
    : getDefaultCronStorePath(configDir);

  // Determine if cron is enabled
  const cronEnabled =
    process.env.CLAWD_SKIP_CRON !== "1" && config?.cron?.enabled !== false;

  // Create cron service
  const service = new CronService({
    storePath,
    cronEnabled,
    log: deps.log,
    nowMs: deps.nowMs,

    enqueueSystemEvent: (text: string) => {
      deps.onSystemEvent?.(text);
    },

    requestHeartbeatNow: (opts?: { reason?: string }) => {
      deps.onHeartbeatRequest?.(opts);
    },

    runIsolatedAgentJob: async ({ job, message }) => {
      if (!deps.runIsolatedAgentJob) {
        return {
          status: "skipped" as const,
          summary: "No agent runner configured",
        };
      }
      return deps.runIsolatedAgentJob({ job, message });
    },

    onEvent: deps.onCronEvent,
  });

  // Start the service
  await service.start();

  return {
    service,
    stop: () => {
      service.stop();
    },
  };
}

/**
 * Resolve the default cron store path for a workspace
 */
export function resolveDefaultCronStorePath(workspaceDir: string): string {
  const configDir = path.join(workspaceDir, ".clawd");
  return getDefaultCronStorePath(configDir);
}
