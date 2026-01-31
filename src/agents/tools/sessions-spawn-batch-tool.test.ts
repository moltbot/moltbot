import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/config.js", () => ({
  loadConfig: () => ({
    agents: { defaults: {} },
    sessions: { main: { key: "agent:test-agent:main" } },
  }),
}));

vi.mock("../../gateway/call.js", () => ({
  callGateway: vi.fn().mockResolvedValue({ runId: "mock-run-id" }),
}));

vi.mock("../subagent-announce.js", () => ({
  buildSubagentSystemPrompt: () => "mock-system-prompt",
}));

vi.mock("../subagent-registry.js", () => ({
  registerSubagentRun: vi.fn(),
}));

vi.mock("../../routing/session-key.js", () => ({
  isSubagentSessionKey: (key: string) => key.includes(":subagent:"),
  normalizeAgentId: (id: string) => id ?? "test-agent",
  parseAgentSessionKey: (key: string) => {
    const match = /^agent:([^:]+)/.exec(key);
    return match ? { agentId: match[1] } : null;
  },
}));

vi.mock("../../utils/delivery-context.js", () => ({
  normalizeDeliveryContext: () => ({ channel: "discord" }),
}));

vi.mock("./sessions-helpers.js", () => ({
  resolveMainSessionAlias: () => ({
    mainKey: "agent:test-agent:main",
    alias: "agent:test-agent:main",
  }),
  resolveInternalSessionKey: ({ key }: { key: string }) => key,
  resolveDisplaySessionKey: ({ key }: { key: string }) => key,
}));

vi.mock("../agent-scope.js", () => ({
  resolveAgentConfig: () => null,
}));

import { callGateway } from "../../gateway/call.js";
import { registerSubagentRun } from "../subagent-registry.js";
import { createSessionsSpawnBatchTool } from "./sessions-spawn-batch-tool.js";

const mockedCallGateway = vi.mocked(callGateway);
const mockedRegister = vi.mocked(registerSubagentRun);

describe("sessions_spawn_batch tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCallGateway.mockResolvedValue({ runId: "mock-run-id" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("spawns multiple tasks in parallel", async () => {
    const tool = createSessionsSpawnBatchTool({
      agentSessionKey: "agent:test-agent:main",
    });
    const result = await tool.execute("tc1", {
      tasks: [
        { task: "Research topic A" },
        { task: "Research topic B", label: "topic-b" },
        { task: "Research topic C" },
      ],
    });
    const parsed = JSON.parse(
      (result.content?.find((b) => b.type === "text") as { text: string })?.text ?? "{}",
    );

    expect(parsed.status).toBe("accepted");
    expect(parsed.total).toBe(3);
    expect(parsed.accepted).toBe(3);
    expect(parsed.failed).toBe(0);
    expect(parsed.results).toHaveLength(3);
    // Each spawn calls gateway twice (sessions.patch is skipped when no model, so only "agent")
    expect(mockedCallGateway).toHaveBeenCalledTimes(3);
    expect(mockedRegister).toHaveBeenCalledTimes(3);
  });

  it("rejects empty tasks array", async () => {
    const tool = createSessionsSpawnBatchTool({
      agentSessionKey: "agent:test-agent:main",
    });
    const result = await tool.execute("tc1", { tasks: [] });
    const parsed = JSON.parse(
      (result.content?.find((b) => b.type === "text") as { text: string })?.text ?? "{}",
    );
    expect(parsed.status).toBe("error");
    expect(parsed.error).toContain("required");
  });

  it("rejects more than 10 tasks", async () => {
    const tool = createSessionsSpawnBatchTool({
      agentSessionKey: "agent:test-agent:main",
    });
    const tasks = Array.from({ length: 11 }, (_, i) => ({ task: `Task ${i}` }));
    const result = await tool.execute("tc1", { tasks });
    const parsed = JSON.parse(
      (result.content?.find((b) => b.type === "text") as { text: string })?.text ?? "{}",
    );
    expect(parsed.status).toBe("error");
    expect(parsed.error).toContain("exceeds maximum");
  });

  it("blocks subagent-from-subagent spawning", async () => {
    const tool = createSessionsSpawnBatchTool({
      agentSessionKey: "agent:test-agent:subagent:child-123",
    });
    const result = await tool.execute("tc1", {
      tasks: [{ task: "Do something" }],
    });
    const parsed = JSON.parse(
      (result.content?.find((b) => b.type === "text") as { text: string })?.text ?? "{}",
    );
    expect(parsed.status).toBe("forbidden");
    expect(parsed.error).toContain("sub-agent");
  });

  it("handles partial failures gracefully", async () => {
    let callCount = 0;
    mockedCallGateway.mockImplementation(async () => {
      callCount++;
      if (callCount === 2) throw new Error("gateway timeout");
      return { runId: `run-${callCount}` };
    });

    const tool = createSessionsSpawnBatchTool({
      agentSessionKey: "agent:test-agent:main",
    });
    const result = await tool.execute("tc1", {
      tasks: [{ task: "Task A" }, { task: "Task B" }, { task: "Task C" }],
    });
    const parsed = JSON.parse(
      (result.content?.find((b) => b.type === "text") as { text: string })?.text ?? "{}",
    );

    expect(parsed.status).toBe("partial");
    expect(parsed.total).toBe(3);
    // At least some accepted, at least one failed
    expect(parsed.accepted + parsed.failed).toBe(3);
    expect(parsed.failed).toBeGreaterThan(0);
  });

  it("preserves label in results", async () => {
    const tool = createSessionsSpawnBatchTool({
      agentSessionKey: "agent:test-agent:main",
    });
    const result = await tool.execute("tc1", {
      tasks: [{ task: "Task A", label: "research" }, { task: "Task B" }],
    });
    const parsed = JSON.parse(
      (result.content?.find((b) => b.type === "text") as { text: string })?.text ?? "{}",
    );
    expect(parsed.results[0].label).toBe("research");
    expect(parsed.results[1].label).toBeUndefined();
  });
});
