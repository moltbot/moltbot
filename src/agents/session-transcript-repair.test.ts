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

  // Tests for PR #4387: tool_use_id mismatch fix after history truncation
  describe("after history truncation", () => {
    it("repairs orphaned tool_use by inserting synthetic error result", () => {
      // Simulates truncation that removed the tool_result but kept the assistant tool_use
      const truncatedHistory = [
        {
          role: "assistant",
          content: [{ type: "toolCall", id: "call_1", name: "read", arguments: {} }],
        },
        { role: "user", content: "what did you find?" },
      ] satisfies AgentMessage[];

      const out = sanitizeToolUseResultPairing(truncatedHistory);

      // Should have inserted a synthetic error result after the assistant message
      expect(out).toHaveLength(3);
      expect(out[0]?.role).toBe("assistant");
      expect(out[1]?.role).toBe("toolResult");
      expect((out[1] as { toolCallId?: string }).toolCallId).toBe("call_1");
      expect((out[1] as { isError?: boolean }).isError).toBe(true);
      expect((out[1] as { content?: Array<{ text?: string }> }).content?.[0]?.text).toContain(
        "missing tool result",
      );
      expect(out[2]?.role).toBe("user");
    });

    it("drops orphaned tool_result that no longer has matching tool_use", () => {
      // Simulates truncation that removed the assistant tool_use but kept the tool_result
      const truncatedHistory = [
        { role: "user", content: "please read the file" },
        {
          role: "toolResult",
          toolCallId: "call_orphan",
          toolName: "read",
          content: [{ type: "text", text: "file contents" }],
          isError: false,
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "Here's what I found..." }],
        },
      ] satisfies AgentMessage[];

      const out = sanitizeToolUseResultPairing(truncatedHistory);

      // Orphaned tool_result should be dropped
      expect(out).toHaveLength(2);
      expect(out.map((m) => m.role)).toEqual(["user", "assistant"]);
      expect(out.some((m) => m.role === "toolResult")).toBe(false);
    });

    it("passes through normal history unchanged", () => {
      // Well-formed history with proper tool_use/tool_result pairing
      const normalHistory = [
        { role: "user", content: "please read the file" },
        {
          role: "assistant",
          content: [{ type: "toolCall", id: "call_1", name: "read", arguments: {} }],
        },
        {
          role: "toolResult",
          toolCallId: "call_1",
          toolName: "read",
          content: [{ type: "text", text: "file contents" }],
          isError: false,
        },
        {
          role: "assistant",
          content: [{ type: "text", text: "Here's what I found..." }],
        },
        { role: "user", content: "thanks!" },
      ] satisfies AgentMessage[];

      const out = sanitizeToolUseResultPairing(normalHistory);

      // Should return the same array reference (no modifications)
      expect(out).toBe(normalHistory);
      expect(out).toHaveLength(5);
      expect(out.map((m) => m.role)).toEqual([
        "user",
        "assistant",
        "toolResult",
        "assistant",
        "user",
      ]);
    });

    it("handles multiple orphaned tool_use blocks after truncation", () => {
      const truncatedHistory = [
        {
          role: "assistant",
          content: [
            { type: "toolCall", id: "call_1", name: "read", arguments: {} },
            { type: "toolCall", id: "call_2", name: "exec", arguments: {} },
          ],
        },
        { role: "user", content: "what happened?" },
      ] satisfies AgentMessage[];

      const out = sanitizeToolUseResultPairing(truncatedHistory);

      // Should insert synthetic results for both orphaned tool calls
      expect(out).toHaveLength(4);
      expect(out[0]?.role).toBe("assistant");
      expect(out[1]?.role).toBe("toolResult");
      expect((out[1] as { toolCallId?: string }).toolCallId).toBe("call_1");
      expect(out[2]?.role).toBe("toolResult");
      expect((out[2] as { toolCallId?: string }).toolCallId).toBe("call_2");
      expect(out[3]?.role).toBe("user");
    });

    it("repairs mixed scenario: some results present, some missing after truncation", () => {
      const truncatedHistory = [
        {
          role: "assistant",
          content: [
            { type: "toolCall", id: "call_1", name: "read", arguments: {} },
            { type: "toolCall", id: "call_2", name: "exec", arguments: {} },
          ],
        },
        {
          role: "toolResult",
          toolCallId: "call_1",
          toolName: "read",
          content: [{ type: "text", text: "contents" }],
          isError: false,
        },
        // call_2's result was truncated away
        { role: "user", content: "ok" },
      ] satisfies AgentMessage[];

      const out = sanitizeToolUseResultPairing(truncatedHistory);

      // Should keep existing result and insert synthetic result for missing one
      expect(out).toHaveLength(4);
      expect(out[0]?.role).toBe("assistant");
      expect(out[1]?.role).toBe("toolResult");
      expect((out[1] as { toolCallId?: string }).toolCallId).toBe("call_1");
      expect((out[1] as { isError?: boolean }).isError).toBe(false);
      expect(out[2]?.role).toBe("toolResult");
      expect((out[2] as { toolCallId?: string }).toolCallId).toBe("call_2");
      expect((out[2] as { isError?: boolean }).isError).toBe(true);
      expect(out[3]?.role).toBe("user");
    });
  });
});
