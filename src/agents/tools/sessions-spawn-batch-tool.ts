import { Type } from "@sinclair/typebox";

import type { GatewayMessageChannel } from "../../utils/message-channel.js";
import { optionalStringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { jsonResult } from "./common.js";
import {
  resolveSpawnContext,
  spawnSingleSubagent,
  type SpawnOpts,
  type SpawnResult,
} from "./sessions-spawn-core.js";

const MAX_BATCH_TASKS = 10;

const SessionsSpawnBatchToolSchema = Type.Object({
  tasks: Type.Array(
    Type.Object({
      task: Type.String(),
      label: Type.Optional(Type.String()),
      model: Type.Optional(Type.String()),
      thinking: Type.Optional(Type.String()),
      runTimeoutSeconds: Type.Optional(Type.Number({ minimum: 0 })),
      cleanup: optionalStringEnum(["delete", "keep"] as const),
    }),
    { minItems: 1, maxItems: MAX_BATCH_TASKS },
  ),
});

export type BatchSpawnResultEntry = {
  label?: string;
  index: number;
} & SpawnResult;

export function createSessionsSpawnBatchTool(opts?: {
  agentSessionKey?: string;
  agentChannel?: GatewayMessageChannel;
  agentAccountId?: string;
  agentTo?: string;
  agentThreadId?: string | number;
  agentGroupId?: string | null;
  agentGroupChannel?: string | null;
  agentGroupSpace?: string | null;
  sandboxed?: boolean;
  requesterAgentIdOverride?: string;
}): AnyAgentTool {
  return {
    label: "Sessions",
    name: "sessions_spawn_batch",
    description:
      "Spawn multiple background sub-agent runs in parallel. Each task runs in an isolated session. Results are announced back to the requester chat.",
    parameters: SessionsSpawnBatchToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const rawTasks = params.tasks;
      if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
        return jsonResult({
          status: "error",
          error: "tasks array is required and must not be empty",
        });
      }
      if (rawTasks.length > MAX_BATCH_TASKS) {
        return jsonResult({
          status: "error",
          error: `Too many tasks: ${rawTasks.length} exceeds maximum of ${MAX_BATCH_TASKS}`,
        });
      }

      const spawnOpts: SpawnOpts = {
        agentSessionKey: opts?.agentSessionKey,
        agentChannel: opts?.agentChannel,
        agentAccountId: opts?.agentAccountId,
        agentTo: opts?.agentTo,
        agentThreadId: opts?.agentThreadId,
        agentGroupId: opts?.agentGroupId,
        agentGroupChannel: opts?.agentGroupChannel,
        agentGroupSpace: opts?.agentGroupSpace,
        sandboxed: opts?.sandboxed,
        requesterAgentIdOverride: opts?.requesterAgentIdOverride,
      };

      const ctx = resolveSpawnContext(spawnOpts);
      if (ctx.forbidden) {
        return jsonResult({ status: "forbidden", error: ctx.error });
      }

      const settled = await Promise.allSettled(
        rawTasks.map(async (entry, index) => {
          const t = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {};
          const task = typeof t.task === "string" ? t.task.trim() : "";
          if (!task) throw new Error(`tasks[${index}].task is required`);

          const label = typeof t.label === "string" ? t.label.trim() : "";
          const model = typeof t.model === "string" ? t.model.trim() || undefined : undefined;
          const thinking =
            typeof t.thinking === "string" ? t.thinking.trim() || undefined : undefined;
          const runTimeoutSeconds =
            typeof t.runTimeoutSeconds === "number" && Number.isFinite(t.runTimeoutSeconds)
              ? Math.max(0, Math.floor(t.runTimeoutSeconds))
              : 0;
          const cleanup =
            t.cleanup === "keep" || t.cleanup === "delete"
              ? (t.cleanup as "keep" | "delete")
              : "keep";

          const result = await spawnSingleSubagent(
            { task, label, model, thinking, runTimeoutSeconds, cleanup },
            ctx,
          );

          return { ...result, label: label || undefined, index } as BatchSpawnResultEntry;
        }),
      );

      const results: BatchSpawnResultEntry[] = settled.map((outcome, index) => {
        if (outcome.status === "fulfilled") return outcome.value;
        const error =
          outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
        return { status: "error" as const, error, index };
      });

      const accepted = results.filter((r) => r.status === "accepted").length;
      const failed = results.length - accepted;

      return jsonResult({
        status: failed === 0 ? "accepted" : accepted === 0 ? "error" : "partial",
        total: results.length,
        accepted,
        failed,
        results,
      });
    },
  };
}
