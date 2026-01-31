import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendToSession } from "./send-to-session.js";

// Mock deliverOutboundPayloads
vi.mock("./deliver.js", () => ({
  deliverOutboundPayloads: vi
    .fn()
    .mockResolvedValue([{ channel: "telegram", messageId: "123", chatId: "456" }]),
}));

describe("sendToSession", () => {
  let tmpDir: string;
  let storePath: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp("/tmp/send-to-session-test-");
    storePath = path.join(tmpDir, "sessions.json");
  });

  afterEach(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("returns error when session not found", async () => {
    // Create empty session store
    await fs.promises.writeFile(storePath, JSON.stringify({}));

    const result = await sendToSession({
      sessionKey: "telegram:123",
      text: "Hello",
      cfg: { session: { store: storePath } } as any,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("Session not found");
    }
  });

  it("returns error when session has no channel", async () => {
    await fs.promises.writeFile(
      storePath,
      JSON.stringify({
        "telegram:123": {
          sessionId: "abc",
          updatedAt: Date.now(),
          lastTo: "456",
          // no lastChannel
        },
      }),
    );

    const result = await sendToSession({
      sessionKey: "telegram:123",
      text: "Hello",
      cfg: { session: { store: storePath } } as any,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("No channel found");
    }
  });

  it("returns error when session has no destination", async () => {
    await fs.promises.writeFile(
      storePath,
      JSON.stringify({
        "telegram:123": {
          sessionId: "abc",
          updatedAt: Date.now(),
          lastChannel: "telegram",
          // no lastTo
        },
      }),
    );

    const result = await sendToSession({
      sessionKey: "telegram:123",
      text: "Hello",
      cfg: { session: { store: storePath } } as any,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("No destination found");
    }
  });

  it("delivers message when session has valid routing", async () => {
    const { deliverOutboundPayloads } = await import("./deliver.js");

    await fs.promises.writeFile(
      storePath,
      JSON.stringify({
        "telegram:123": {
          sessionId: "abc",
          updatedAt: Date.now(),
          lastChannel: "telegram",
          lastTo: "456",
          lastAccountId: "bot1",
          lastThreadId: "789",
        },
      }),
    );

    const result = await sendToSession({
      sessionKey: "telegram:123",
      text: "Hello world",
      cfg: { session: { store: storePath } } as any,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.results).toHaveLength(1);
      expect(result.results[0].channel).toBe("telegram");
    }

    expect(deliverOutboundPayloads).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "telegram",
        to: "456",
        accountId: "bot1",
        threadId: "789",
        payloads: [{ text: "Hello world" }],
      }),
    );
  });

  it("skips webchat channel", async () => {
    await fs.promises.writeFile(
      storePath,
      JSON.stringify({
        "webchat:123": {
          sessionId: "abc",
          updatedAt: Date.now(),
          lastChannel: "webchat",
          lastTo: "456",
        },
      }),
    );

    const result = await sendToSession({
      sessionKey: "webchat:123",
      text: "Hello",
      cfg: { session: { store: storePath } } as any,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("No channel found");
    }
  });
});
