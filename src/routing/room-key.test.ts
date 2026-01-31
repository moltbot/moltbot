import { describe, expect, it } from "vitest";

import {
  initializeGlobalHookRunner,
  resetGlobalHookRunner,
} from "../plugins/hook-runner-global.js";
import { resolveCanonicalRoomKey } from "./room-key.js";
import { resolveSessionLane } from "../agents/pi-embedded-runner/lanes.js";

function makeRegistry(hooks: any[]) {
  return {
    hooks: [],
    typedHooks: hooks,
  } as any;
}

describe("resolve_room_key hook", () => {
  it("leaves roomKey unchanged when no hooks are registered", async () => {
    resetGlobalHookRunner();
    initializeGlobalHookRunner(makeRegistry([]));

    const roomKey = await resolveCanonicalRoomKey({
      roomKey: "agent:main:telegram:dm:123",
      baseRoomKey: "agent:main:telegram:dm:123",
      event: {
        agentId: "main",
        channel: "telegram",
        accountId: "default",
        peer: { kind: "dm", id: "123" },
        messageId: 1,
      },
    });

    expect(roomKey).toBe("agent:main:telegram:dm:123");
    expect(resolveSessionLane(roomKey)).toBe("session:agent:main:telegram:dm:123");
  });

  it("uses returned roomKey as canonical key (session identity + FIFO lane)", async () => {
    const hooks = [
      {
        hookName: "resolve_room_key",
        pluginId: "test",
        priority: 0,
        handler: async (event: any) => {
          return { roomKey: `${event.roomKey}:proj:proj-abc` };
        },
      },
    ];

    resetGlobalHookRunner();
    initializeGlobalHookRunner(makeRegistry(hooks));

    const roomKey = await resolveCanonicalRoomKey({
      roomKey: "agent:main:telegram:dm:123",
      baseRoomKey: "agent:main:telegram:dm:123",
      event: {
        agentId: "main",
        channel: "telegram",
        accountId: "default",
        peer: { kind: "dm", id: "123" },
        messageId: 2,
      },
    });

    expect(roomKey).toBe("agent:main:telegram:dm:123:proj:proj-abc");
    expect(resolveSessionLane(roomKey)).toBe("session:agent:main:telegram:dm:123:proj:proj-abc");
  });

  it("falls back to computed key when hook returns empty/whitespace", async () => {
    const hooks = [
      {
        hookName: "resolve_room_key",
        pluginId: "test",
        priority: 0,
        handler: async () => ({ roomKey: "   " }),
      },
    ];

    resetGlobalHookRunner();
    initializeGlobalHookRunner(makeRegistry(hooks));

    const roomKey = await resolveCanonicalRoomKey({
      roomKey: "agent:main:telegram:dm:123",
      baseRoomKey: "agent:main:telegram:dm:123",
      event: {
        agentId: "main",
        channel: "telegram",
        accountId: "default",
        peer: { kind: "dm", id: "123" },
        messageId: 3,
      },
    });

    expect(roomKey).toBe("agent:main:telegram:dm:123");
  });

  it("uses first valid answer in priority order", async () => {
    const hooks = [
      {
        hookName: "resolve_room_key",
        pluginId: "high",
        priority: 10,
        handler: async () => ({ roomKey: "agent:main:telegram:dm:123:hi" }),
      },
      {
        hookName: "resolve_room_key",
        pluginId: "low",
        priority: 0,
        handler: async () => ({ roomKey: "agent:main:telegram:dm:123:lo" }),
      },
    ];

    resetGlobalHookRunner();
    initializeGlobalHookRunner(makeRegistry(hooks));

    const roomKey = await resolveCanonicalRoomKey({
      roomKey: "agent:main:telegram:dm:123",
      baseRoomKey: "agent:main:telegram:dm:123",
      event: {
        agentId: "main",
        channel: "telegram",
        accountId: "default",
        peer: { kind: "dm", id: "123" },
        messageId: 4,
      },
    });

    expect(roomKey).toBe("agent:main:telegram:dm:123:hi");
  });
});
