import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SessionManager } from "@mariozechner/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { TemplateContext } from "../templating.js";
import { DEFAULT_MEMORY_FLUSH_PROMPT } from "./memory-flush.js";
import type { FollowupRun, QueueSettings } from "./queue.js";
import { createMockTypingController } from "./test-helpers.js";

const runEmbeddedPiAgentMock = vi.fn();
const runCliAgentMock = vi.fn();

type EmbeddedRunParams = {
  prompt?: string;
};

vi.mock("../../agents/model-fallback.js", () => ({
  runWithModelFallback: async ({
    provider,
    model,
    run,
  }: {
    provider: string;
    model: string;
    run: (provider: string, model: string) => Promise<unknown>;
  }) => ({
    result: await run(provider, model),
    provider,
    model,
  }),
}));

vi.mock("../../agents/cli-runner.js", () => ({
  runCliAgent: (params: unknown) => runCliAgentMock(params),
}));

vi.mock("../../agents/pi-embedded.js", () => ({
  queueEmbeddedPiMessage: vi.fn().mockReturnValue(false),
  runEmbeddedPiAgent: (params: unknown) => runEmbeddedPiAgentMock(params),
}));

vi.mock("./queue.js", async () => {
  const actual = await vi.importActual<typeof import("./queue.js")>("./queue.js");
  return {
    ...actual,
    enqueueFollowupRun: vi.fn(),
    scheduleFollowupDrain: vi.fn(),
  };
});

import { runReplyAgent } from "./agent-runner.js";

async function seedSessionStore(params: {
  storePath: string;
  sessionKey: string;
  entry: Record<string, unknown>;
}) {
  await fs.mkdir(path.dirname(params.storePath), { recursive: true });
  await fs.writeFile(
    params.storePath,
    JSON.stringify({ [params.sessionKey]: params.entry }, null, 2),
    "utf-8",
  );
}

function createBaseRun(params: {
  storePath: string;
  sessionEntry: Record<string, unknown>;
  sessionKey: string;
  sessionFile: string;
  config?: Record<string, unknown>;
  runOverrides?: Partial<FollowupRun["run"]>;
}) {
  const typing = createMockTypingController();
  const sessionCtx = {
    Provider: "telegram",
    OriginatingTo: "dm",
    AccountId: "primary",
    MessageSid: "msg",
  } as unknown as TemplateContext;
  const resolvedQueue = { mode: "interrupt" } as unknown as QueueSettings;
  const followupRun = {
    prompt: "hello",
    summaryLine: "hello",
    enqueuedAt: Date.now(),
    run: {
      agentId: "main",
      agentDir: "/tmp/agent",
      sessionId: "session",
      sessionKey: params.sessionKey,
      messageProvider: "telegram",
      sessionFile: params.sessionFile,
      workspaceDir: "/tmp",
      config: params.config ?? {},
      skillsSnapshot: {},
      provider: "anthropic",
      model: "claude",
      thinkLevel: "low",
      verboseLevel: "off",
      elevatedLevel: "off",
      bashElevated: {
        enabled: false,
        allowed: false,
        defaultLevel: "off",
      },
      timeoutMs: 1_000,
      blockReplyBreak: "message_end",
    },
  } as unknown as FollowupRun;
  const run = {
    ...followupRun.run,
    ...params.runOverrides,
    config: params.config ?? followupRun.run.config,
  };

  return {
    typing,
    sessionCtx,
    resolvedQueue,
    followupRun: { ...followupRun, run },
  };
}

async function seedSessionTranscript(params: { sessionFile: string; userTurns: number }) {
  const sessionManager = SessionManager.open(params.sessionFile);
  const usage = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      total: 0,
    },
  };

  for (let i = 0; i < params.userTurns; i += 1) {
    sessionManager.appendMessage({
      role: "user",
      content: [{ type: "text", text: `user ${i}` }],
    });
    sessionManager.appendMessage({
      role: "assistant",
      content: [{ type: "text", text: `assistant ${i}` }],
      stopReason: "stop",
      api: "openai-responses",
      provider: "openai",
      model: "mock",
      usage,
      timestamp: Date.now(),
    });
  }
}

describe("runReplyAgent memory flush", () => {
  it("triggers on dmHistoryLimit for sandbox memory sessions", async () => {
    runEmbeddedPiAgentMock.mockReset();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-flush-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionFile = path.join(tmp, "session.jsonl");
    const sessionKey = "agent:main:telegram:dm:123";
    const sessionEntry = {
      sessionId: "session",
      sessionFile,
      updatedAt: Date.now(),
      totalTokens: 100,
      compactionCount: 1,
    };

    await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });
    await seedSessionTranscript({ sessionFile, userTurns: 2 });

    const calls: Array<{ prompt?: string }> = [];
    runEmbeddedPiAgentMock.mockImplementation(async (params: EmbeddedRunParams) => {
      calls.push({ prompt: params.prompt });
      if (params.prompt === DEFAULT_MEMORY_FLUSH_PROMPT) {
        return { payloads: [], meta: {} };
      }
      return {
        payloads: [{ text: "ok" }],
        meta: { agentMeta: { usage: { input: 1, output: 1 } } },
      };
    });

    const { typing, sessionCtx, resolvedQueue, followupRun } = createBaseRun({
      storePath,
      sessionEntry,
      sessionKey,
      sessionFile,
      config: {
        agents: {
          defaults: {
            sandbox: { mode: "all", workspaceAccess: "none", memory: "sandbox" },
          },
        },
        channels: {
          telegram: { dmHistoryLimit: 2 },
        },
      },
    });

    await runReplyAgent({
      commandBody: "hello",
      followupRun,
      queueKey: "main",
      resolvedQueue,
      shouldSteer: false,
      shouldFollowup: false,
      isActive: false,
      isStreaming: false,
      typing,
      sessionCtx,
      sessionEntry,
      sessionStore: { [sessionKey]: sessionEntry },
      sessionKey,
      storePath,
      defaultModel: "anthropic/claude-opus-4-5",
      agentCfgContextTokens: 100_000,
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    expect(calls.map((call) => call.prompt)).toEqual([DEFAULT_MEMORY_FLUSH_PROMPT, "hello"]);

    const stored = JSON.parse(await fs.readFile(storePath, "utf-8"));
    expect(stored[sessionKey].memoryFlushHistoryCount).toBe(2);
  });

  it("does not set history counters on token-triggered flushes", async () => {
    runEmbeddedPiAgentMock.mockReset();
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-flush-"));
    const storePath = path.join(tmp, "sessions.json");
    const sessionFile = path.join(tmp, "session.jsonl");
    const sessionKey = "agent:main:telegram:dm:123";
    const sessionEntry = {
      sessionId: "session",
      sessionFile,
      updatedAt: Date.now(),
      totalTokens: 200_000,
      compactionCount: 1,
    };

    await seedSessionStore({ storePath, sessionKey, entry: sessionEntry });
    await seedSessionTranscript({ sessionFile, userTurns: 1 });

    const calls: Array<{ prompt?: string }> = [];
    runEmbeddedPiAgentMock.mockImplementation(async (params: EmbeddedRunParams) => {
      calls.push({ prompt: params.prompt });
      if (params.prompt === DEFAULT_MEMORY_FLUSH_PROMPT) {
        return { payloads: [], meta: {} };
      }
      return {
        payloads: [{ text: "ok" }],
        meta: { agentMeta: { usage: { input: 1, output: 1 } } },
      };
    });

    const { typing, sessionCtx, resolvedQueue, followupRun } = createBaseRun({
      storePath,
      sessionEntry,
      sessionKey,
      sessionFile,
      config: {
        agents: {
          defaults: {
            sandbox: { mode: "all", workspaceAccess: "none", memory: "sandbox" },
          },
        },
        channels: {
          telegram: { dmHistoryLimit: 5 },
        },
      },
    });

    await runReplyAgent({
      commandBody: "hello",
      followupRun,
      queueKey: "main",
      resolvedQueue,
      shouldSteer: false,
      shouldFollowup: false,
      isActive: false,
      isStreaming: false,
      typing,
      sessionCtx,
      sessionEntry,
      sessionStore: { [sessionKey]: sessionEntry },
      sessionKey,
      storePath,
      defaultModel: "anthropic/claude-opus-4-5",
      agentCfgContextTokens: 100_000,
      resolvedVerboseLevel: "off",
      isNewSession: false,
      blockStreamingEnabled: false,
      resolvedBlockStreamingBreak: "message_end",
      shouldInjectGroupIntro: false,
      typingMode: "instant",
    });

    expect(calls.map((call) => call.prompt)).toEqual([DEFAULT_MEMORY_FLUSH_PROMPT, "hello"]);

    const stored = JSON.parse(await fs.readFile(storePath, "utf-8"));
    expect(stored[sessionKey].memoryFlushHistoryCount).toBeUndefined();
    expect(stored[sessionKey].memoryFlushAt).toBeDefined();
  });
});
