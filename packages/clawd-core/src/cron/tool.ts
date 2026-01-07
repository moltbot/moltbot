import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";
import { normalizeCronJobCreate, normalizeCronJobPatch } from "./normalize.js";
import type { CronService } from "./service.js";

const stringEnum = (
  values: readonly string[],
  options?: Parameters<typeof Type.Union>[1],
) =>
  Type.Union(
    values.map((value) => Type.Literal(value)) as [
      ReturnType<typeof Type.Literal>,
      ...ReturnType<typeof Type.Literal>[],
    ],
    options,
  );

const cronToolSchema = Type.Object({
  action: stringEnum(
    ["status", "list", "add", "update", "remove", "run", "wake"] as const,
    { description: "Cron action to perform" },
  ),
  id: Type.Optional(
    Type.String({ description: "Job ID for update/remove/run actions" }),
  ),
  job: Type.Optional(
    Type.Object(
      {},
      {
        additionalProperties: true,
        description: "Job definition for add action",
      },
    ),
  ),
  patch: Type.Optional(
    Type.Object(
      {},
      { additionalProperties: true, description: "Patch for update action" },
    ),
  ),
  includeDisabled: Type.Optional(
    Type.Boolean({ description: "Include disabled jobs in list" }),
  ),
  text: Type.Optional(Type.String({ description: "Text for wake action" })),
  mode: Type.Optional(
    stringEnum(["now", "next-heartbeat"] as const, {
      description: "Wake mode",
    }),
  ),
});

function jsonResult(data: unknown): {
  content: Array<{ type: "text"; text: string }>;
  details: unknown;
} {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    details: data,
  };
}

function readStringParam(
  params: Record<string, unknown>,
  key: string,
  opts?: { required?: boolean; trim?: boolean },
): string | undefined {
  const value = params[key];
  if (typeof value !== "string") {
    if (opts?.required) throw new Error(`${key} is required`);
    return undefined;
  }
  return opts?.trim !== false ? value.trim() : value;
}

export type CronToolDeps = {
  cronService: CronService;
};

/**
 * Create a cron management tool for the agent
 */
export function createCronTool(
  deps: CronToolDeps,
): AgentTool<typeof cronToolSchema> {
  return {
    name: "cron",
    label: "Cron",
    description:
      "Manage cron jobs (status/list/add/update/remove/run) and send wake events.",
    parameters: cronToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const service = deps.cronService;

      switch (action) {
        case "status":
          return jsonResult(await service.status());

        case "list":
          return jsonResult(
            await service.list({
              includeDisabled: Boolean(params.includeDisabled),
            }),
          );

        case "add": {
          if (!params.job || typeof params.job !== "object") {
            throw new Error("job is required");
          }
          const job = normalizeCronJobCreate(params.job) ?? params.job;
          return jsonResult(
            await service.add(job as Parameters<typeof service.add>[0]),
          );
        }

        case "update": {
          const id = readStringParam(params, "id", { required: true });
          if (!id) throw new Error("id is required");
          if (!params.patch || typeof params.patch !== "object") {
            throw new Error("patch is required");
          }
          const patch = normalizeCronJobPatch(params.patch) ?? params.patch;
          return jsonResult(
            await service.update(
              id,
              patch as Parameters<typeof service.update>[1],
            ),
          );
        }

        case "remove": {
          const id = readStringParam(params, "id", { required: true });
          if (!id) throw new Error("id is required");
          return jsonResult(await service.remove(id));
        }

        case "run": {
          const id = readStringParam(params, "id", { required: true });
          if (!id) throw new Error("id is required");
          return jsonResult(await service.run(id, "force"));
        }

        case "wake": {
          const text = readStringParam(params, "text", { required: true });
          if (!text) throw new Error("text is required");
          const mode =
            params.mode === "now" || params.mode === "next-heartbeat"
              ? params.mode
              : "next-heartbeat";
          return jsonResult(service.wake({ mode, text }));
        }

        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}
