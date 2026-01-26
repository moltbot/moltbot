import { describe, expect, it } from "vitest";

import {
  looksLikeFeishuTargetId,
  normalizeFeishuMessagingTarget,
  parseFeishuMessagingTarget,
} from "./targets.js";

describe("feishu/targets", () => {
  it("normalizes user and chat targets", () => {
    expect(normalizeFeishuMessagingTarget("user:ou_123")).toBe("user:ou_123");
    expect(normalizeFeishuMessagingTarget("chat:oc_123")).toBe("chat:oc_123");
    expect(normalizeFeishuMessagingTarget("feishu:user:ou_123")).toBe("user:ou_123");
    expect(normalizeFeishuMessagingTarget("fs:chat:oc_123")).toBe("chat:oc_123");
    expect(normalizeFeishuMessagingTarget("ou_abc")).toBe("user:ou_abc");
    expect(normalizeFeishuMessagingTarget("oc_abc")).toBe("chat:oc_abc");
  });

  it("parses targets into typed objects", () => {
    expect(parseFeishuMessagingTarget("user:ou_123")).toEqual({ kind: "user", openId: "ou_123" });
    expect(parseFeishuMessagingTarget("chat:oc_123")).toEqual({ kind: "chat", chatId: "oc_123" });
    expect(parseFeishuMessagingTarget("ou_123")).toEqual({ kind: "user", openId: "ou_123" });
    expect(parseFeishuMessagingTarget("oc_123")).toEqual({ kind: "chat", chatId: "oc_123" });
  });

  it("detects target ids", () => {
    expect(looksLikeFeishuTargetId("user:ou_123")).toBe(true);
    expect(looksLikeFeishuTargetId("chat:oc_123")).toBe(true);
    expect(looksLikeFeishuTargetId("ou_123")).toBe(true);
    expect(looksLikeFeishuTargetId("oc_123")).toBe(true);
    expect(looksLikeFeishuTargetId("")).toBe(false);
    expect(looksLikeFeishuTargetId("foo")).toBe(false);
  });
});
