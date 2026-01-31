import fs from "node:fs/promises";
import path from "node:path";

import type { AgentTool } from "@mariozechner/pi-agent-core";
import { Type } from "@sinclair/typebox";

import { assertSandboxPath } from "./sandbox-paths.js";

const EditItemSchema = Type.Object({
  oldString: Type.String({ description: "Text to find and replace" }),
  newString: Type.String({ description: "Replacement text" }),
  replaceAll: Type.Optional(
    Type.Boolean({ description: "Replace all occurrences (default: false)" }),
  ),
});

const MultiEditSchema = Type.Object({
  filePath: Type.String({ description: "Path to the file to edit" }),
  edits: Type.Array(EditItemSchema, {
    description: "List of edits to apply sequentially",
    minItems: 1,
  }),
});

export type MultiEditResult = {
  filePath: string;
  appliedEdits: number;
  failedEdits: { index: number; reason: string }[];
};

type MultiEditParams = {
  filePath: string;
  edits: Array<{ oldString: string; newString: string; replaceAll?: boolean }>;
};

export function createMultiEditTool(
  options: { cwd?: string; sandboxRoot?: string } = {},
  // biome-ignore lint/suspicious/noExplicitAny: TypeBox schema type compatibility
): AgentTool<any, MultiEditResult> {
  const cwd = options.cwd ?? process.cwd();
  const sandboxRoot = options.sandboxRoot;

  return {
    name: "multi_edit",
    label: "Multi Edit",
    description:
      "Apply multiple find-and-replace edits to a single file atomically. " +
      "Edits are applied sequentially; each edit operates on the result of the previous one. " +
      "If any edit fails to find its oldString, it is skipped and reported in failedEdits.",
    parameters: MultiEditSchema,
    execute: async (_toolCallId, args, signal) => {
      const params = args as MultiEditParams;
      const { filePath, edits } = params;

      if (!filePath || typeof filePath !== "string") {
        throw new Error("filePath is required");
      }
      if (!Array.isArray(edits) || edits.length === 0) {
        throw new Error("edits array must contain at least one edit");
      }

      const resolved = path.resolve(cwd, filePath);
      if (sandboxRoot) {
        await assertSandboxPath({ filePath: resolved, cwd, root: sandboxRoot });
      }

      let content: string;
      try {
        content = await fs.readFile(resolved, "utf-8");
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "ENOENT") {
          throw new Error(`File not found: ${filePath}`, { cause: err });
        }
        throw err;
      }

      const failedEdits: { index: number; reason: string }[] = [];
      let appliedEdits = 0;

      for (let i = 0; i < edits.length; i++) {
        if (signal?.aborted) {
          const err = new Error("Aborted");
          err.name = "AbortError";
          throw err;
        }

        const edit = edits[i];
        const { oldString, newString, replaceAll } = edit;

        if (typeof oldString !== "string" || typeof newString !== "string") {
          failedEdits.push({
            index: i,
            reason: "Invalid edit: oldString and newString must be strings",
          });
          continue;
        }

        if (oldString === newString) {
          failedEdits.push({ index: i, reason: "oldString and newString are identical (no-op)" });
          continue;
        }

        if (!content.includes(oldString)) {
          const preview = oldString.length > 50 ? `${oldString.slice(0, 50)}...` : oldString;
          failedEdits.push({ index: i, reason: `oldString not found: "${preview}"` });
          continue;
        }

        content = replaceAll
          ? content.replaceAll(oldString, newString)
          : content.replace(oldString, newString);
        appliedEdits++;
      }

      if (appliedEdits === 0) {
        throw new Error(
          `All ${edits.length} edits failed:\n${failedEdits.map((e) => `  [${e.index}] ${e.reason}`).join("\n")}`,
        );
      }

      await fs.writeFile(resolved, content, "utf-8");

      const summary =
        failedEdits.length > 0
          ? `Applied ${appliedEdits}/${edits.length} edits to ${filePath}. Failed: ${failedEdits.length}`
          : `Applied ${appliedEdits} edits to ${filePath}`;

      return {
        content: [{ type: "text", text: summary }],
        details: { filePath, appliedEdits, failedEdits },
      };
    },
  };
}
