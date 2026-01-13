import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getActiveWebListener,
  requireActiveWebListener,
  setActiveWebListener,
} from "./active-listener.js";

describe("active-listener", () => {
  const mockListener = {
    sendComposingTo: vi.fn(async () => {}),
    sendMessage: vi.fn(async () => ({ messageId: "msg123" })),
    sendPoll: vi.fn(async () => ({ messageId: "poll123" })),
    sendReaction: vi.fn(async () => {}),
  };

  afterEach(() => {
    setActiveWebListener(null);
    setActiveWebListener("kev", null);
    setActiveWebListener("other", null);
  });

  describe("getActiveWebListener", () => {
    it("returns null when no listeners registered", () => {
      expect(getActiveWebListener()).toBeNull();
      expect(getActiveWebListener("kev")).toBeNull();
    });

    it("returns listener for matching accountId", () => {
      setActiveWebListener("kev", mockListener);
      expect(getActiveWebListener("kev")).toBe(mockListener);
    });

    it("returns listener when account is named default", () => {
      setActiveWebListener("default", mockListener);
      expect(getActiveWebListener()).toBe(mockListener);
      expect(getActiveWebListener("default")).toBe(mockListener);
    });

    it("falls back to single listener when accountId not found", () => {
      setActiveWebListener("kev", mockListener);
      expect(getActiveWebListener()).toBe(mockListener);
      expect(getActiveWebListener("default")).toBe(mockListener);
      expect(getActiveWebListener("nonexistent")).toBe(mockListener);
    });

    it("does not fall back when multiple listeners exist", () => {
      const otherListener = { ...mockListener };
      setActiveWebListener("kev", mockListener);
      setActiveWebListener("other", otherListener);
      expect(getActiveWebListener("nonexistent")).toBeNull();
    });
  });

  describe("requireActiveWebListener", () => {
    it("throws when no listeners registered", () => {
      expect(() => requireActiveWebListener()).toThrow(
        /No active WhatsApp Web listener/,
      );
    });

    it("returns listener and accountId for matching accountId", () => {
      setActiveWebListener("kev", mockListener);
      const result = requireActiveWebListener("kev");
      expect(result.accountId).toBe("kev");
      expect(result.listener).toBe(mockListener);
    });

    it("returns listener when account is named default", () => {
      setActiveWebListener("default", mockListener);
      const result = requireActiveWebListener();
      expect(result.accountId).toBe("default");
      expect(result.listener).toBe(mockListener);
    });

    it("throws for non-matching accountId when multiple listeners", () => {
      const otherListener = { ...mockListener };
      setActiveWebListener("kev", mockListener);
      setActiveWebListener("other", otherListener);
      expect(() => requireActiveWebListener("nonexistent")).toThrow(
        /No active WhatsApp Web listener/,
      );
    });

    it("falls back to single listener and returns correct accountId", () => {
      setActiveWebListener("kev", mockListener);
      const result = requireActiveWebListener();
      expect(result.accountId).toBe("kev");
      expect(result.listener).toBe(mockListener);
    });

    it("falls back when requesting default but only custom account exists", () => {
      setActiveWebListener("kev", mockListener);
      const result = requireActiveWebListener("default");
      expect(result.accountId).toBe("kev");
      expect(result.listener).toBe(mockListener);
    });
  });

  describe("setActiveWebListener", () => {
    it("registers listener with accountId", () => {
      setActiveWebListener("kev", mockListener);
      expect(getActiveWebListener("kev")).toBe(mockListener);
    });

    it("registers listener without accountId as default", () => {
      setActiveWebListener(mockListener);
      expect(getActiveWebListener("default")).toBe(mockListener);
    });

    it("removes listener when set to null", () => {
      setActiveWebListener("kev", mockListener);
      expect(getActiveWebListener("kev")).toBe(mockListener);
      setActiveWebListener("kev", null);
      expect(getActiveWebListener("kev")).toBeNull();
    });
  });
});
