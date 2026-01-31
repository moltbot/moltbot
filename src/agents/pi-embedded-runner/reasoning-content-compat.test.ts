import { describe, expect, it } from "vitest";
import { patchReasoningContentCompat } from "./reasoning-content-compat.js";

describe("patchReasoningContentCompat", () => {
  it("adds empty reasoning_content to assistant messages that lack it", () => {
    const params = {
      messages: [
        { role: "system", content: "you are helpful" },
        { role: "user", content: "hello" },
        {
          role: "assistant",
          reasoning_content: "let me think",
          content: [{ type: "text", text: "hi" }],
        },
        { role: "user", content: "use a tool" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            { id: "tc_1", type: "function", function: { name: "search", arguments: "{}" } },
          ],
        },
        { role: "tool", content: "result", tool_call_id: "tc_1" },
        {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
        },
      ],
    };

    patchReasoningContentCompat(params);

    // First assistant: already had reasoning_content — unchanged
    expect(params.messages[2].reasoning_content).toBe("let me think");
    // Tool-call assistant: now has empty reasoning_content
    expect(params.messages[4].reasoning_content).toBe("");
    // Last assistant: now has empty reasoning_content
    expect(params.messages[6].reasoning_content).toBe("");
    // Non-assistant messages: untouched
    expect(params.messages[0]).not.toHaveProperty("reasoning_content");
    expect(params.messages[1]).not.toHaveProperty("reasoning_content");
    expect(params.messages[5]).not.toHaveProperty("reasoning_content");
  });

  it("does nothing when no assistant message has a reasoning field", () => {
    const params = {
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: [{ type: "text", text: "hi" }],
          tool_calls: [{ id: "tc_1", type: "function", function: { name: "fn", arguments: "{}" } }],
        },
        { role: "tool", content: "r", tool_call_id: "tc_1" },
      ],
    };

    const before = JSON.parse(JSON.stringify(params));
    patchReasoningContentCompat(params);
    expect(params).toEqual(before);
  });

  it("detects reasoning field (not just reasoning_content)", () => {
    const params = {
      messages: [
        { role: "assistant", reasoning: "thinking", content: "yes" },
        { role: "assistant", content: null, tool_calls: [{ id: "tc_1" }] },
      ],
    };

    patchReasoningContentCompat(params);

    expect(params.messages[0].reasoning).toBe("thinking");
    expect((params.messages[1] as Record<string, unknown>).reasoning).toBe("");
  });

  it("detects reasoning_text field", () => {
    const params = {
      messages: [
        { role: "assistant", reasoning_text: "hmm", content: "ok" },
        { role: "assistant", content: null, tool_calls: [{ id: "tc_2" }] },
      ],
    };

    patchReasoningContentCompat(params);

    expect((params.messages[1] as Record<string, unknown>).reasoning_text).toBe("");
  });

  it("handles empty messages array", () => {
    const params = { messages: [] };
    patchReasoningContentCompat(params);
    expect(params.messages).toEqual([]);
  });

  it("handles params without messages", () => {
    const params = { model: "test" };
    patchReasoningContentCompat(params);
    // Should not throw
  });

  it("adds reasoning_content for Kimi K2.5 even when no message has the field", () => {
    const params = {
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "tc_1", type: "function", function: { name: "fn", arguments: "{}" } }],
        },
        { role: "tool", content: "result", tool_call_id: "tc_1" },
        {
          role: "assistant",
          content: [{ type: "text", text: "done" }],
        },
      ],
    };

    // Without modelId: no patching (existing behavior)
    const before = JSON.parse(JSON.stringify(params));
    patchReasoningContentCompat(params);
    expect(params).toEqual(before);

    // With Kimi K2.5 modelId: adds reasoning_content to all assistant messages
    patchReasoningContentCompat(params, "moonshotai/kimi-k2.5");
    expect((params.messages[1] as Record<string, unknown>).reasoning_content).toBe("");
    expect((params.messages[3] as Record<string, unknown>).reasoning_content).toBe("");
    // Non-assistant: untouched
    expect(params.messages[0]).not.toHaveProperty("reasoning_content");
    expect(params.messages[2]).not.toHaveProperty("reasoning_content");
  });

  it("does not force reasoning_content for non-Kimi models without existing field", () => {
    const params = {
      messages: [{ role: "assistant", content: "hi", tool_calls: [{ id: "tc_1" }] }],
    };

    patchReasoningContentCompat(params, "anthropic/claude-sonnet-4-5");
    expect(params.messages[0]).not.toHaveProperty("reasoning_content");
  });

  it("adds reasoning_content when payload has reasoning_effort set", () => {
    const params = {
      reasoning_effort: "high",
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "tc_1", type: "function", function: { name: "fn", arguments: "{}" } }],
        },
        { role: "tool", content: "result", tool_call_id: "tc_1" },
      ],
    };

    // No modelId, no existing reasoning field — but reasoning_effort is set
    patchReasoningContentCompat(params);
    expect((params.messages[1] as Record<string, unknown>).reasoning_content).toBe("");
  });

  it("adds reasoning_content when payload has thinking: { type: 'enabled' }", () => {
    const params = {
      thinking: { type: "enabled" },
      messages: [
        { role: "user", content: "hello" },
        {
          role: "assistant",
          content: null,
          tool_calls: [{ id: "tc_1", type: "function", function: { name: "fn", arguments: "{}" } }],
        },
      ],
    };

    patchReasoningContentCompat(params);
    expect((params.messages[1] as Record<string, unknown>).reasoning_content).toBe("");
  });

  it("does not trigger on thinking: { type: 'disabled' }", () => {
    const params = {
      thinking: { type: "disabled" },
      messages: [{ role: "assistant", content: "hi", tool_calls: [{ id: "tc_1" }] }],
    };

    const before = JSON.parse(JSON.stringify(params));
    patchReasoningContentCompat(params);
    expect(params.messages).toEqual(before.messages);
  });

  it("does not add field when reasoning_content is explicitly set to empty string", () => {
    const params = {
      messages: [
        { role: "assistant", reasoning_content: "", content: "yes" },
        { role: "assistant", content: null, tool_calls: [{ id: "tc_1" }] },
      ],
    };

    patchReasoningContentCompat(params);

    // Empty string is still a defined field, so it should be detected
    expect(params.messages[1].reasoning_content).toBe("");
  });
});
