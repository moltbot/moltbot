import { describe, expect, it } from "vitest";

import { resolveTranscriptPolicy } from "./transcript-policy.js";

describe("resolveTranscriptPolicy", () => {
  describe("tool call ID sanitization", () => {
    it("enables tool call ID sanitization for OpenAI providers", () => {
      const policy = resolveTranscriptPolicy({
        provider: "openai",
        model: "gpt-4",
      });

      expect(policy.sanitizeToolCallIds).toBe(true);
      expect(policy.toolCallIdMode).toBe("strict");
    });

    it("enables tool call ID sanitization for OpenAI with custom models", () => {
      const policy = resolveTranscriptPolicy({
        provider: "openai",
        model: "gpt-4o-2024-11-20",
      });

      expect(policy.sanitizeToolCallIds).toBe(true);
      expect(policy.toolCallIdMode).toBe("strict");
    });

    it("enables strict9 mode for Mistral providers", () => {
      const policy = resolveTranscriptPolicy({
        provider: "mistral",
        model: "mistral-large-latest",
      });

      expect(policy.sanitizeToolCallIds).toBe(true);
      expect(policy.toolCallIdMode).toBe("strict9");
    });

    it("enables tool call ID sanitization for Google providers", () => {
      const policy = resolveTranscriptPolicy({
        provider: "google",
        model: "gemini-2.0-flash-exp",
      });

      expect(policy.sanitizeToolCallIds).toBe(true);
      expect(policy.toolCallIdMode).toBe("strict");
    });

    it("disables tool call ID sanitization for Anthropic providers", () => {
      const policy = resolveTranscriptPolicy({
        provider: "anthropic",
        model: "claude-3-5-sonnet-20241022",
      });

      expect(policy.sanitizeToolCallIds).toBe(false);
      expect(policy.toolCallIdMode).toBeUndefined();
    });

    it("fixes issue #4718: OpenAI enforces 40-char limit on tool call IDs", () => {
      // Before fix: OpenAI was excluded from sanitization
      // After fix: OpenAI should sanitize IDs (strict mode = 40 char limit)
      const policy = resolveTranscriptPolicy({
        provider: "openai",
        model: "gpt-4-turbo",
      });

      // Verify OpenAI now gets sanitization enabled
      expect(policy.sanitizeToolCallIds).toBe(true);
      expect(policy.toolCallIdMode).toBe("strict");

      // This prevents HTTP 400 errors when tool call IDs exceed 40 chars
    });
  });

  describe("sanitizeMode", () => {
    it("uses images-only for OpenAI", () => {
      const policy = resolveTranscriptPolicy({
        provider: "openai",
        model: "gpt-4",
      });

      expect(policy.sanitizeMode).toBe("images-only");
    });

    it("uses full for Google", () => {
      const policy = resolveTranscriptPolicy({
        provider: "google",
        model: "gemini-pro",
      });

      expect(policy.sanitizeMode).toBe("full");
    });

    it("uses full for Anthropic", () => {
      const policy = resolveTranscriptPolicy({
        provider: "anthropic",
        model: "claude-3-opus-20240229",
      });

      expect(policy.sanitizeMode).toBe("full");
    });
  });
});
