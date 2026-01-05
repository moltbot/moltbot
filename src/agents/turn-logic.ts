/**
 * Turn Logic for Clawdis - Agentic loop implementation following Claude Code / Anthropic SDK pattern.
 * Supports parallel tool execution, per-tool timeouts, and max_tokens continuation.
 */

import type { AgentMessage } from "@mariozechner/pi-agent-core";

export type StopReason =
  | "end_turn"
  | "tool_use"
  | "max_tokens"
  | "stop_sequence"
  | "pause_turn"
  | "refusal";

export type ContentBlockType = "text" | "tool_use" | "tool_result" | "image";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string | ContentBlock[];
  is_error?: boolean;
}

export type ContentBlock = TextBlock | ToolUseBlock | ToolResultBlock;

export interface Message {
  role: "user" | "assistant";
  content: string | ContentBlock[];
}

export interface ClaudeResponse {
  id: string;
  type: "message";
  role: "assistant";
  content: ContentBlock[];
  model: string;
  stop_reason: StopReason | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export type ToolExecutor = (
  toolName: string,
  toolInput: Record<string, unknown>,
  toolCallId: string,
) => Promise<string | ContentBlock[]>;

export interface TurnLoopOptions {
  maxTurns?: number;
  toolTimeout?: number;
  continueOnMaxTokens?: boolean;
  maxContinuations?: number;
  abortSignal?: AbortSignal;
  onTurnStart?: (turnNumber: number) => void;
  onTurnEnd?: (turnNumber: number, stopReason: StopReason | null) => void;
  onToolStart?: (toolName: string, toolCallId: string) => void;
  onToolEnd?: (
    toolName: string,
    toolCallId: string,
    result: string | ContentBlock[],
    isError: boolean,
  ) => void;
  onText?: (text: string) => void;
}

export interface TurnLoopResult {
  messages: Message[];
  finalText: string;
  turnCount: number;
  stopReason: StopReason | null;
  aborted: boolean;
  totalUsage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), ms);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function executeTurnLoop(params: {
  apiCall: (messages: Message[]) => Promise<ClaudeResponse>;
  toolExecutor: ToolExecutor;
  initialMessages: Message[];
  options?: TurnLoopOptions;
}): Promise<TurnLoopResult> {
  const { apiCall, toolExecutor, initialMessages, options = {} } = params;
  const {
    maxTurns = 50,
    toolTimeout = 30_000,
    continueOnMaxTokens = false,
    maxContinuations = 3,
    abortSignal,
  } = options;

  const messages: Message[] = [...initialMessages];
  let turnCount = 0;
  let continuationCount = 0;
  let aborted = false;
  let stopReason: StopReason | null = null;
  let shouldContinueLoop = true;

  const totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  while (shouldContinueLoop) {
    if (abortSignal?.aborted) {
      aborted = true;
      break;
    }

    if (turnCount >= maxTurns) {
      console.warn(`[turn-logic] Max turns (${maxTurns}) reached, stopping`);
      break;
    }

    turnCount++;
    options.onTurnStart?.(turnCount);

    let response: ClaudeResponse;
    try {
      response = await apiCall(messages);
    } catch (err) {
      console.error(`[turn-logic] API call failed:`, err);
      throw err;
    }

    totalUsage.inputTokens += response.usage.input_tokens;
    totalUsage.outputTokens += response.usage.output_tokens;
    totalUsage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    totalUsage.cacheWriteTokens +=
      response.usage.cache_creation_input_tokens ?? 0;

    stopReason = response.stop_reason;

    messages.push({
      role: "assistant",
      content: response.content,
    });

    for (const block of response.content) {
      if (block.type === "text") {
        options.onText?.(block.text);
      }
    }

    options.onTurnEnd?.(turnCount, stopReason);

    if (stopReason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        console.warn(
          `[turn-logic] stop_reason=tool_use but no tool blocks found`,
        );
        shouldContinueLoop = false;
        continue;
      }

      const toolResultPromises = toolUseBlocks.map(async (toolUse) => {
        options.onToolStart?.(toolUse.name, toolUse.id);

        let result: string | ContentBlock[];
        let isError = false;

        try {
          result = await withTimeout(
            toolExecutor(toolUse.name, toolUse.input, toolUse.id),
            toolTimeout,
            `Tool ${toolUse.name} timed out after ${toolTimeout}ms`,
          );
        } catch (err) {
          isError = true;
          result =
            err instanceof Error
              ? `Error: ${err.message}`
              : `Error: ${String(err)}`;
        }

        options.onToolEnd?.(toolUse.name, toolUse.id, result, isError);

        return {
          type: "tool_result" as const,
          tool_use_id: toolUse.id,
          content: result,
          is_error: isError,
        };
      });

      const toolResults = await Promise.all(toolResultPromises);

      if (abortSignal?.aborted) {
        aborted = true;
        break;
      }

      messages.push({
        role: "user",
        content: toolResults,
      });

      continue;
    }

    if (stopReason === "max_tokens" && continueOnMaxTokens) {
      if (continuationCount >= maxContinuations) {
        console.warn(
          `[turn-logic] Max continuations (${maxContinuations}) reached`,
        );
        shouldContinueLoop = false;
        continue;
      }

      continuationCount++;

      messages.push({
        role: "user",
        content: "Continue from where you left off.",
      });

      continue;
    }

    shouldContinueLoop = false;
  }

  const lastAssistant = messages
    .slice()
    .reverse()
    .find((m) => m.role === "assistant");

  let finalText = "";
  if (lastAssistant && Array.isArray(lastAssistant.content)) {
    finalText = lastAssistant.content
      .filter((block): block is TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  return {
    messages,
    finalText,
    turnCount,
    stopReason,
    aborted,
    totalUsage,
  };
}

export type TurnState =
  | "idle"
  | "waiting_for_response"
  | "executing_tools"
  | "waiting_for_continuation"
  | "completed"
  | "aborted"
  | "error";

export type TurnEvent =
  | { type: "start"; prompt: string }
  | { type: "response_received"; response: ClaudeResponse }
  | { type: "tools_executed"; results: ToolResultBlock[] }
  | { type: "continuation_requested" }
  | { type: "abort" }
  | { type: "error"; error: Error };

export class TurnStateMachine {
  private state: TurnState = "idle";
  private messages: Message[] = [];
  private turnCount = 0;
  private lastResponse: ClaudeResponse | null = null;
  private pendingToolUses: ToolUseBlock[] = [];

  constructor(
    private readonly onStateChange?: (
      state: TurnState,
      event: TurnEvent,
    ) => void,
  ) {}

  getState(): TurnState {
    return this.state;
  }

  getMessages(): Message[] {
    return [...this.messages];
  }

  getTurnCount(): number {
    return this.turnCount;
  }

  getPendingToolUses(): ToolUseBlock[] {
    return [...this.pendingToolUses];
  }

  getLastResponse(): ClaudeResponse | null {
    return this.lastResponse;
  }

  transition(event: TurnEvent): void {
    const prevState = this.state;

    switch (event.type) {
      case "start":
        if (this.state !== "idle" && this.state !== "completed") {
          throw new Error(`Cannot start turn from state: ${this.state}`);
        }
        this.messages.push({ role: "user", content: event.prompt });
        this.state = "waiting_for_response";
        this.turnCount++;
        break;

      case "response_received":
        if (
          this.state !== "waiting_for_response" &&
          this.state !== "waiting_for_continuation"
        ) {
          throw new Error(`Cannot receive response in state: ${this.state}`);
        }
        this.lastResponse = event.response;
        this.messages.push({
          role: "assistant",
          content: event.response.content,
        });

        if (event.response.stop_reason === "tool_use") {
          this.pendingToolUses = event.response.content.filter(
            (block): block is ToolUseBlock => block.type === "tool_use",
          );
          this.state =
            this.pendingToolUses.length > 0 ? "executing_tools" : "completed";
        } else if (event.response.stop_reason === "max_tokens") {
          this.state = "waiting_for_continuation";
        } else {
          this.state = "completed";
        }
        break;

      case "tools_executed":
        if (this.state !== "executing_tools") {
          throw new Error(`Cannot execute tools in state: ${this.state}`);
        }
        this.messages.push({ role: "user", content: event.results });
        this.pendingToolUses = [];
        this.state = "waiting_for_response";
        this.turnCount++;
        break;

      case "continuation_requested":
        if (this.state !== "waiting_for_continuation") {
          throw new Error(
            `Cannot request continuation in state: ${this.state}`,
          );
        }
        this.messages.push({
          role: "user",
          content: "Continue from where you left off.",
        });
        this.state = "waiting_for_response";
        this.turnCount++;
        break;

      case "abort":
        this.state = "aborted";
        break;

      case "error":
        this.state = "error";
        break;
    }

    if (this.state !== prevState) {
      this.onStateChange?.(this.state, event);
    }
  }

  shouldContinue(): boolean {
    return (
      this.state === "waiting_for_response" ||
      this.state === "executing_tools" ||
      this.state === "waiting_for_continuation"
    );
  }

  needsToolExecution(): boolean {
    return this.state === "executing_tools" && this.pendingToolUses.length > 0;
  }

  needsContinuationDecision(): boolean {
    return this.state === "waiting_for_continuation";
  }

  reset(): void {
    this.state = "idle";
    this.messages = [];
    this.turnCount = 0;
    this.lastResponse = null;
    this.pendingToolUses = [];
  }
}

export type StreamingTurnEvent =
  | { type: "turn_start"; turnNumber: number }
  | { type: "text"; text: string; accumulated: string }
  | { type: "tool_start"; toolName: string; toolCallId: string }
  | {
      type: "tool_end";
      toolName: string;
      toolCallId: string;
      result: string | ContentBlock[];
      isError: boolean;
    }
  | { type: "turn_end"; stopReason: StopReason | null }
  | { type: "continuation"; continuationNumber: number }
  | { type: "done"; result: TurnLoopResult };

export async function* streamingTurnLoop(params: {
  apiCall: (messages: Message[]) => Promise<ClaudeResponse>;
  toolExecutor: ToolExecutor;
  initialMessages: Message[];
  options?: Omit<
    TurnLoopOptions,
    "onTurnStart" | "onTurnEnd" | "onToolStart" | "onToolEnd" | "onText"
  >;
}): AsyncGenerator<StreamingTurnEvent, TurnLoopResult, undefined> {
  const { apiCall, toolExecutor, initialMessages, options = {} } = params;
  const {
    maxTurns = 50,
    toolTimeout = 30_000,
    continueOnMaxTokens = false,
    maxContinuations = 3,
    abortSignal,
  } = options;

  const messages: Message[] = [...initialMessages];
  let turnCount = 0;
  let continuationCount = 0;
  let aborted = false;
  let stopReason: StopReason | null = null;
  let shouldContinueLoop = true;

  const totalUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };

  while (shouldContinueLoop) {
    if (abortSignal?.aborted) {
      aborted = true;
      break;
    }

    if (turnCount >= maxTurns) {
      break;
    }

    turnCount++;
    yield { type: "turn_start", turnNumber: turnCount };

    const response = await apiCall(messages);

    totalUsage.inputTokens += response.usage.input_tokens;
    totalUsage.outputTokens += response.usage.output_tokens;
    totalUsage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    totalUsage.cacheWriteTokens +=
      response.usage.cache_creation_input_tokens ?? 0;

    stopReason = response.stop_reason;

    messages.push({
      role: "assistant",
      content: response.content,
    });

    let accumulatedText = "";
    for (const block of response.content) {
      if (block.type === "text") {
        accumulatedText += block.text;
        yield { type: "text", text: block.text, accumulated: accumulatedText };
      }
    }

    yield { type: "turn_end", stopReason };

    if (stopReason === "tool_use") {
      const toolUseBlocks = response.content.filter(
        (block): block is ToolUseBlock => block.type === "tool_use",
      );

      if (toolUseBlocks.length === 0) {
        shouldContinueLoop = false;
        continue;
      }

      const toolResults: ToolResultBlock[] = [];

      for (const toolUse of toolUseBlocks) {
        if (abortSignal?.aborted) {
          aborted = true;
          break;
        }

        yield {
          type: "tool_start",
          toolName: toolUse.name,
          toolCallId: toolUse.id,
        };

        let result: string | ContentBlock[];
        let isError = false;

        try {
          result = await withTimeout(
            toolExecutor(toolUse.name, toolUse.input, toolUse.id),
            toolTimeout,
            `Tool ${toolUse.name} timed out after ${toolTimeout}ms`,
          );
        } catch (err) {
          isError = true;
          result =
            err instanceof Error
              ? `Error: ${err.message}`
              : `Error: ${String(err)}`;
        }

        yield {
          type: "tool_end",
          toolName: toolUse.name,
          toolCallId: toolUse.id,
          result,
          isError,
        };

        toolResults.push({
          type: "tool_result",
          tool_use_id: toolUse.id,
          content: result,
          is_error: isError,
        });
      }

      if (aborted) {
        break;
      }

      messages.push({
        role: "user",
        content: toolResults,
      });

      continue;
    }

    if (
      stopReason === "max_tokens" &&
      continueOnMaxTokens &&
      continuationCount < maxContinuations
    ) {
      continuationCount++;
      yield { type: "continuation", continuationNumber: continuationCount };

      messages.push({
        role: "user",
        content: "Continue from where you left off.",
      });

      continue;
    }

    shouldContinueLoop = false;
  }

  const lastAssistant = messages
    .slice()
    .reverse()
    .find((m) => m.role === "assistant");

  let finalText = "";
  if (lastAssistant && Array.isArray(lastAssistant.content)) {
    finalText = lastAssistant.content
      .filter((block): block is TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  const result: TurnLoopResult = {
    messages,
    finalText,
    turnCount,
    stopReason,
    aborted,
    totalUsage,
  };

  yield { type: "done", result };
  return result;
}

export function fromAgentMessage(msg: AgentMessage): Message | null {
  if (msg.role === "user" || msg.role === "assistant") {
    return {
      role: msg.role,
      content:
        typeof msg.content === "string"
          ? msg.content
          : (msg.content as ContentBlock[]),
    };
  }
  return null;
}

export function shouldContinue(stopReason: StopReason | null): boolean {
  return stopReason === "tool_use";
}

export function isTerminal(stopReason: StopReason | null): boolean {
  return (
    stopReason === "end_turn" ||
    stopReason === "max_tokens" ||
    stopReason === "stop_sequence" ||
    stopReason === "refusal" ||
    stopReason === null
  );
}

export function isErrorCondition(stopReason: StopReason | null): boolean {
  return stopReason === "refusal";
}

export function extractToolUses(response: ClaudeResponse): ToolUseBlock[] {
  return response.content.filter(
    (block): block is ToolUseBlock => block.type === "tool_use",
  );
}

export function extractText(response: ClaudeResponse): string {
  return response.content
    .filter((block): block is TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export function createToolResult(
  toolCallId: string,
  content: string | ContentBlock[],
  isError = false,
): ToolResultBlock {
  return {
    type: "tool_result",
    tool_use_id: toolCallId,
    content,
    is_error: isError,
  };
}

export { withTimeout };
