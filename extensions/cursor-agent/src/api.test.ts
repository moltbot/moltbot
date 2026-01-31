/**
 * Tests for Cursor Agent API client.
 */

import { describe, it, expect } from "vitest";
import { verifyWebhookSignature, parseWebhookHeaders } from "./api.js";

describe("verifyWebhookSignature", () => {
  const secret = "test-webhook-secret";
  const payload = '{"event":"statusChange","id":"bc_123"}';

  it("should verify valid signature", () => {
    // Pre-computed signature for the test payload with test secret
    const crypto = require("crypto");
    const expectedSignature =
      "sha256=" + crypto.createHmac("sha256", secret).update(payload).digest("hex");

    expect(verifyWebhookSignature(payload, expectedSignature, secret)).toBe(true);
  });

  it("should reject invalid signature", () => {
    const invalidSignature = "sha256=invalid";
    expect(verifyWebhookSignature(payload, invalidSignature, secret)).toBe(false);
  });

  it("should reject empty signature", () => {
    expect(verifyWebhookSignature(payload, "", secret)).toBe(false);
  });

  it("should reject empty secret", () => {
    expect(verifyWebhookSignature(payload, "sha256=abc", "")).toBe(false);
  });
});

describe("parseWebhookHeaders", () => {
  it("should parse all webhook headers", () => {
    const headers = {
      "x-webhook-signature": "sha256=abc123",
      "x-webhook-id": "wh_12345",
      "x-webhook-event": "statusChange",
      "user-agent": "Cursor-Agent-Webhook/1.0",
    };

    const parsed = parseWebhookHeaders(headers);

    expect(parsed.signature).toBe("sha256=abc123");
    expect(parsed.webhookId).toBe("wh_12345");
    expect(parsed.event).toBe("statusChange");
    expect(parsed.userAgent).toBe("Cursor-Agent-Webhook/1.0");
  });

  it("should handle missing headers", () => {
    const headers = {};
    const parsed = parseWebhookHeaders(headers);

    expect(parsed.signature).toBeNull();
    expect(parsed.webhookId).toBeNull();
    expect(parsed.event).toBeNull();
    expect(parsed.userAgent).toBeNull();
  });
});
