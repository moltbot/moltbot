import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Api, Model } from "@mariozechner/pi-ai";

/**
 * Providers like Kimi K2.5 stream thinking via `reasoning_content` but require
 * that field to be present on **every** assistant message when thinking is enabled —
 * including tool-call-only messages that have no thinking blocks.
 *
 * Pi-ai only adds `reasoning_content` to assistant messages that contain thinking blocks.
 * This wrapper intercepts the serialized API payload via `onPayload` and ensures every
 * assistant message includes the reasoning field when any message in the conversation uses it.
 */

/** Well-known reasoning field names used by OpenAI-compatible providers. */
const REASONING_FIELDS = ["reasoning_content", "reasoning", "reasoning_text"];

/** Model IDs that always require reasoning_content on all assistant messages. */
const ALWAYS_REASONING_MODEL_HINTS = ["kimi-k2.5", "kimi-k2-5", "kimi-k25"];

type ApiMessage = Record<string, unknown> & { role?: string };

function detectReasoningField(messages: ApiMessage[]): string | null {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const field of REASONING_FIELDS) {
      if (field in msg && msg[field] !== undefined) {
        return field;
      }
    }
  }
  return null;
}

function requiresAlwaysReasoning(modelId: string | undefined): boolean {
  if (!modelId) return false;
  const lower = modelId.toLowerCase();
  return ALWAYS_REASONING_MODEL_HINTS.some((hint) => lower.includes(hint));
}

function ensureReasoningFieldPresent(messages: ApiMessage[], field: string): void {
  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    if (!(field in msg) || msg[field] === undefined) {
      msg[field] = "";
    }
  }
}

/**
 * Check if the payload indicates thinking/reasoning is enabled.
 * When the API request includes reasoning params, every assistant message
 * MUST have reasoning_content — regardless of model ID detection.
 */
function payloadHasThinkingEnabled(params: Record<string, unknown>): boolean {
  // OpenAI-style reasoning_effort (e.g. "high", "medium", "low")
  if (params.reasoning_effort) return true;
  // Z.ai / Kimi style thinking: { type: "enabled" }
  const thinking = params.thinking;
  if (
    thinking &&
    typeof thinking === "object" &&
    (thinking as Record<string, unknown>).type === "enabled"
  ) {
    return true;
  }
  return false;
}

/** @internal Exported for testing only. */
export function patchReasoningContentCompat(
  params: Record<string, unknown>,
  modelId?: string,
): void {
  const messages = params.messages;
  if (!Array.isArray(messages)) return;

  const field = detectReasoningField(messages as ApiMessage[]);
  if (field) {
    ensureReasoningFieldPresent(messages as ApiMessage[], field);
    return;
  }

  // For models that always require reasoning_content (e.g. Kimi K2.5),
  // add it even when no prior message has it yet (first interaction).
  // Also trigger when the payload itself has thinking/reasoning params enabled —
  // this is a safety net in case model ID detection misses.
  if (requiresAlwaysReasoning(modelId) || payloadHasThinkingEnabled(params)) {
    ensureReasoningFieldPresent(messages as ApiMessage[], "reasoning_content");
  }
}

/**
 * Wrap a streamFn to patch serialized API payloads so that every assistant message
 * includes the detected reasoning field (e.g. `reasoning_content`).
 */
export function wrapStreamFnForReasoningCompat(baseStreamFn: StreamFn): StreamFn {
  const wrapped: StreamFn = (model, context, options) => {
    const modelId = (model as Model<Api>)?.id;
    const patchingOnPayload = (payload: unknown) => {
      if (payload && typeof payload === "object") {
        patchReasoningContentCompat(payload as Record<string, unknown>, modelId);
      }
      options?.onPayload?.(payload);
    };
    return baseStreamFn(model as Model<Api>, context, {
      ...options,
      onPayload: patchingOnPayload,
    });
  };
  return wrapped;
}
