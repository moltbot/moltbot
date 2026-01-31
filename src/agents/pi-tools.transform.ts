/**
 * Tool Result Transform Wrapper
 *
 * Wraps agent tools to call the tool_result_transform hook after execution,
 * allowing plugins to PREPEND content (like warnings) to tool results before
 * they are sent to the model.
 *
 * Security properties:
 * - Append-only: hooks can only ADD content, never remove original content
 * - Timeout: hung hooks are killed after a deadline
 * - Validation: malformed results are rejected
 * - Isolation: hook failures don't break tool execution
 */

import type { AgentToolResult } from "@mariozechner/pi-agent-core";

import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";
import type { AnyAgentTool } from "./pi-tools.types.js";

/** Default timeout for transform hooks (ms) */
const TRANSFORM_HOOK_TIMEOUT_MS = 5000;

export type ToolTransformContext = {
  agentId?: string;
  sessionKey?: string;
};

type ContentBlock = { type: string; [key: string]: unknown };

/**
 * Validate that content is a valid array of content blocks.
 */
function isValidContentArray(content: unknown): content is ContentBlock[] {
  if (!Array.isArray(content)) return false;
  for (const block of content) {
    if (typeof block !== "object" || block === null) return false;
    if (typeof (block as Record<string, unknown>).type !== "string") return false;
  }
  return true;
}

/**
 * Extract text from content blocks for size estimation.
 */
function estimateContentSize(content: ContentBlock[]): number {
  let size = 0;
  for (const block of content) {
    if (block.type === "text" && typeof block.text === "string") {
      size += block.text.length;
    }
  }
  return size;
}

/** Maximum size (chars) that a hook can prepend */
const MAX_PREPEND_SIZE = 10000;

/**
 * Wrap a promise with a timeout.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, timeoutError: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(timeoutError));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/**
 * Wrap a tool to apply the tool_result_transform hook after execution.
 *
 * Security model:
 * - Hooks return content to PREPEND (not replace)
 * - Original content is always preserved
 * - Hooks cannot see or modify each other's prepended content
 * - Timeout prevents hung hooks from blocking execution
 */
export function wrapToolWithResultTransform(
  tool: AnyAgentTool,
  ctx?: ToolTransformContext,
): AnyAgentTool {
  const execute = tool.execute;
  if (!execute) return tool;

  return {
    ...tool,
    execute: async (toolCallId, params, signal, onUpdate) => {
      // Execute the original tool
      const result = await execute(toolCallId, params, signal, onUpdate);

      // Check if we have transform hooks registered
      const hookRunner = getGlobalHookRunner();
      if (!hookRunner?.hasHooks("tool_result_transform")) {
        return result;
      }

      // Determine if the result is an error
      const isError = isToolResultError(result);

      try {
        // Run the transform hook with timeout
        const hookResult = await withTimeout(
          hookRunner.runToolResultTransform(
            {
              toolName: tool.name,
              toolCallId,
              params: params as Record<string, unknown>,
              // Pass a COPY of content so hooks can't mutate original
              result: JSON.parse(JSON.stringify(result.content)),
              isError,
            },
            {
              agentId: ctx?.agentId,
              sessionKey: ctx?.sessionKey,
              toolName: tool.name,
              toolCallId,
            },
          ),
          TRANSFORM_HOOK_TIMEOUT_MS,
          `tool_result_transform hook timed out after ${TRANSFORM_HOOK_TIMEOUT_MS}ms`,
        );

        // If hook returned content to prepend, validate and apply it
        if (hookResult?.prependContent !== undefined) {
          const prepend = hookResult.prependContent;

          // Validate: must be array of content blocks
          if (!isValidContentArray(prepend)) {
            console.warn(`[tool_result_transform] Invalid prependContent structure, ignoring`);
            return result;
          }

          // Validate: size limit to prevent DoS
          const prependSize = estimateContentSize(prepend);
          if (prependSize > MAX_PREPEND_SIZE) {
            console.warn(
              `[tool_result_transform] prependContent too large (${prependSize} > ${MAX_PREPEND_SIZE}), ignoring`,
            );
            return result;
          }

          // PREPEND hook content to original (original always preserved)
          const originalContent = Array.isArray(result.content) ? result.content : [result.content];

          return {
            ...result,
            content: [...prepend, ...originalContent] as AgentToolResult<unknown>["content"],
          };
        }
      } catch (err) {
        // Hook failure should not break tool execution
        console.error(
          `[tool_result_transform] Hook failed for ${tool.name}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      return result;
    },
  };
}

/**
 * Check if a tool result indicates an error.
 * Heuristic: look for error-like patterns in text content.
 */
function isToolResultError(result: AgentToolResult<unknown>): boolean {
  const content = result.content;
  if (!Array.isArray(content)) return false;

  for (const block of content) {
    if (block.type === "text" && "text" in block) {
      const text = (block as { type: "text"; text: string }).text;
      if (
        text.startsWith("Error:") ||
        text.startsWith("error:") ||
        text.includes('"error"') ||
        text.includes('"status": "error"')
      ) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Wrap multiple tools with result transform.
 */
export function wrapToolsWithResultTransform(
  tools: AnyAgentTool[],
  ctx?: ToolTransformContext,
): AnyAgentTool[] {
  return tools.map((tool) => wrapToolWithResultTransform(tool, ctx));
}
