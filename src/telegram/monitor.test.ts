import { beforeEach, describe, expect, it, vi } from "vitest";

import { monitorTelegramProvider } from "./monitor.js";

type MockCtx = {
  message: {
    chat: { id: number; type: string; title?: string };
    text?: string;
    caption?: string;
  };
  me?: { username: string };
  getFile: () => Promise<unknown>;
};

// Fake bot to capture handler and API calls
const handlers: Record<string, (ctx: MockCtx) => Promise<void> | void> = {};
const api = {
  sendMessage: vi.fn(),
  sendPhoto: vi.fn(),
  sendVideo: vi.fn(),
  sendAudio: vi.fn(),
  sendDocument: vi.fn(),
  setWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
};

// Track runner calls
const runnerMock = {
  run: vi.fn(),
  stop: vi.fn(),
  task: vi.fn(),
};

vi.mock("@grammyjs/runner", () => ({
  run: (bot: unknown) => {
    runnerMock.run(bot);
    return {
      stop: runnerMock.stop,
      task: runnerMock.task.mockResolvedValue(undefined),
    };
  },
}));

vi.mock("./bot.js", () => ({
  createTelegramBot: () => {
    handlers.message = async (ctx: MockCtx) => {
      const chatId = ctx.message.chat.id;
      const isGroup = ctx.message.chat.type !== "private";
      const text = ctx.message.text ?? ctx.message.caption ?? "";
      if (isGroup && !text.includes("@mybot")) return;
      if (!text.trim()) return;
      await api.sendMessage(chatId, `echo:${text}`, { parse_mode: "Markdown" });
    };
    return {
      on: vi.fn(),
      api,
      me: { username: "mybot" },
      stop: vi.fn(),
      start: vi.fn(),
    };
  },
  createTelegramWebhookCallback: vi.fn(),
}));

vi.mock("../auto-reply/reply.js", () => ({
  getReplyFromConfig: async (ctx: { Body?: string }) => ({
    text: `echo:${ctx.Body}`,
  }),
}));

describe("monitorTelegramProvider (grammY)", () => {
  it("processes a DM and sends reply", async () => {
    Object.values(api).forEach((fn) => {
      fn?.mockReset?.();
    });
    await monitorTelegramProvider({ token: "tok" });
    expect(handlers.message).toBeDefined();
    await handlers.message?.({
      message: {
        message_id: 1,
        chat: { id: 123, type: "private" },
        text: "hi",
      },
      me: { username: "mybot" },
      getFile: vi.fn(async () => ({})),
    });
    expect(api.sendMessage).toHaveBeenCalledWith(123, "echo:hi", {
      parse_mode: "Markdown",
    });
  });

  it("requires mention in groups by default", async () => {
    Object.values(api).forEach((fn) => {
      fn?.mockReset?.();
    });
    await monitorTelegramProvider({ token: "tok" });
    await handlers.message?.({
      message: {
        message_id: 2,
        chat: { id: -99, type: "supergroup", title: "G" },
        text: "hello all",
      },
      me: { username: "mybot" },
      getFile: vi.fn(async () => ({})),
    });
    expect(api.sendMessage).not.toHaveBeenCalled();
  });
});

describe("monitorTelegramProvider concurrent runner", () => {
  beforeEach(() => {
    runnerMock.run.mockClear();
    runnerMock.stop.mockClear();
    runnerMock.task.mockClear();
  });

  it("uses @grammyjs/runner for concurrent update processing in long polling mode", async () => {
    // Long polling mode (default, no useWebhook flag)
    await monitorTelegramProvider({ token: "tok" });

    // The runner should be called instead of bot.start()
    expect(runnerMock.run).toHaveBeenCalledTimes(1);
    expect(runnerMock.task).toHaveBeenCalledTimes(1);
  });

  it("stops runner when abort signal fires", async () => {
    const controller = new AbortController();

    // Start monitoring with abort signal
    const monitorPromise = monitorTelegramProvider({
      token: "tok",
      abortSignal: controller.signal,
    });

    // Abort immediately
    controller.abort();

    await monitorPromise;

    // Runner should have been stopped
    expect(runnerMock.stop).toHaveBeenCalled();
  });

  it("stops runner immediately if abort signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(); // Pre-abort

    await monitorTelegramProvider({
      token: "tok",
      abortSignal: controller.signal,
    });

    // Runner should have been stopped immediately
    expect(runnerMock.stop).toHaveBeenCalled();
  });
});
