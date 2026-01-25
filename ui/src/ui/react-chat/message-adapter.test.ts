import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convertMessage, convertMessages, type RawMessage } from "./message-adapter";

describe("message-adapter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T00:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("convertMessage", () => {
    it("converts user message with string content", () => {
      const result = convertMessage({
        role: "user",
        content: "Hello world",
        timestamp: 1000,
        id: "msg-1",
      });

      expect(result.role).toBe("user");
      expect(result.content).toEqual([{ type: "text", text: "Hello world" }]);
      expect(result.id).toBe("msg-1");
      expect(result.createdAt).toEqual(new Date(1000));
    });

    it("converts user message with text field", () => {
      const result = convertMessage({
        role: "user",
        text: "Alternative format",
        id: "msg-2",
      });

      expect(result.role).toBe("user");
      expect(result.content).toEqual([{ type: "text", text: "Alternative format" }]);
    });

    it("converts assistant message with string content", () => {
      const result = convertMessage({
        role: "assistant",
        content: "Here is my response",
        id: "msg-3",
      });

      expect(result.role).toBe("assistant");
      expect(result.content).toEqual([{ type: "text", text: "Here is my response" }]);
    });

    it("converts system message", () => {
      const result = convertMessage({
        role: "system",
        content: "System prompt",
        id: "msg-4",
      });

      expect(result.role).toBe("system");
      expect(result.content).toEqual([{ type: "text", text: "System prompt" }]);
    });

    it("converts assistant message with array content", () => {
      const result = convertMessage({
        role: "assistant",
        content: [
          { type: "text", text: "Let me help you" },
          { type: "text", text: " with that." },
        ],
        id: "msg-5",
      });

      expect(result.role).toBe("assistant");
      expect(result.content).toEqual([{ type: "text", text: "Let me help you with that." }]);
    });

    it("extracts tool calls from assistant message", () => {
      const result = convertMessage({
        role: "assistant",
        content: [
          { type: "text", text: "Running command" },
          { type: "tool_use", name: "bash", args: { command: "ls" } },
        ],
        id: "msg-6",
      });

      expect(result.role).toBe("assistant");
      expect(result.content).toHaveLength(2);
      expect(result.content[0]).toEqual({ type: "text", text: "Running command" });
      expect(result.content[1]).toMatchObject({
        type: "tool-call",
        toolName: "bash",
        args: { command: "ls" },
      });
    });

    it("handles tool_call type variation", () => {
      const result = convertMessage({
        role: "assistant",
        content: [{ type: "tool_call", name: "read", args: { path: "/tmp" } }],
        id: "msg-7",
      });

      expect(result.content[0]).toMatchObject({
        type: "tool-call",
        toolName: "read",
        args: { path: "/tmp" },
      });
    });

    it("handles tooluse type variation", () => {
      const result = convertMessage({
        role: "assistant",
        content: [{ type: "tooluse", name: "write", args: { content: "test" } }],
        id: "msg-8",
      });

      expect(result.content[0]).toMatchObject({
        type: "tool-call",
        toolName: "write",
      });
    });

    it("handles arguments field (alternative to args)", () => {
      const result = convertMessage({
        role: "assistant",
        content: [{ type: "tool_use", name: "test", arguments: { foo: "bar" } }],
        id: "msg-9",
      });

      expect(result.content[0]).toMatchObject({
        type: "tool-call",
        args: { foo: "bar" },
      });
    });

    it("converts toolResult role to assistant with tool result", () => {
      const result = convertMessage({
        role: "toolResult",
        toolCallId: "call-123",
        toolName: "bash",
        content: "Command output",
        id: "msg-10",
      });

      expect(result.role).toBe("assistant");
      expect(result.content[0]).toMatchObject({
        type: "tool-call",
        toolCallId: "call-123",
        toolName: "bash",
        result: "Command output",
      });
    });

    it("converts tool_result role", () => {
      const result = convertMessage({
        role: "tool_result",
        tool_call_id: "call-456",
        tool_name: "read",
        content: "File contents",
        id: "msg-11",
      });

      expect(result.role).toBe("assistant");
      expect(result.content[0]).toMatchObject({
        type: "tool-call",
        toolCallId: "call-456",
        toolName: "read",
      });
    });

    it("converts function role to assistant", () => {
      const result = convertMessage({
        role: "function",
        content: "Function result",
        id: "msg-12",
      });

      expect(result.role).toBe("assistant");
    });

    it("converts tool role to assistant", () => {
      const result = convertMessage({
        role: "tool",
        content: "Tool result",
        id: "msg-13",
      });

      expect(result.role).toBe("assistant");
    });

    it("handles missing role", () => {
      const result = convertMessage({
        content: "No role specified",
        id: "msg-14",
      });

      expect(result.role).toBe("assistant");
    });

    it("handles missing content", () => {
      const result = convertMessage({
        role: "assistant",
        id: "msg-15",
      });

      expect(result.content).toEqual([{ type: "text", text: "" }]);
    });

    it("generates id when not provided", () => {
      const result = convertMessage({
        role: "user",
        content: "Test",
      });

      expect(result.id).toBeDefined();
      expect(result.id).toMatch(/^msg-/);
    });

    it("uses current time when timestamp not provided", () => {
      const result = convertMessage({
        role: "user",
        content: "Test",
      });

      expect(result.createdAt).toEqual(new Date("2024-01-01T00:00:00Z"));
    });

    it("parses JSON string args", () => {
      const result = convertMessage({
        role: "assistant",
        content: [{ type: "tool_use", name: "test", args: '{"key": "value"}' }],
        id: "msg-16",
      });

      expect(result.content[0]).toMatchObject({
        type: "tool-call",
        args: { key: "value" },
      });
    });

    it("handles invalid JSON string args", () => {
      const result = convertMessage({
        role: "assistant",
        content: [{ type: "tool_use", name: "test", args: "not json" }],
        id: "msg-17",
      });

      expect(result.content[0]).toMatchObject({
        type: "tool-call",
        args: {},
      });
    });
  });

  describe("convertMessages", () => {
    it("converts array of messages", () => {
      const messages = [
        { role: "user", content: "Hello", id: "1" },
        { role: "assistant", content: "Hi there", id: "2" },
      ];

      const result = convertMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe("user");
      expect(result[1].role).toBe("assistant");
    });

    it("filters out null and undefined values", () => {
      const messages = [
        { role: "user", content: "Hello", id: "1" },
        null,
        undefined,
        { role: "assistant", content: "Hi", id: "2" },
      ];

      const result = convertMessages(messages);

      expect(result).toHaveLength(2);
    });

    it("filters out non-object values", () => {
      const messages = [
        { role: "user", content: "Hello", id: "1" },
        "string",
        123,
        { role: "assistant", content: "Hi", id: "2" },
      ];

      const result = convertMessages(messages);

      expect(result).toHaveLength(2);
    });

    it("returns empty array for empty input", () => {
      const result = convertMessages([]);
      expect(result).toEqual([]);
    });
  });
});
