import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  monitorTwilio,
  resetSeenMessageSids,
  resolveHeartbeatRecipient,
} from "./monitor.js";

// Base mock deps factory
function createMockDeps(overrides: Record<string, unknown> = {}) {
  return {
    autoReplyIfConfigured: vi.fn().mockResolvedValue(undefined),
    listRecentMessages: vi.fn().mockResolvedValue([]),
    readEnv: vi.fn(() => ({
      accountSid: "AC",
      whatsappFrom: "whatsapp:+1",
      auth: { accountSid: "AC", authToken: "t" },
    })),
    createClient: vi.fn(() => ({ messages: { create: vi.fn() } }) as never),
    sleep: vi.fn().mockResolvedValue(undefined),
    loadConfig: vi.fn(() => ({})),
    runTwilioHeartbeatOnce: vi.fn().mockResolvedValue(undefined),
    getQueueSize: vi.fn(() => 0),
    ...overrides,
  };
}

describe("monitorTwilio", () => {
  beforeEach(() => {
    resetSeenMessageSids();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("processes inbound messages once with injected deps", async () => {
    const listRecentMessages = vi.fn().mockResolvedValue([
      {
        sid: "m1",
        direction: "inbound",
        dateCreated: new Date(),
        from: "+1",
        to: "+2",
        body: "hi",
        errorCode: null,
        errorMessage: null,
        status: null,
      },
    ]);

    const deps = createMockDeps({ listRecentMessages });

    const monitorPromise = monitorTwilio(0, 0, {
      deps,
      maxIterations: 1,
    });

    // Advance timers to complete the iteration
    await vi.runAllTimersAsync();
    await monitorPromise;

    expect(listRecentMessages).toHaveBeenCalledTimes(1);
    expect(deps.autoReplyIfConfigured).toHaveBeenCalledTimes(1);
  });

  describe("heartbeat timer setup", () => {
    it("sets up heartbeat timer when heartbeatMinutes is configured", async () => {
      const setIntervalSpy = vi.spyOn(global, "setInterval");
      const deps = createMockDeps({
        loadConfig: vi.fn(() => ({
          inbound: {
            allowFrom: ["+15551234567"], // Provide a recipient
            reply: {
              mode: "command" as const,
              command: ["echo", "test"],
              heartbeatMinutes: 1,
            },
          },
        })),
      });

      const monitorPromise = monitorTwilio(5, 5, {
        deps,
        maxIterations: 1,
      });

      await vi.runAllTimersAsync();
      await monitorPromise;

      // Heartbeat timer should have been set up with 60000ms (1 minute) interval
      expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 60_000);
    });

    it("does not set up heartbeat timer when heartbeatMinutes is 0", async () => {
      const runTwilioHeartbeatOnce = vi.fn().mockResolvedValue(undefined);
      const deps = createMockDeps({
        loadConfig: vi.fn(() => ({
          inbound: {
            reply: {
              mode: "command" as const,
              command: ["echo", "test"],
              heartbeatMinutes: 0,
            },
          },
        })),
        runTwilioHeartbeatOnce,
      });

      const monitorPromise = monitorTwilio(5, 5, {
        deps,
        maxIterations: 1,
      });

      // Advance timer past what would be the heartbeat interval
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.runAllTimersAsync();
      await monitorPromise;

      // Heartbeat should not have been triggered
      expect(runTwilioHeartbeatOnce).not.toHaveBeenCalled();
    });
  });

  describe("heartbeat immediate (heartbeatNow)", () => {
    it("runs immediate heartbeat when heartbeatNow is true", async () => {
      const runTwilioHeartbeatOnce = vi.fn().mockResolvedValue(undefined);
      const deps = createMockDeps({
        loadConfig: vi.fn(() => ({
          inbound: {
            allowFrom: ["+15551234567"],
            reply: {
              mode: "command" as const,
              command: ["echo", "test"],
              heartbeatMinutes: 10,
            },
          },
        })),
        runTwilioHeartbeatOnce,
      });

      const monitorPromise = monitorTwilio(5, 5, {
        deps,
        maxIterations: 1,
        heartbeatNow: true,
      });

      // Run immediate timer callbacks (for the immediate heartbeat)
      await vi.runAllTimersAsync();
      await monitorPromise;

      // Heartbeat should have been called immediately
      expect(runTwilioHeartbeatOnce).toHaveBeenCalled();
    });
  });

  describe("heartbeat skips when busy", () => {
    it("skips heartbeat when command queue is busy", async () => {
      const runTwilioHeartbeatOnce = vi.fn().mockResolvedValue(undefined);
      const deps = createMockDeps({
        loadConfig: vi.fn(() => ({
          inbound: {
            allowFrom: ["+15551234567"],
            reply: {
              mode: "command" as const,
              command: ["echo", "test"],
              heartbeatMinutes: 1,
            },
          },
        })),
        runTwilioHeartbeatOnce,
        getQueueSize: vi.fn(() => 1), // Queue is busy
      });

      const monitorPromise = monitorTwilio(5, 5, {
        deps,
        maxIterations: 1,
        heartbeatNow: true,
      });

      await vi.runAllTimersAsync();
      await monitorPromise;

      // Heartbeat should NOT have been called because queue is busy
      expect(runTwilioHeartbeatOnce).not.toHaveBeenCalled();
    });
  });

  describe("heartbeat error handling", () => {
    it("catches heartbeat errors without crashing", async () => {
      const runtimeError = vi.fn();
      const runTwilioHeartbeatOnce = vi
        .fn()
        .mockRejectedValue(new Error("Heartbeat failed"));
      const deps = createMockDeps({
        loadConfig: vi.fn(() => ({
          inbound: {
            allowFrom: ["+15551234567"],
            reply: {
              mode: "command" as const,
              command: ["echo", "test"],
              heartbeatMinutes: 1,
            },
          },
        })),
        runTwilioHeartbeatOnce,
      });

      const monitorPromise = monitorTwilio(5, 5, {
        deps,
        maxIterations: 1,
        heartbeatNow: true,
        runtime: {
          log: vi.fn(),
          error: runtimeError,
          exit: vi.fn() as unknown as (code: number) => never,
        },
      });

      await vi.runAllTimersAsync();
      await monitorPromise;

      // Should have logged error but not crashed
      expect(runtimeError).toHaveBeenCalledWith(
        expect.stringContaining("Heartbeat failed"),
      );
    });
  });

  describe("heartbeat idle time check", () => {
    it("skips heartbeat when not idle long enough", async () => {
      const runTwilioHeartbeatOnce = vi.fn().mockResolvedValue(undefined);
      const nowMs = Date.now();
      const recentInboundTime = nowMs - 2 * 60_000; // 2 minutes ago

      const deps = createMockDeps({
        listRecentMessages: vi.fn().mockResolvedValue([
          {
            sid: "m1",
            direction: "inbound",
            dateCreated: new Date(recentInboundTime),
            from: "+15559999999",
            to: "+15551234567",
            body: "hi",
            errorCode: null,
            errorMessage: null,
            status: null,
          },
        ]),
        loadConfig: vi.fn(() => ({
          inbound: {
            reply: {
              mode: "command" as const,
              command: ["echo", "test"],
              heartbeatMinutes: 1,
              session: {
                heartbeatIdleMinutes: 5, // Require 5 min idle
              },
            },
          },
        })),
        runTwilioHeartbeatOnce,
      });

      const monitorPromise = monitorTwilio(5, 5, {
        deps,
        maxIterations: 2,
      });

      // Advance to trigger heartbeat (60s)
      await vi.advanceTimersByTimeAsync(60_000);
      await vi.runAllTimersAsync();
      await monitorPromise;

      // Heartbeat should be skipped because last inbound was only 2 min ago (< 5 min)
      expect(runTwilioHeartbeatOnce).not.toHaveBeenCalled();
    });
  });

  describe("timer cleanup", () => {
    it("clears heartbeat timer on exit", async () => {
      const clearIntervalSpy = vi.spyOn(global, "clearInterval");
      const deps = createMockDeps({
        loadConfig: vi.fn(() => ({
          inbound: {
            reply: {
              mode: "command" as const,
              command: ["echo", "test"],
              heartbeatMinutes: 1,
            },
          },
        })),
      });

      const monitorPromise = monitorTwilio(5, 5, {
        deps,
        maxIterations: 1,
      });

      await vi.runAllTimersAsync();
      await monitorPromise;

      // clearInterval should have been called for cleanup
      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });
});

describe("resolveHeartbeatRecipient", () => {
  it("returns lastInboundFrom when available", () => {
    const cfg = { inbound: { allowFrom: ["+15551234567"] } };
    const result = resolveHeartbeatRecipient(cfg, "whatsapp:+15559999999");
    expect(result).toBe("+15559999999");
  });

  it("strips whatsapp: prefix from lastInboundFrom", () => {
    const cfg = {};
    const result = resolveHeartbeatRecipient(cfg, "whatsapp:+15559999999");
    expect(result).toBe("+15559999999");
  });

  it("falls back to first non-wildcard allowFrom entry", () => {
    const cfg = {
      inbound: { allowFrom: ["*", "+15551234567", "+15552222222"] },
    };
    const result = resolveHeartbeatRecipient(cfg, undefined);
    expect(result).toBe("+15551234567");
  });

  it("returns null when allowFrom is empty", () => {
    const cfg = { inbound: { allowFrom: [] } };
    const result = resolveHeartbeatRecipient(cfg, undefined);
    expect(result).toBeNull();
  });

  it("returns null when allowFrom contains only wildcards", () => {
    const cfg = { inbound: { allowFrom: ["*"] } };
    const result = resolveHeartbeatRecipient(cfg, undefined);
    expect(result).toBeNull();
  });

  it("returns null when no allowFrom and no lastInboundFrom", () => {
    const cfg = {};
    const result = resolveHeartbeatRecipient(cfg, undefined);
    expect(result).toBeNull();
  });
});
