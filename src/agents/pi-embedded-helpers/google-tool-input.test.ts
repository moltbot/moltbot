import { describe, it, expect } from "vitest";
import type { AgentMessage } from "@mariozechner/pi-agent-core";
import { sanitizeToolUseInput } from "./google.js";

describe("sanitizeToolUseInput", () => {
  it("should add empty input to toolUse blocks missing it", () => {
    const messages: AgentMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "toolUse",
            id: "tool-1",
            name: "readFile",
            // missing input
          } as any,
          {
            type: "text",
            text: "Searching...",
          },
        ],
      },
    ];

    const sanitized = sanitizeToolUseInput(messages);
    const content = sanitized[0].content;
    const toolUse = (Array.isArray(content) ? content[0] : null) as any;

    expect(toolUse).toBeDefined();
    expect(toolUse.input).toEqual({});
  });

  it("should preserve existing input", () => {
    const messages: AgentMessage[] = [
      {
        role: "assistant",
        content: [
          {
            type: "toolUse",
            id: "tool-2",
            name: "writeFile",
            input: { path: "foo.txt" },
          },
        ],
      },
    ];

    const sanitized = sanitizeToolUseInput(messages);
    const content = sanitized[0].content;
    const toolUse = (Array.isArray(content) ? content[0] : null) as any;

    expect(toolUse.input).toEqual({ path: "foo.txt" });
  });

  it("should handle non-array content gracefully", () => {
    const messages: AgentMessage[] = [
      {
        role: "user",
        content: "Hello",
      },
    ];
    const sanitized = sanitizeToolUseInput(messages);
    expect(sanitized).toEqual(messages);
  });

  it("should recurse through all messages", () => {
    const messages: AgentMessage[] = [
      { role: "user", content: "Hi" },
      {
        role: "assistant",
        content: [
          { type: "toolUse", id: "1", name: "a" } as any, // fix me
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "toolUse", id: "2", name: "b", input: { foo: 1 } }, // leave me
        ],
      },
    ];

    const sanitized = sanitizeToolUseInput(messages);

    expect((sanitized[1].content as any[])[0].input).toEqual({});
    expect((sanitized[2].content as any[])[0].input).toEqual({ foo: 1 });
  });
});
