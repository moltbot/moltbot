import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { MessageEvent } from "@line/bot-sdk";

const { buildLineMessageContextMock, buildLinePostbackContextMock } = vi.hoisted(() => ({
  buildLineMessageContextMock: vi.fn(async () => ({
    ctxPayload: { From: "line:group:group-1" },
    replyToken: "reply-token",
    route: { agentId: "default" },
    isGroup: true,
    accountId: "default",
  })),
  buildLinePostbackContextMock: vi.fn(async () => null),
}));

vi.mock("./bot-message-context.js", () => ({
  buildLineMessageContext: (...args: unknown[]) => buildLineMessageContextMock(...args),
  buildLinePostbackContext: (...args: unknown[]) => buildLinePostbackContextMock(...args),
}));

const { readAllowFromStoreMock, upsertPairingRequestMock } = vi.hoisted(() => ({
  readAllowFromStoreMock: vi.fn(async () => [] as string[]),
  upsertPairingRequestMock: vi.fn(async () => ({ code: "CODE", created: true })),
}));

let handleLineWebhookEvents: typeof import("./bot-handlers.js").handleLineWebhookEvents;

vi.mock("../pairing/pairing-store.js", () => ({
  readChannelAllowFromStore: (...args: unknown[]) => readAllowFromStoreMock(...args),
  upsertChannelPairingRequest: (...args: unknown[]) => upsertPairingRequestMock(...args),
}));

describe("handleLineWebhookEvents", () => {
  beforeAll(async () => {
    ({ handleLineWebhookEvents } = await import("./bot-handlers.js"));
  });

  beforeEach(() => {
    buildLineMessageContextMock.mockClear();
    buildLinePostbackContextMock.mockClear();
    readAllowFromStoreMock.mockClear();
    upsertPairingRequestMock.mockClear();
  });

  it("blocks group messages when groupPolicy is disabled", async () => {
    const processMessage = vi.fn();
    const event = {
      type: "message",
      message: { id: "m1", type: "text", text: "hi" },
      replyToken: "reply-token",
      timestamp: Date.now(),
      source: { type: "group", groupId: "group-1", userId: "user-1" },
      mode: "active",
      webhookEventId: "evt-1",
      deliveryContext: { isRedelivery: false },
    } as MessageEvent;

    await handleLineWebhookEvents([event], {
      cfg: { channels: { line: { groupPolicy: "disabled" } } },
      account: {
        accountId: "default",
        enabled: true,
        channelAccessToken: "token",
        channelSecret: "secret",
        tokenSource: "config",
        config: { groupPolicy: "disabled" },
      },
      runtime: { error: vi.fn() },
      mediaMaxBytes: 1,
      processMessage,
    });

    expect(processMessage).not.toHaveBeenCalled();
    expect(buildLineMessageContextMock).not.toHaveBeenCalled();
  });

  it("blocks group messages when allowlist is empty", async () => {
    const processMessage = vi.fn();
    const event = {
      type: "message",
      message: { id: "m2", type: "text", text: "hi" },
      replyToken: "reply-token",
      timestamp: Date.now(),
      source: { type: "group", groupId: "group-1", userId: "user-2" },
      mode: "active",
      webhookEventId: "evt-2",
      deliveryContext: { isRedelivery: false },
    } as MessageEvent;

    await handleLineWebhookEvents([event], {
      cfg: { channels: { line: { groupPolicy: "allowlist" } } },
      account: {
        accountId: "default",
        enabled: true,
        channelAccessToken: "token",
        channelSecret: "secret",
        tokenSource: "config",
        config: { groupPolicy: "allowlist" },
      },
      runtime: { error: vi.fn() },
      mediaMaxBytes: 1,
      processMessage,
    });

    expect(processMessage).not.toHaveBeenCalled();
    expect(buildLineMessageContextMock).not.toHaveBeenCalled();
  });

  it("allows group messages when sender is in groupAllowFrom", async () => {
    const processMessage = vi.fn();
    const event = {
      type: "message",
      message: { id: "m3", type: "text", text: "hi" },
      replyToken: "reply-token",
      timestamp: Date.now(),
      source: { type: "group", groupId: "group-1", userId: "user-3" },
      mode: "active",
      webhookEventId: "evt-3",
      deliveryContext: { isRedelivery: false },
    } as MessageEvent;

    await handleLineWebhookEvents([event], {
      cfg: {
        channels: { line: { groupPolicy: "allowlist", groupAllowFrom: ["user-3"] } },
      },
      account: {
        accountId: "default",
        enabled: true,
        channelAccessToken: "token",
        channelSecret: "secret",
        tokenSource: "config",
        config: { groupPolicy: "allowlist", groupAllowFrom: ["user-3"] },
      },
      runtime: { error: vi.fn() },
      mediaMaxBytes: 1,
      processMessage,
    });

    expect(buildLineMessageContextMock).toHaveBeenCalledTimes(1);
    expect(processMessage).toHaveBeenCalledTimes(1);
  });

  it("blocks group messages when wildcard group config disables groups", async () => {
    const processMessage = vi.fn();
    const event = {
      type: "message",
      message: { id: "m4", type: "text", text: "hi" },
      replyToken: "reply-token",
      timestamp: Date.now(),
      source: { type: "group", groupId: "group-2", userId: "user-4" },
      mode: "active",
      webhookEventId: "evt-4",
      deliveryContext: { isRedelivery: false },
    } as MessageEvent;

    await handleLineWebhookEvents([event], {
      cfg: { channels: { line: { groupPolicy: "open" } } },
      account: {
        accountId: "default",
        enabled: true,
        channelAccessToken: "token",
        channelSecret: "secret",
        tokenSource: "config",
        config: { groupPolicy: "open", groups: { "*": { enabled: false } } },
      },
      runtime: { error: vi.fn() },
      mediaMaxBytes: 1,
      processMessage,
    });

    expect(processMessage).not.toHaveBeenCalled();
    expect(buildLineMessageContextMock).not.toHaveBeenCalled();
  });

  it("allows group messages when per-group policy is open despite channel allowlist", async () => {
    const processMessage = vi.fn();
    const event = {
      type: "message",
      message: { id: "m5", type: "text", text: "hi" },
      replyToken: "reply-token",
      timestamp: Date.now(),
      source: { type: "group", groupId: "group-open", userId: "user-5" },
      mode: "active",
      webhookEventId: "evt-5",
      deliveryContext: { isRedelivery: false },
    } as MessageEvent;

    await handleLineWebhookEvents([event], {
      cfg: { channels: { line: { groupPolicy: "allowlist" } } },
      account: {
        accountId: "default",
        enabled: true,
        channelAccessToken: "token",
        channelSecret: "secret",
        tokenSource: "config",
        config: {
          groupPolicy: "allowlist",
          groups: { "group-open": { policy: "open" } },
        },
      },
      runtime: { error: vi.fn() },
      mediaMaxBytes: 1,
      processMessage,
    });

    expect(buildLineMessageContextMock).toHaveBeenCalledTimes(1);
    expect(processMessage).toHaveBeenCalledTimes(1);
  });

  it("blocks group messages when per-group policy is disabled despite channel open", async () => {
    const processMessage = vi.fn();
    const event = {
      type: "message",
      message: { id: "m6", type: "text", text: "hi" },
      replyToken: "reply-token",
      timestamp: Date.now(),
      source: { type: "group", groupId: "group-disabled", userId: "user-6" },
      mode: "active",
      webhookEventId: "evt-6",
      deliveryContext: { isRedelivery: false },
    } as MessageEvent;

    await handleLineWebhookEvents([event], {
      cfg: { channels: { line: { groupPolicy: "open" } } },
      account: {
        accountId: "default",
        enabled: true,
        channelAccessToken: "token",
        channelSecret: "secret",
        tokenSource: "config",
        config: {
          groupPolicy: "open",
          groups: { "group-disabled": { policy: "disabled" } },
        },
      },
      runtime: { error: vi.fn() },
      mediaMaxBytes: 1,
      processMessage,
    });

    expect(processMessage).not.toHaveBeenCalled();
    expect(buildLineMessageContextMock).not.toHaveBeenCalled();
  });

  it("uses per-group allowlist with group-specific allowFrom", async () => {
    const processMessage = vi.fn();
    const allowedEvent = {
      type: "message",
      message: { id: "m7", type: "text", text: "hi" },
      replyToken: "reply-token",
      timestamp: Date.now(),
      source: { type: "group", groupId: "group-restricted", userId: "allowed-user" },
      mode: "active",
      webhookEventId: "evt-7",
      deliveryContext: { isRedelivery: false },
    } as MessageEvent;

    const blockedEvent = {
      type: "message",
      message: { id: "m8", type: "text", text: "hi" },
      replyToken: "reply-token",
      timestamp: Date.now(),
      source: { type: "group", groupId: "group-restricted", userId: "blocked-user" },
      mode: "active",
      webhookEventId: "evt-8",
      deliveryContext: { isRedelivery: false },
    } as MessageEvent;

    const context = {
      cfg: { channels: { line: { groupPolicy: "open" } } },
      account: {
        accountId: "default",
        enabled: true,
        channelAccessToken: "token",
        channelSecret: "secret",
        tokenSource: "config",
        config: {
          groupPolicy: "open",
          groups: {
            "group-restricted": {
              policy: "allowlist",
              allowFrom: ["allowed-user"],
            },
          },
        },
      },
      runtime: { error: vi.fn() },
      mediaMaxBytes: 1,
      processMessage,
    };

    await handleLineWebhookEvents([allowedEvent], context);
    expect(processMessage).toHaveBeenCalledTimes(1);

    processMessage.mockClear();
    buildLineMessageContextMock.mockClear();

    await handleLineWebhookEvents([blockedEvent], context);
    expect(processMessage).not.toHaveBeenCalled();
  });

  it("falls back to channel-wide policy when no per-group policy is set", async () => {
    const processMessage = vi.fn();
    const event = {
      type: "message",
      message: { id: "m9", type: "text", text: "hi" },
      replyToken: "reply-token",
      timestamp: Date.now(),
      source: { type: "group", groupId: "group-no-override", userId: "user-9" },
      mode: "active",
      webhookEventId: "evt-9",
      deliveryContext: { isRedelivery: false },
    } as MessageEvent;

    await handleLineWebhookEvents([event], {
      cfg: { channels: { line: { groupPolicy: "open" } } },
      account: {
        accountId: "default",
        enabled: true,
        channelAccessToken: "token",
        channelSecret: "secret",
        tokenSource: "config",
        config: {
          groupPolicy: "open",
          groups: {
            "group-other": { policy: "disabled" },
          },
        },
      },
      runtime: { error: vi.fn() },
      mediaMaxBytes: 1,
      processMessage,
    });

    // group-no-override has no per-group policy, so channel-wide "open" applies
    expect(buildLineMessageContextMock).toHaveBeenCalledTimes(1);
    expect(processMessage).toHaveBeenCalledTimes(1);
  });
});
