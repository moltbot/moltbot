import { describe, expect, it, vi } from "vitest";

const loadSessionStoreMock = vi.fn();

vi.mock("../config/sessions.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/sessions.js")>();
  return {
    ...actual,
    loadSessionStore: (storePath: string) => loadSessionStoreMock(storePath),
    resolveStorePath: (_store: string | undefined, opts?: { agentId?: string }) =>
      opts?.agentId === "support" ? "/tmp/support/sessions.json" : "/tmp/main/sessions.json",
    resolveSessionFilePath: (sessionId: string) => `/tmp/sessions/${sessionId}.json`,
  };
});

vi.mock("../config/config.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../config/config.js")>();
  return {
    ...actual,
    loadConfig: () => ({
      session: { mainKey: "main", scope: "per-sender" },
      agents: {
        defaults: {
          model: { primary: "anthropic/claude-sonnet-4-5" },
          models: {},
          workspaceDir: "/tmp/workspace",
        },
      },
    }),
  };
});

const compactEmbeddedPiSessionMock = vi.fn();

vi.mock("../agents/pi-embedded.js", () => ({
  compactEmbeddedPiSession: (params: unknown) => compactEmbeddedPiSessionMock(params),
}));

vi.mock("../auto-reply/thinking.js", () => ({
  resolveDefaultThinkingLevel: async () => "off",
}));

import "./test-helpers/fast-core-tools.js";
import { createMoltbotTools } from "./moltbot-tools.js";

describe("session_compact tool", () => {
  it("compacts the current session successfully", async () => {
    loadSessionStoreMock.mockReset();
    compactEmbeddedPiSessionMock.mockReset();

    loadSessionStoreMock.mockReturnValue({
      main: {
        sessionId: "s1",
        updatedAt: 10,
      },
    });

    compactEmbeddedPiSessionMock.mockResolvedValue({
      ok: true,
      compacted: true,
      result: {
        tokensBefore: 50000,
        tokensAfter: 15000,
      },
    });

    const tool = createMoltbotTools({ agentSessionKey: "main" }).find(
      (candidate) => candidate.name === "session_compact",
    );
    expect(tool).toBeDefined();
    if (!tool) throw new Error("missing session_compact tool");

    const result = await tool.execute("call1", {});
    const details = result.details as {
      ok?: boolean;
      compacted?: boolean;
      tokensBefore?: number;
      tokensAfter?: number;
    };

    expect(details.ok).toBe(true);
    expect(details.compacted).toBe(true);
    expect(details.tokensBefore).toBe(50000);
    expect(details.tokensAfter).toBe(15000);
    expect(compactEmbeddedPiSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "s1",
      }),
    );
  });

  it("passes custom instructions to compaction", async () => {
    loadSessionStoreMock.mockReset();
    compactEmbeddedPiSessionMock.mockReset();

    loadSessionStoreMock.mockReturnValue({
      main: {
        sessionId: "s1",
        updatedAt: 10,
      },
    });

    compactEmbeddedPiSessionMock.mockResolvedValue({
      ok: true,
      compacted: true,
      result: {
        tokensBefore: 30000,
        tokensAfter: 10000,
      },
    });

    const tool = createMoltbotTools({ agentSessionKey: "main" }).find(
      (candidate) => candidate.name === "session_compact",
    );
    expect(tool).toBeDefined();
    if (!tool) throw new Error("missing session_compact tool");

    await tool.execute("call2", { instructions: "Keep all TODOs" });

    expect(compactEmbeddedPiSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        customInstructions: "Keep all TODOs",
      }),
    );
  });

  it("errors for unknown session keys", async () => {
    loadSessionStoreMock.mockReset();
    compactEmbeddedPiSessionMock.mockReset();

    loadSessionStoreMock.mockReturnValue({
      main: { sessionId: "s1", updatedAt: 10 },
    });

    const tool = createMoltbotTools({ agentSessionKey: "main" }).find(
      (candidate) => candidate.name === "session_compact",
    );
    expect(tool).toBeDefined();
    if (!tool) throw new Error("missing session_compact tool");

    await expect(tool.execute("call3", { sessionKey: "nope" })).rejects.toThrow(
      "Unknown sessionId",
    );
    expect(compactEmbeddedPiSessionMock).not.toHaveBeenCalled();
  });

  it("errors when session has no sessionId", async () => {
    loadSessionStoreMock.mockReset();
    compactEmbeddedPiSessionMock.mockReset();

    loadSessionStoreMock.mockReturnValue({
      main: {
        updatedAt: 10,
        // no sessionId
      },
    });

    const tool = createMoltbotTools({ agentSessionKey: "main" }).find(
      (candidate) => candidate.name === "session_compact",
    );
    expect(tool).toBeDefined();
    if (!tool) throw new Error("missing session_compact tool");

    await expect(tool.execute("call4", {})).rejects.toThrow(
      "Compaction unavailable (missing session id)",
    );
    expect(compactEmbeddedPiSessionMock).not.toHaveBeenCalled();
  });

  it("blocks cross-agent session_compact without agent-to-agent access", async () => {
    loadSessionStoreMock.mockReset();
    compactEmbeddedPiSessionMock.mockReset();

    loadSessionStoreMock.mockReturnValue({
      "agent:other:main": {
        sessionId: "s2",
        updatedAt: 10,
      },
    });

    const tool = createMoltbotTools({ agentSessionKey: "agent:main:main" }).find(
      (candidate) => candidate.name === "session_compact",
    );
    expect(tool).toBeDefined();
    if (!tool) throw new Error("missing session_compact tool");

    await expect(tool.execute("call5", { sessionKey: "agent:other:main" })).rejects.toThrow(
      "Agent-to-agent compact is disabled",
    );
    expect(compactEmbeddedPiSessionMock).not.toHaveBeenCalled();
  });

  it("handles compaction failure gracefully", async () => {
    loadSessionStoreMock.mockReset();
    compactEmbeddedPiSessionMock.mockReset();

    loadSessionStoreMock.mockReturnValue({
      main: {
        sessionId: "s1",
        updatedAt: 10,
      },
    });

    compactEmbeddedPiSessionMock.mockResolvedValue({
      ok: false,
      compacted: false,
      reason: "API error",
    });

    const tool = createMoltbotTools({ agentSessionKey: "main" }).find(
      (candidate) => candidate.name === "session_compact",
    );
    expect(tool).toBeDefined();
    if (!tool) throw new Error("missing session_compact tool");

    const result = await tool.execute("call6", {});
    const details = result.details as {
      ok?: boolean;
      compacted?: boolean;
      reason?: string;
    };

    expect(details.ok).toBe(false);
    expect(details.compacted).toBe(false);
    expect(details.reason).toBe("API error");
  });

  it("handles compaction skipped", async () => {
    loadSessionStoreMock.mockReset();
    compactEmbeddedPiSessionMock.mockReset();

    loadSessionStoreMock.mockReturnValue({
      main: {
        sessionId: "s1",
        updatedAt: 10,
      },
    });

    compactEmbeddedPiSessionMock.mockResolvedValue({
      ok: true,
      compacted: false,
      reason: "Context too small",
    });

    const tool = createMoltbotTools({ agentSessionKey: "main" }).find(
      (candidate) => candidate.name === "session_compact",
    );
    expect(tool).toBeDefined();
    if (!tool) throw new Error("missing session_compact tool");

    const result = await tool.execute("call7", {});
    const details = result.details as {
      ok?: boolean;
      compacted?: boolean;
      reason?: string;
    };

    expect(details.ok).toBe(true);
    expect(details.compacted).toBe(false);
    expect(details.reason).toBe("Context too small");
  });
});
