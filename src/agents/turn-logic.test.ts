import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ClaudeResponse,
  createToolResult,
  executeTurnLoop,
  extractText,
  extractToolUses,
  isErrorCondition,
  isTerminal,
  type StopReason,
  shouldContinue,
  streamingTurnLoop,
  type ToolResultBlock,
  type ToolUseBlock,
  TurnStateMachine,
  withTimeout,
} from "./turn-logic.js";

function createMockResponse(
  content: ClaudeResponse["content"],
  stopReason: StopReason | null,
  usage = { input_tokens: 100, output_tokens: 50 },
): ClaudeResponse {
  return {
    id: `msg_${Math.random().toString(36).slice(2)}`,
    type: "message",
    role: "assistant",
    content,
    model: "claude-3-sonnet",
    stop_reason: stopReason,
    stop_sequence: null,
    usage,
  };
}

function createToolUseBlock(
  name: string,
  input: Record<string, unknown>,
): ToolUseBlock {
  return {
    type: "tool_use",
    id: `tool_${Math.random().toString(36).slice(2)}`,
    name,
    input,
  };
}

describe("executeTurnLoop", () => {
  it("completes single turn with end_turn", async () => {
    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse([{ type: "text", text: "Hello!" }], "end_turn"),
      );
    const toolExecutor = vi.fn();

    const result = await executeTurnLoop({
      apiCall,
      toolExecutor,
      initialMessages: [{ role: "user", content: "Hi" }],
    });

    expect(result.turnCount).toBe(1);
    expect(result.stopReason).toBe("end_turn");
    expect(result.finalText).toBe("Hello!");
    expect(result.aborted).toBe(false);
    expect(apiCall).toHaveBeenCalledTimes(1);
    expect(toolExecutor).not.toHaveBeenCalled();
  });

  it("executes multiple turns with tool use", async () => {
    const toolBlock = createToolUseBlock("get_weather", { city: "NYC" });

    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse([toolBlock], "tool_use"))
      .mockResolvedValueOnce(
        createMockResponse(
          [{ type: "text", text: "Weather is sunny!" }],
          "end_turn",
        ),
      );

    const toolExecutor = vi.fn().mockResolvedValue("Sunny, 72F");

    const result = await executeTurnLoop({
      apiCall,
      toolExecutor,
      initialMessages: [{ role: "user", content: "What's the weather?" }],
    });

    expect(result.turnCount).toBe(2);
    expect(result.stopReason).toBe("end_turn");
    expect(result.finalText).toBe("Weather is sunny!");
    expect(apiCall).toHaveBeenCalledTimes(2);
    expect(toolExecutor).toHaveBeenCalledTimes(1);
    expect(toolExecutor).toHaveBeenCalledWith(
      "get_weather",
      { city: "NYC" },
      toolBlock.id,
    );
  });

  it("executes tools in parallel", async () => {
    const tool1 = createToolUseBlock("tool_a", { x: 1 });
    const tool2 = createToolUseBlock("tool_b", { y: 2 });
    const tool3 = createToolUseBlock("tool_c", { z: 3 });

    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse([tool1, tool2, tool3], "tool_use"),
      )
      .mockResolvedValueOnce(
        createMockResponse([{ type: "text", text: "Done" }], "end_turn"),
      );

    const executionOrder: string[] = [];
    const toolExecutor = vi.fn().mockImplementation(async (name: string) => {
      await new Promise((r) => setTimeout(r, 10));
      executionOrder.push(name);
      return `Result from ${name}`;
    });

    const startTime = Date.now();
    const result = await executeTurnLoop({
      apiCall,
      toolExecutor,
      initialMessages: [{ role: "user", content: "Run all tools" }],
    });
    const elapsed = Date.now() - startTime;

    expect(toolExecutor).toHaveBeenCalledTimes(3);
    expect(result.turnCount).toBe(2);
    expect(elapsed).toBeLessThan(50);
  });

  it("handles tool execution errors gracefully", async () => {
    const toolBlock = createToolUseBlock("failing_tool", {});

    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse([toolBlock], "tool_use"))
      .mockResolvedValueOnce(
        createMockResponse(
          [{ type: "text", text: "I see the error" }],
          "end_turn",
        ),
      );

    const toolExecutor = vi.fn().mockRejectedValue(new Error("Tool failed"));

    const result = await executeTurnLoop({
      apiCall,
      toolExecutor,
      initialMessages: [{ role: "user", content: "Run failing tool" }],
    });

    expect(result.turnCount).toBe(2);

    const toolResultMessage = result.messages.find(
      (m) =>
        m.role === "user" &&
        Array.isArray(m.content) &&
        m.content.some((b) => b.type === "tool_result"),
    );
    expect(toolResultMessage).toBeDefined();

    const toolResult = (toolResultMessage?.content as ToolResultBlock[])[0];
    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toContain("Error: Tool failed");
  });

  it("respects maxTurns limit", async () => {
    const toolBlock = createToolUseBlock("infinite_tool", {});

    const apiCall = vi
      .fn()
      .mockResolvedValue(createMockResponse([toolBlock], "tool_use"));
    const toolExecutor = vi.fn().mockResolvedValue("Result");

    const result = await executeTurnLoop({
      apiCall,
      toolExecutor,
      initialMessages: [{ role: "user", content: "Loop forever" }],
      options: { maxTurns: 3 },
    });

    expect(result.turnCount).toBe(3);
    expect(apiCall).toHaveBeenCalledTimes(3);
  });

  it("respects abort signal", async () => {
    const toolBlock = createToolUseBlock("slow_tool", {});
    const controller = new AbortController();

    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse([toolBlock], "tool_use"))
      .mockResolvedValueOnce(
        createMockResponse([{ type: "text", text: "Done" }], "end_turn"),
      );

    const toolExecutor = vi.fn().mockImplementation(async () => {
      controller.abort();
      return "Result";
    });

    const result = await executeTurnLoop({
      apiCall,
      toolExecutor,
      initialMessages: [{ role: "user", content: "Start" }],
      options: { abortSignal: controller.signal },
    });

    expect(result.aborted).toBe(true);
  });

  it("handles tool timeout", async () => {
    const toolBlock = createToolUseBlock("slow_tool", {});

    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse([toolBlock], "tool_use"))
      .mockResolvedValueOnce(
        createMockResponse(
          [{ type: "text", text: "Handled timeout" }],
          "end_turn",
        ),
      );

    const toolExecutor = vi
      .fn()
      .mockImplementation(
        () =>
          new Promise((resolve) =>
            setTimeout(() => resolve("Late result"), 500),
          ),
      );

    const result = await executeTurnLoop({
      apiCall,
      toolExecutor,
      initialMessages: [{ role: "user", content: "Run slow tool" }],
      options: { toolTimeout: 50 },
    });

    const toolResultMessage = result.messages.find(
      (m) =>
        m.role === "user" &&
        Array.isArray(m.content) &&
        m.content.some((b) => b.type === "tool_result"),
    );
    const toolResult = (toolResultMessage?.content as ToolResultBlock[])[0];

    expect(toolResult.is_error).toBe(true);
    expect(toolResult.content).toContain("timed out");
  });

  it("continues on max_tokens when enabled", async () => {
    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse([{ type: "text", text: "Part 1..." }], "max_tokens"),
      )
      .mockResolvedValueOnce(
        createMockResponse([{ type: "text", text: "Part 2 done" }], "end_turn"),
      );

    const result = await executeTurnLoop({
      apiCall,
      toolExecutor: vi.fn(),
      initialMessages: [{ role: "user", content: "Long response please" }],
      options: { continueOnMaxTokens: true },
    });

    expect(result.turnCount).toBe(2);
    expect(apiCall).toHaveBeenCalledTimes(2);

    const continuationMessage = result.messages.find(
      (m) =>
        m.role === "user" && m.content === "Continue from where you left off.",
    );
    expect(continuationMessage).toBeDefined();
  });

  it("respects maxContinuations limit", async () => {
    const apiCall = vi
      .fn()
      .mockResolvedValue(
        createMockResponse([{ type: "text", text: "Part..." }], "max_tokens"),
      );

    await executeTurnLoop({
      apiCall,
      toolExecutor: vi.fn(),
      initialMessages: [{ role: "user", content: "Very long response" }],
      options: { continueOnMaxTokens: true, maxContinuations: 2 },
    });

    expect(apiCall).toHaveBeenCalledTimes(3);
  });

  it("accumulates usage across turns", async () => {
    const toolBlock = createToolUseBlock("tool", {});

    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse([toolBlock], "tool_use", {
          input_tokens: 100,
          output_tokens: 50,
        }),
      )
      .mockResolvedValueOnce(
        createMockResponse([{ type: "text", text: "Done" }], "end_turn", {
          input_tokens: 200,
          output_tokens: 100,
        }),
      );

    const result = await executeTurnLoop({
      apiCall,
      toolExecutor: vi.fn().mockResolvedValue("Result"),
      initialMessages: [{ role: "user", content: "Start" }],
    });

    expect(result.totalUsage.inputTokens).toBe(300);
    expect(result.totalUsage.outputTokens).toBe(150);
  });

  it("calls callbacks in correct order", async () => {
    const toolBlock = createToolUseBlock("my_tool", { arg: "value" });
    const events: string[] = [];

    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse(
          [{ type: "text", text: "Thinking..." }, toolBlock],
          "tool_use",
        ),
      )
      .mockResolvedValueOnce(
        createMockResponse([{ type: "text", text: "Done" }], "end_turn"),
      );

    await executeTurnLoop({
      apiCall,
      toolExecutor: vi.fn().mockResolvedValue("Tool result"),
      initialMessages: [{ role: "user", content: "Start" }],
      options: {
        onTurnStart: (n) => events.push(`turn_start:${n}`),
        onTurnEnd: (n, r) => events.push(`turn_end:${n}:${r}`),
        onToolStart: (name) => events.push(`tool_start:${name}`),
        onToolEnd: (name) => events.push(`tool_end:${name}`),
        onText: (t) => events.push(`text:${t.slice(0, 10)}`),
      },
    });

    expect(events).toEqual([
      "turn_start:1",
      "text:Thinking..",
      "turn_end:1:tool_use",
      "tool_start:my_tool",
      "tool_end:my_tool",
      "turn_start:2",
      "text:Done",
      "turn_end:2:end_turn",
    ]);
  });
});

describe("streamingTurnLoop", () => {
  it("yields events in correct order", async () => {
    const toolBlock = createToolUseBlock("stream_tool", {});

    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(createMockResponse([toolBlock], "tool_use"))
      .mockResolvedValueOnce(
        createMockResponse([{ type: "text", text: "Final" }], "end_turn"),
      );

    const events: string[] = [];
    const generator = streamingTurnLoop({
      apiCall,
      toolExecutor: vi.fn().mockResolvedValue("Tool output"),
      initialMessages: [{ role: "user", content: "Start streaming" }],
    });

    for await (const event of generator) {
      events.push(event.type);
    }

    expect(events).toEqual([
      "turn_start",
      "turn_end",
      "tool_start",
      "tool_end",
      "turn_start",
      "text",
      "turn_end",
      "done",
    ]);
  });

  it("accumulates text correctly", async () => {
    const apiCall = vi.fn().mockResolvedValueOnce(
      createMockResponse(
        [
          { type: "text", text: "Hello " },
          { type: "text", text: "World!" },
        ],
        "end_turn",
      ),
    );

    const textEvents: { text: string; accumulated: string }[] = [];
    const generator = streamingTurnLoop({
      apiCall,
      toolExecutor: vi.fn(),
      initialMessages: [{ role: "user", content: "Greet" }],
    });

    for await (const event of generator) {
      if (event.type === "text") {
        textEvents.push({ text: event.text, accumulated: event.accumulated });
      }
    }

    expect(textEvents).toEqual([
      { text: "Hello ", accumulated: "Hello " },
      { text: "World!", accumulated: "Hello World!" },
    ]);
  });

  it("yields continuation events", async () => {
    const apiCall = vi
      .fn()
      .mockResolvedValueOnce(
        createMockResponse([{ type: "text", text: "Part 1" }], "max_tokens"),
      )
      .mockResolvedValueOnce(
        createMockResponse([{ type: "text", text: "Part 2" }], "end_turn"),
      );

    const events: string[] = [];
    const generator = streamingTurnLoop({
      apiCall,
      toolExecutor: vi.fn(),
      initialMessages: [{ role: "user", content: "Long" }],
      options: { continueOnMaxTokens: true },
    });

    for await (const event of generator) {
      if (event.type === "continuation") {
        events.push(`continuation:${event.continuationNumber}`);
      }
    }

    expect(events).toContain("continuation:1");
  });
});

describe("TurnStateMachine", () => {
  let machine: TurnStateMachine;
  let stateChanges: { state: string; event: string }[];

  beforeEach(() => {
    stateChanges = [];
    machine = new TurnStateMachine((state, event) => {
      stateChanges.push({ state, event: event.type });
    });
  });

  it("starts in idle state", () => {
    expect(machine.getState()).toBe("idle");
  });

  it("transitions through tool execution flow", () => {
    const toolBlock = createToolUseBlock("test_tool", {});
    const response = createMockResponse([toolBlock], "tool_use");

    machine.transition({ type: "start", prompt: "Hello" });
    expect(machine.getState()).toBe("waiting_for_response");

    machine.transition({ type: "response_received", response });
    expect(machine.getState()).toBe("executing_tools");
    expect(machine.needsToolExecution()).toBe(true);

    const toolResult: ToolResultBlock = {
      type: "tool_result",
      tool_use_id: toolBlock.id,
      content: "Result",
    };
    machine.transition({ type: "tools_executed", results: [toolResult] });
    expect(machine.getState()).toBe("waiting_for_response");
  });

  it("handles max_tokens with continuation", () => {
    const response = createMockResponse(
      [{ type: "text", text: "Partial" }],
      "max_tokens",
    );

    machine.transition({ type: "start", prompt: "Long request" });
    machine.transition({ type: "response_received", response });

    expect(machine.getState()).toBe("waiting_for_continuation");
    expect(machine.needsContinuationDecision()).toBe(true);

    machine.transition({ type: "continuation_requested" });
    expect(machine.getState()).toBe("waiting_for_response");
  });

  it("completes on end_turn", () => {
    const response = createMockResponse(
      [{ type: "text", text: "Done" }],
      "end_turn",
    );

    machine.transition({ type: "start", prompt: "Quick question" });
    machine.transition({ type: "response_received", response });

    expect(machine.getState()).toBe("completed");
    expect(machine.shouldContinue()).toBe(false);
  });

  it("throws on invalid transitions", () => {
    expect(() => {
      machine.transition({
        type: "response_received",
        response: createMockResponse([], "end_turn"),
      });
    }).toThrow();

    machine.transition({ type: "start", prompt: "Test" });

    expect(() => {
      machine.transition({ type: "tools_executed", results: [] });
    }).toThrow();
  });

  it("tracks turn count correctly", () => {
    const toolBlock = createToolUseBlock("tool", {});

    machine.transition({ type: "start", prompt: "Start" });
    expect(machine.getTurnCount()).toBe(1);

    machine.transition({
      type: "response_received",
      response: createMockResponse([toolBlock], "tool_use"),
    });
    machine.transition({
      type: "tools_executed",
      results: [
        { type: "tool_result", tool_use_id: toolBlock.id, content: "R" },
      ],
    });
    expect(machine.getTurnCount()).toBe(2);
  });

  it("resets state correctly", () => {
    machine.transition({ type: "start", prompt: "Test" });
    machine.transition({
      type: "response_received",
      response: createMockResponse(
        [{ type: "text", text: "Done" }],
        "end_turn",
      ),
    });

    machine.reset();

    expect(machine.getState()).toBe("idle");
    expect(machine.getTurnCount()).toBe(0);
    expect(machine.getMessages()).toEqual([]);
  });
});

describe("utility functions", () => {
  describe("shouldContinue", () => {
    it("returns true only for tool_use", () => {
      expect(shouldContinue("tool_use")).toBe(true);
      expect(shouldContinue("end_turn")).toBe(false);
      expect(shouldContinue("max_tokens")).toBe(false);
      expect(shouldContinue(null)).toBe(false);
    });
  });

  describe("isTerminal", () => {
    it("identifies terminal states", () => {
      expect(isTerminal("end_turn")).toBe(true);
      expect(isTerminal("max_tokens")).toBe(true);
      expect(isTerminal("stop_sequence")).toBe(true);
      expect(isTerminal("refusal")).toBe(true);
      expect(isTerminal(null)).toBe(true);
      expect(isTerminal("tool_use")).toBe(false);
    });
  });

  describe("isErrorCondition", () => {
    it("identifies error conditions", () => {
      expect(isErrorCondition("refusal")).toBe(true);
      expect(isErrorCondition("end_turn")).toBe(false);
    });
  });

  describe("extractToolUses", () => {
    it("filters tool_use blocks from response", () => {
      const tool1 = createToolUseBlock("a", {});
      const tool2 = createToolUseBlock("b", {});
      const response = createMockResponse(
        [
          { type: "text", text: "Hello" },
          tool1,
          { type: "text", text: "More" },
          tool2,
        ],
        "tool_use",
      );

      const toolUses = extractToolUses(response);

      expect(toolUses).toHaveLength(2);
      expect(toolUses[0].name).toBe("a");
      expect(toolUses[1].name).toBe("b");
    });
  });

  describe("extractText", () => {
    it("concatenates text blocks", () => {
      const response = createMockResponse(
        [
          { type: "text", text: "Hello " },
          createToolUseBlock("tool", {}),
          { type: "text", text: "World" },
        ],
        "tool_use",
      );

      expect(extractText(response)).toBe("Hello World");
    });
  });

  describe("createToolResult", () => {
    it("creates tool result with correct structure", () => {
      const result = createToolResult("tool_123", "Output data", false);

      expect(result).toEqual({
        type: "tool_result",
        tool_use_id: "tool_123",
        content: "Output data",
        is_error: false,
      });
    });

    it("creates error tool result", () => {
      const result = createToolResult("tool_456", "Error message", true);

      expect(result.is_error).toBe(true);
    });
  });

  describe("withTimeout", () => {
    it("resolves when promise completes before timeout", async () => {
      const result = await withTimeout(
        Promise.resolve("success"),
        1000,
        "Timeout",
      );
      expect(result).toBe("success");
    });

    it("rejects when timeout occurs", async () => {
      await expect(
        withTimeout(
          new Promise((r) => setTimeout(() => r("late"), 500)),
          50,
          "Custom timeout message",
        ),
      ).rejects.toThrow("Custom timeout message");
    });
  });
});
