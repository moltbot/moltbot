import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import { sanitizeToolUseResultPairing } from "./session-transcript-repair.js";

describe("sanitizeToolUseResultPairing", () => {
  it("moves tool results directly after tool calls and inserts missing results", () => {
    const input = [
      {
        role: "assistant",
        content: [
          { type: "toolCall", id: "call_1", name: "read", arguments: {} },
          { type: "toolCall", id: "call_2", name: "exec", arguments: {} },
        ],
      },
      { role: "user", content: "user message that should come after tool use" },
      {
        role: "toolResult",
        toolCallId: "call_2",
        toolName: "exec",
        content: [{ type: "text", text: "ok" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);
    expect(out[0]?.role).toBe("assistant");
    expect(out[1]?.role).toBe("toolResult");
    expect((out[1] as { toolCallId?: string }).toolCallId).toBe("call_1");
    expect(out[2]?.role).toBe("toolResult");
    expect((out[2] as { toolCallId?: string }).toolCallId).toBe("call_2");
    expect(out[3]?.role).toBe("user");
  });

  it("drops duplicate tool results for the same id within a span", () => {
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "read", arguments: {} }],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "first" }],
        isError: false,
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "second" }],
        isError: false,
      },
      { role: "user", content: "ok" },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);
    expect(out.filter((m) => m.role === "toolResult")).toHaveLength(1);
  });

  it("drops duplicate tool results for the same id across the transcript", () => {
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "read", arguments: {} }],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "first" }],
        isError: false,
      },
      { role: "assistant", content: [{ type: "text", text: "ok" }] },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "second (duplicate)" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);
    const results = out.filter((m) => m.role === "toolResult") as Array<{
      toolCallId?: string;
    }>;
    expect(results).toHaveLength(1);
    expect(results[0]?.toolCallId).toBe("call_1");
  });

  it("drops orphan tool results that do not match any tool call", () => {
    const input = [
      { role: "user", content: "hello" },
      {
        role: "toolResult",
        toolCallId: "call_orphan",
        toolName: "read",
        content: [{ type: "text", text: "orphan" }],
        isError: false,
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "ok" }],
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);
    expect(out.some((m) => m.role === "toolResult")).toBe(false);
    expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("deduplicates tool_use IDs across assistant messages", () => {
    // This test ensures that duplicate tool_use IDs in different assistant messages
    // are remapped to unique IDs (Anthropic requires unique tool_use IDs)
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "read", arguments: {} }],
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "first result" }],
        isError: false,
      },
      { role: "user", content: "do it again" },
      {
        role: "assistant",
        content: [{ type: "toolCall", id: "call_1", name: "read", arguments: {} }], // Duplicate ID
      },
      {
        role: "toolResult",
        toolCallId: "call_1",
        toolName: "read",
        content: [{ type: "text", text: "second result" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);

    // Both tool calls should exist but with unique IDs
    const assistants = out.filter((m) => m.role === "assistant") as Array<{
      content?: Array<{ type?: string; id?: string }>;
    }>;
    expect(assistants).toHaveLength(2);

    const firstToolCallId = assistants[0]?.content?.[0]?.id;
    const secondToolCallId = assistants[1]?.content?.[0]?.id;

    // First ID should remain unchanged
    expect(firstToolCallId).toBe("call_1");
    // Second ID should be remapped to be unique
    expect(secondToolCallId).not.toBe("call_1");
    expect(secondToolCallId).toBe("call_1_2");

    // Tool results should have matching IDs
    const results = out.filter((m) => m.role === "toolResult") as Array<{
      toolCallId?: string;
    }>;
    expect(results).toHaveLength(2);
    expect(results[0]?.toolCallId).toBe(firstToolCallId);
    expect(results[1]?.toolCallId).toBe(secondToolCallId);
  });

  it("handles toolUse type blocks with duplicate IDs", () => {
    const input = [
      {
        role: "assistant",
        content: [{ type: "toolUse", id: "toolu_1", name: "exec", input: {} }],
      },
      {
        role: "toolResult",
        toolCallId: "toolu_1",
        toolName: "exec",
        content: [{ type: "text", text: "ok" }],
        isError: false,
      },
      { role: "user", content: "again" },
      {
        role: "assistant",
        content: [{ type: "toolUse", id: "toolu_1", name: "exec", input: {} }], // Duplicate
      },
      {
        role: "toolResult",
        toolCallId: "toolu_1",
        toolName: "exec",
        content: [{ type: "text", text: "ok again" }],
        isError: false,
      },
    ] satisfies AgentMessage[];

    const out = sanitizeToolUseResultPairing(input);

    const assistants = out.filter((m) => m.role === "assistant") as Array<{
      content?: Array<{ type?: string; id?: string }>;
    }>;
    const ids = assistants.map((a) => a.content?.[0]?.id);

    // All IDs should be unique
    expect(new Set(ids).size).toBe(ids.length);
  });
});
