import { describe, expect, it, vi } from "vitest";
import {
  buildTelegramApprovalCallbackData,
  parseTelegramApprovalCallbackData,
} from "./exec-approvals.js";

vi.mock("../gateway/call.js", () => ({
  callGateway: vi.fn(),
}));

vi.mock("./send.js", () => ({
  sendMessageTelegram: vi.fn().mockResolvedValue({ messageId: "123", chatId: "456" }),
  editMessageTelegram: vi.fn().mockResolvedValue({ ok: true }),
}));

describe("Telegram exec approval callback data", () => {
  describe("buildTelegramApprovalCallbackData", () => {
    it("builds callback data for allow-once", () => {
      const result = buildTelegramApprovalCallbackData("test-id-123", "allow-once");
      expect(result).toBe("tg_approve:allow-once:test-id-123");
    });

    it("builds callback data for allow-always", () => {
      const result = buildTelegramApprovalCallbackData("abc-def", "allow-always");
      expect(result).toBe("tg_approve:allow-always:abc-def");
    });

    it("builds callback data for deny", () => {
      const result = buildTelegramApprovalCallbackData("short", "deny");
      expect(result).toBe("tg_approve:deny:short");
    });
  });

  describe("parseTelegramApprovalCallbackData", () => {
    it("parses allow-once callback data", () => {
      const result = parseTelegramApprovalCallbackData("tg_approve:allow-once:test-id");
      expect(result).toEqual({ approvalId: "test-id", action: "allow-once" });
    });

    it("parses allow-always callback data", () => {
      const result = parseTelegramApprovalCallbackData("tg_approve:allow-always:abc");
      expect(result).toEqual({ approvalId: "abc", action: "allow-always" });
    });

    it("parses deny callback data", () => {
      const result = parseTelegramApprovalCallbackData("tg_approve:deny:xyz");
      expect(result).toEqual({ approvalId: "xyz", action: "deny" });
    });

    it("handles approval IDs containing colons", () => {
      const result = parseTelegramApprovalCallbackData("tg_approve:allow-once:id:with:colons");
      expect(result).toEqual({ approvalId: "id:with:colons", action: "allow-once" });
    });

    it("returns null for non-approval callback data", () => {
      expect(parseTelegramApprovalCallbackData("commands_page_1")).toBeNull();
    });

    it("returns null for invalid prefix", () => {
      expect(parseTelegramApprovalCallbackData("other_prefix:allow-once:id")).toBeNull();
    });

    it("returns null for unsupported action", () => {
      expect(parseTelegramApprovalCallbackData("tg_approve:unknown:id")).toBeNull();
    });

    it("returns null for malformed data with too few parts", () => {
      expect(parseTelegramApprovalCallbackData("tg_approve:allow-once")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseTelegramApprovalCallbackData("")).toBeNull();
    });
  });
});
