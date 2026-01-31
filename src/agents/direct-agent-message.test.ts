import { beforeEach, describe, expect, it, vi } from "vitest";

const callGatewayMock = vi.fn();
vi.mock("../gateway/call.js", () => ({
  callGateway: (...args: unknown[]) => callGatewayMock(...args),
}));

const loadConfigMock = vi.fn();
vi.mock("../config/config.js", () => ({
  loadConfig: (...args: unknown[]) => loadConfigMock(...args),
}));

const loadSessionStoreMock = vi.fn();
const resolveAgentIdFromSessionKeyMock = vi.fn();
const resolveStorePathMock = vi.fn();
vi.mock("../config/sessions.js", () => ({
  loadSessionStore: (...args: unknown[]) => loadSessionStoreMock(...args),
  resolveAgentIdFromSessionKey: (...args: unknown[]) => resolveAgentIdFromSessionKeyMock(...args),
  resolveStorePath: (...args: unknown[]) => resolveStorePathMock(...args),
}));

const resolveQueueSettingsMock = vi.fn();
vi.mock("../auto-reply/reply/queue.js", () => ({
  resolveQueueSettings: (...args: unknown[]) => resolveQueueSettingsMock(...args),
}));

const isEmbeddedPiRunActiveMock = vi.fn();
const queueEmbeddedPiMessageMock = vi.fn();
vi.mock("./pi-embedded.js", () => ({
  isEmbeddedPiRunActive: (...args: unknown[]) => isEmbeddedPiRunActiveMock(...args),
  queueEmbeddedPiMessage: (...args: unknown[]) => queueEmbeddedPiMessageMock(...args),
}));

const enqueueAnnounceMock = vi.fn();
vi.mock("./subagent-announce-queue.js", () => ({
  enqueueAnnounce: (...args: unknown[]) => enqueueAnnounceMock(...args),
}));

import { sendDirectAgentMessage } from "./direct-agent-message.js";

const defaultConfig = { session: { store: undefined } };

function setupDefaults(entry?: Record<string, unknown>) {
  loadConfigMock.mockReturnValue(defaultConfig);
  resolveAgentIdFromSessionKeyMock.mockReturnValue("main");
  resolveStorePathMock.mockReturnValue("/tmp/sessions.json");
  const store: Record<string, unknown> = {};
  if (entry) store["agent:main:main"] = entry;
  loadSessionStoreMock.mockReturnValue(store);
  resolveQueueSettingsMock.mockReturnValue({ mode: "collect" });
  isEmbeddedPiRunActiveMock.mockReturnValue(false);
  queueEmbeddedPiMessageMock.mockReturnValue(false);
  callGatewayMock.mockResolvedValue({ ok: true });
}

beforeEach(() => {
  callGatewayMock.mockReset();
  loadConfigMock.mockReset();
  loadSessionStoreMock.mockReset();
  resolveAgentIdFromSessionKeyMock.mockReset();
  resolveStorePathMock.mockReset();
  resolveQueueSettingsMock.mockReset();
  isEmbeddedPiRunActiveMock.mockReset();
  queueEmbeddedPiMessageMock.mockReset();
  enqueueAnnounceMock.mockReset();
});

describe("sendDirectAgentMessage", () => {
  it("sends directly when agent is not busy", async () => {
    setupDefaults({ sessionId: "sess-1", lastChannel: "clawline", lastTo: "flynn" });

    const result = await sendDirectAgentMessage({
      sessionKey: "agent:main:main",
      message: "hello",
    });

    expect(result).toEqual({ outcome: "sent" });
    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    const call = callGatewayMock.mock.calls[0][0];
    expect(call.method).toBe("agent");
    expect(call.expectFinal).toBe(true);
    expect(call.timeoutMs).toBe(60_000);
    expect(call.params.deliver).toBe(true);
    expect(call.params.sessionKey).toBe("agent:main:main");
    expect(call.params.channel).toBe("clawline");
    expect(call.params.to).toBe("flynn");
  });

  it("steers when active and steer mode", async () => {
    setupDefaults({ sessionId: "sess-1" });
    resolveQueueSettingsMock.mockReturnValue({ mode: "steer" });
    isEmbeddedPiRunActiveMock.mockReturnValue(true);
    queueEmbeddedPiMessageMock.mockReturnValue(true);

    const result = await sendDirectAgentMessage({
      sessionKey: "agent:main:main",
      message: "steered msg",
    });

    expect(result).toEqual({ outcome: "steered" });
    expect(queueEmbeddedPiMessageMock).toHaveBeenCalledWith("sess-1", "steered msg");
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("queues when active and followup mode", async () => {
    setupDefaults({ sessionId: "sess-1" });
    resolveQueueSettingsMock.mockReturnValue({ mode: "followup" });
    isEmbeddedPiRunActiveMock.mockReturnValue(true);

    const result = await sendDirectAgentMessage({
      sessionKey: "agent:main:main",
      message: "queued msg",
      summaryLine: "Alert",
    });

    expect(result).toEqual({ outcome: "queued" });
    expect(enqueueAnnounceMock).toHaveBeenCalledTimes(1);
    const enqueueCall = enqueueAnnounceMock.mock.calls[0][0];
    expect(enqueueCall.key).toBe("agent:main:main");
    expect(enqueueCall.item.prompt).toBe("queued msg");
    expect(enqueueCall.item.summaryLine).toBe("Alert");
    expect(callGatewayMock).not.toHaveBeenCalled();
  });

  it("uses explicit deliveryContext over session store values", async () => {
    setupDefaults({
      sessionId: "sess-1",
      lastChannel: "telegram",
      lastTo: "+1234",
    });

    const result = await sendDirectAgentMessage({
      sessionKey: "agent:main:main",
      message: "test",
      deliveryContext: { channel: "clawline", to: "flynn" },
    });

    expect(result).toEqual({ outcome: "sent" });
    const call = callGatewayMock.mock.calls[0][0];
    expect(call.params.channel).toBe("clawline");
    expect(call.params.to).toBe("flynn");
  });

  it("falls back to session store delivery context when no explicit context", async () => {
    setupDefaults({
      sessionId: "sess-1",
      lastChannel: "telegram",
      lastTo: "+1234",
    });

    const result = await sendDirectAgentMessage({
      sessionKey: "agent:main:main",
      message: "test",
    });

    expect(result).toEqual({ outcome: "sent" });
    const call = callGatewayMock.mock.calls[0][0];
    expect(call.params.channel).toBe("telegram");
    expect(call.params.to).toBe("+1234");
  });

  it("sends directly when session entry is missing", async () => {
    setupDefaults(); // no entry

    const result = await sendDirectAgentMessage({
      sessionKey: "agent:main:main",
      message: "test",
    });

    expect(result).toEqual({ outcome: "sent" });
    expect(callGatewayMock).toHaveBeenCalledTimes(1);
    expect(isEmbeddedPiRunActiveMock).not.toHaveBeenCalled();
  });

  it("passes custom timeout to callGateway", async () => {
    setupDefaults({ sessionId: "sess-1" });

    await sendDirectAgentMessage({
      sessionKey: "agent:main:main",
      message: "test",
      timeoutMs: 30_000,
    });

    const call = callGatewayMock.mock.calls[0][0];
    expect(call.timeoutMs).toBe(30_000);
  });

  it("returns error outcome when callGateway rejects", async () => {
    setupDefaults({ sessionId: "sess-1" });
    callGatewayMock.mockRejectedValue(new Error("connection refused"));

    const result = await sendDirectAgentMessage({
      sessionKey: "agent:main:main",
      message: "test",
    });

    expect(result).toEqual({
      outcome: "error",
      error: "Error: connection refused",
    });
  });

  it("calls log callback at each stage", async () => {
    setupDefaults({ sessionId: "sess-1" });
    const logFn = vi.fn();

    await sendDirectAgentMessage({
      sessionKey: "agent:main:main",
      message: "test",
      log: logFn,
    });

    const events = logFn.mock.calls.map((c) => c[0]);
    expect(events).toContain("direct_agent_resolve");
    expect(events).toContain("direct_agent_sent");
  });
});
