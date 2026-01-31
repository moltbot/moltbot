import { describe, expect, it, vi, beforeEach } from "vitest";

import { applyGroupGating } from "./group-gating.js";

// Mock the group-activation module to control activation mode
vi.mock("./group-activation.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("./group-activation.js")>();
  return {
    ...original,
    resolveGroupActivationFor: vi.fn(() => "mention"),
  };
});

import { resolveGroupActivationFor } from "./group-activation.js";

type Config = ReturnType<typeof import("../../../config/config.js").loadConfig>;

const createConfig = (): Config =>
  ({
    channels: {
      whatsapp: {
        groupPolicy: "open",
        groups: { "*": { requireMention: true } },
      },
    },
    session: { store: "/tmp/openclaw-sessions.json" },
  }) as unknown as Config;

const createMsg = (overrides: Record<string, unknown> = {}) => ({
  id: "m1",
  from: "123@g.us",
  conversationId: "123@g.us",
  to: "+15550000",
  accountId: "default",
  body: "hello",
  timestamp: Date.now(),
  chatType: "group" as const,
  chatId: "123@g.us",
  selfJid: "15551234567@s.whatsapp.net",
  selfE164: "+15551234567",
  senderE164: "+15559999999",
  senderName: "User",
  sendComposing: async () => {},
  reply: async () => {},
  sendMedia: async () => {},
  ...overrides,
});

const createParams = (
  cfg: Config,
  msg: ReturnType<typeof createMsg>,
  overrides: Record<string, unknown> = {},
) => ({
  cfg,
  msg,
  conversationId: "123@g.us",
  groupHistoryKey: "whatsapp:default:group:123@g.us",
  agentId: "main",
  sessionKey: "agent:main:whatsapp:group:123@g.us",
  baseMentionConfig: { mentionRegexes: [] as RegExp[] },
  groupHistories: new Map(),
  groupHistoryLimit: 10,
  groupMemberNames: new Map(),
  logVerbose: () => {},
  replyLogger: { debug: () => {} },
  ...overrides,
});

const setActivationMode = (
  mode: "mention" | "always" | "replies" | "mention+replies" | "never",
) => {
  (resolveGroupActivationFor as ReturnType<typeof vi.fn>).mockReturnValue(mode);
};

describe("applyGroupGating", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivationMode("mention"); // default
  });

  describe("activation mode: mention (default)", () => {
    it("skips regular messages without mention", () => {
      const cfg = createConfig();
      const msg = createMsg();
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(false);
    });

    it("treats reply-to-bot as implicit mention", () => {
      const cfg = createConfig();
      const msg = createMsg({
        replyToId: "m0",
        replyToBody: "bot said hi",
        replyToSender: "+15551234567",
        replyToSenderJid: "15551234567@s.whatsapp.net",
        replyToSenderE164: "+15551234567",
      });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(true);
    });

    it("skips reply to non-bot message", () => {
      const cfg = createConfig();
      const msg = createMsg({
        replyToId: "m0",
        replyToBody: "someone else said",
        replyToSender: "+15558888888",
        replyToSenderJid: "15558888888@s.whatsapp.net",
        replyToSenderE164: "+15558888888",
      });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(false);
    });
  });

  describe("activation mode: always", () => {
    beforeEach(() => {
      setActivationMode("always");
    });

    it("processes all messages regardless of mention", () => {
      const cfg = createConfig();
      const msg = createMsg();
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(true);
    });

    it("processes messages without reply context", () => {
      const cfg = createConfig();
      const msg = createMsg({ body: "random chat" });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(true);
    });
  });

  describe("activation mode: replies", () => {
    beforeEach(() => {
      setActivationMode("replies");
    });

    it("skips messages that are not replies to bot", () => {
      const cfg = createConfig();
      const msg = createMsg();
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(false);
    });

    it("processes replies to bot messages", () => {
      const cfg = createConfig();
      const msg = createMsg({
        replyToId: "m0",
        replyToSenderJid: "15551234567@s.whatsapp.net",
        replyToSenderE164: "+15551234567",
      });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(true);
    });

    it("skips replies to other users", () => {
      const cfg = createConfig();
      const msg = createMsg({
        replyToId: "m0",
        replyToSenderJid: "15558888888@s.whatsapp.net",
        replyToSenderE164: "+15558888888",
      });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(false);
    });

    it("skips messages without reply (even with @mention)", () => {
      const cfg = createConfig();
      const msg = createMsg({ body: "@bot hello" });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(false);
    });
  });

  describe("activation mode: mention+replies", () => {
    beforeEach(() => {
      setActivationMode("mention+replies");
    });

    it("skips messages without mention or reply", () => {
      const cfg = createConfig();
      const msg = createMsg();
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(false);
    });

    it("processes replies to bot", () => {
      const cfg = createConfig();
      const msg = createMsg({
        replyToId: "m0",
        replyToSenderJid: "15551234567@s.whatsapp.net",
        replyToSenderE164: "+15551234567",
      });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(true);
    });

    it("skips replies to non-bot users", () => {
      const cfg = createConfig();
      const msg = createMsg({
        replyToId: "m0",
        replyToSenderJid: "99999999@s.whatsapp.net",
      });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(false);
    });
  });

  describe("activation mode: never", () => {
    beforeEach(() => {
      setActivationMode("never");
    });

    it("skips all regular messages", () => {
      const cfg = createConfig();
      const msg = createMsg();
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(false);
    });

    it("skips replies to bot", () => {
      const cfg = createConfig();
      const msg = createMsg({
        replyToId: "m0",
        replyToSenderJid: "15551234567@s.whatsapp.net",
        replyToSenderE164: "+15551234567",
      });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(false);
    });

    it("skips messages that look like mentions", () => {
      const cfg = createConfig();
      const msg = createMsg({ body: "@bot hello" });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(false);
    });
  });

  describe("JID normalization", () => {
    it("matches JIDs with device suffix stripped", () => {
      const cfg = createConfig();
      const msg = createMsg({
        selfJid: "15551234567:42@s.whatsapp.net",
        replyToId: "m0",
        replyToSenderJid: "15551234567:99@s.whatsapp.net",
      });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(true);
    });

    it("falls back to E164 matching when JIDs differ", () => {
      const cfg = createConfig();
      const msg = createMsg({
        selfJid: "different@s.whatsapp.net",
        replyToId: "m0",
        replyToSenderJid: "also-different@s.whatsapp.net",
        selfE164: "+15551234567",
        replyToSenderE164: "+15551234567",
      });
      const result = applyGroupGating(createParams(cfg, msg));
      expect(result.shouldProcess).toBe(true);
    });
  });

  describe("history recording", () => {
    it("records skipped messages to group history", () => {
      const cfg = createConfig();
      const msg = createMsg({ body: "missed message" });
      const groupHistories = new Map<string, Array<{ body: string }>>();
      const params = createParams(cfg, msg, { groupHistories });

      applyGroupGating(params);

      const history = groupHistories.get("whatsapp:default:group:123@g.us");
      expect(history).toBeDefined();
      expect(history?.[0]?.body).toBe("missed message");
    });
  });
});
