import { describe, it, expect } from "vitest";
import { sanitizeSessionMessagesImages } from "./pi-embedded-helpers/images.js";

describe("sanitizeSessionMessagesImages ensures tool call arguments", () => {
  it("adds arguments to toolCall blocks missing input/arguments field", async () => {
    const input = [
      {
        role: "assistant" as const,
        content: [
          { type: "toolCall", id: "call_1", name: "session_status" }, // missing arguments
        ],
      },
    ];
    const out = await sanitizeSessionMessagesImages(input, "test");
    const assistant = out[0] as { content: Array<{ arguments?: unknown }> };
    const toolCall = assistant.content[0];
    expect(toolCall.arguments).toEqual({});
  });

  it("adds arguments to toolUse blocks missing input/arguments field", async () => {
    const input = [
      {
        role: "assistant" as const,
        content: [
          { type: "toolUse", id: "call_2", name: "read" }, // missing input
        ],
      },
    ];
    const out = await sanitizeSessionMessagesImages(input, "test");
    const assistant = out[0] as { content: Array<{ arguments?: unknown }> };
    const toolCall = assistant.content[0];
    expect(toolCall.arguments).toEqual({});
  });

  it("preserves existing arguments on tool calls", async () => {
    const input = [
      {
        role: "assistant" as const,
        content: [
          { type: "toolCall", id: "call_3", name: "read", arguments: { path: "file.txt" } },
        ],
      },
    ];
    const out = await sanitizeSessionMessagesImages(input, "test");
    const assistant = out[0] as { content: Array<{ arguments?: unknown }> };
    const toolCall = assistant.content[0];
    expect(toolCall.arguments).toEqual({ path: "file.txt" });
  });

  it("preserves existing input on tool calls", async () => {
    const input = [
      {
        role: "assistant" as const,
        content: [
          { type: "toolUse", id: "call_4", name: "exec", input: { command: "ls" } },
        ],
      },
    ];
    const out = await sanitizeSessionMessagesImages(input, "test");
    const assistant = out[0] as { content: Array<{ input?: unknown; arguments?: unknown }> };
    const toolCall = assistant.content[0];
    expect(toolCall.input).toEqual({ command: "ls" });
    expect(toolCall.arguments).toBeUndefined();
  });
});
