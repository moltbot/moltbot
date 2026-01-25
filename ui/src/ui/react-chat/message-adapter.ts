/**
 * Message format adapter for converting between Clawdbot's message format
 * and assistant-ui's ThreadMessageLike format.
 */

import type { ThreadMessageLike } from "@assistant-ui/react";

/**
 * Raw message format from the gateway.
 */
export type RawMessage = {
  role?: string;
  content?: string | Array<ContentItem>;
  text?: string;
  timestamp?: number;
  id?: string;
  toolCallId?: string;
  tool_call_id?: string;
  toolName?: string;
  tool_name?: string;
};

type ContentItem = {
  type?: string;
  text?: string;
  name?: string;
  args?: unknown;
  arguments?: unknown;
};

/**
 * Extract the role from a raw message, normalizing tool-related roles.
 */
function extractRole(message: RawMessage): "user" | "assistant" | "system" {
  const role = message.role?.toLowerCase() ?? "unknown";

  // Tool result messages are treated as assistant messages in assistant-ui
  if (
    role === "toolresult" ||
    role === "tool_result" ||
    role === "tool" ||
    role === "function" ||
    message.toolCallId ||
    message.tool_call_id
  ) {
    return "assistant";
  }

  if (role === "user") return "user";
  if (role === "system") return "system";
  return "assistant";
}

/**
 * Extract text content from a raw message.
 */
function extractTextContent(message: RawMessage): string {
  if (typeof message.content === "string") {
    return message.content;
  }

  if (Array.isArray(message.content)) {
    return message.content
      .filter((item) => item.type === "text" || !item.type)
      .map((item) => item.text ?? "")
      .join("");
  }

  if (typeof message.text === "string") {
    return message.text;
  }

  return "";
}

/**
 * Check if a message contains tool calls.
 */
function hasToolCalls(message: RawMessage): boolean {
  if (!Array.isArray(message.content)) return false;
  return message.content.some((item) => {
    const type = item.type?.toLowerCase();
    return (
      type === "toolcall" ||
      type === "tool_call" ||
      type === "tooluse" ||
      type === "tool_use" ||
      (item.name && item.args !== undefined)
    );
  });
}

/**
 * Check if a message is a tool result.
 */
function isToolResult(message: RawMessage): boolean {
  const role = message.role?.toLowerCase();
  return (
    role === "toolresult" ||
    role === "tool_result" ||
    Boolean(message.toolCallId) ||
    Boolean(message.tool_call_id)
  );
}

/**
 * Extract tool calls from a message.
 */
function extractToolCalls(message: RawMessage): Array<{
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}> {
  if (!Array.isArray(message.content)) return [];

  const toolCalls: Array<{
    toolCallId: string;
    toolName: string;
    args: Record<string, unknown>;
  }> = [];

  for (const item of message.content) {
    const type = item.type?.toLowerCase();
    const isToolCall =
      type === "toolcall" ||
      type === "tool_call" ||
      type === "tooluse" ||
      type === "tool_use" ||
      (item.name && (item.args !== undefined || item.arguments !== undefined));

    if (isToolCall && item.name) {
      const rawArgs = item.args ?? item.arguments ?? {};
      const args =
        typeof rawArgs === "string" ? tryParseJson(rawArgs) : rawArgs;

      toolCalls.push({
        toolCallId: `tool-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        toolName: item.name,
        args: typeof args === "object" && args !== null ? args : {},
      });
    }
  }

  return toolCalls;
}

function tryParseJson(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return {};
  }
}

/**
 * Convert a raw gateway message to assistant-ui's ThreadMessageLike format.
 */
export function convertMessage(message: RawMessage): ThreadMessageLike {
  const role = extractRole(message);
  const text = extractTextContent(message);
  const timestamp = message.timestamp ? new Date(message.timestamp) : new Date();
  const id = message.id ?? `msg-${timestamp.getTime()}-${Math.random().toString(36).slice(2)}`;

  // User messages are simple text
  if (role === "user") {
    return {
      role: "user",
      content: [{ type: "text", text }],
      id,
      createdAt: timestamp,
    };
  }

  // System messages
  if (role === "system") {
    return {
      role: "system",
      content: [{ type: "text", text }],
      id,
      createdAt: timestamp,
    };
  }

  // Assistant messages may have tool calls
  const toolCalls = extractToolCalls(message);
  const content: ThreadMessageLike["content"] = [];

  if (text) {
    content.push({ type: "text", text });
  }

  for (const toolCall of toolCalls) {
    content.push({
      type: "tool-call",
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      args: toolCall.args,
    });
  }

  // If this is a tool result message, we need to handle it differently
  if (isToolResult(message)) {
    const toolCallId = message.toolCallId ?? message.tool_call_id ?? `result-${id}`;
    return {
      role: "assistant",
      content: [
        {
          type: "tool-call",
          toolCallId,
          toolName: message.toolName ?? message.tool_name ?? "tool",
          args: {},
          result: text,
        },
      ],
      id,
      createdAt: timestamp,
    };
  }

  // Regular assistant message
  if (content.length === 0) {
    content.push({ type: "text", text: "" });
  }

  return {
    role: "assistant",
    content,
    id,
    createdAt: timestamp,
  };
}

/**
 * Convert an array of raw messages to assistant-ui format.
 */
export function convertMessages(messages: unknown[]): ThreadMessageLike[] {
  return messages
    .filter((msg): msg is RawMessage => msg != null && typeof msg === "object")
    .map(convertMessage);
}
