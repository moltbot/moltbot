import { describe, expect, it } from "vitest";
import { deduplicateAndJoin } from "./order-openclaw.js";

describe("deduplicateAndJoin", () => {
  describe("basic cases", () => {
    it("should return empty string for empty array", () => {
      expect(deduplicateAndJoin([])).toBe("");
    });

    it("should return single part unchanged", () => {
      expect(deduplicateAndJoin(["Hello world"])).toBe("Hello world");
    });

    it("should join distinct parts with double newlines", () => {
      const result = deduplicateAndJoin(["Part 1", "Part 2", "Part 3"]);
      expect(result).toBe("Part 1\n\nPart 2\n\nPart 3");
    });
  });

  describe("deduplication when final subsumes earlier", () => {
    it("should return final when it contains all earlier content", () => {
      const parts = ["Hello", "Hello world", "Hello world, how are you?"];
      expect(deduplicateAndJoin(parts)).toBe("Hello world, how are you?");
    });

    it("should dedupe with whitespace normalization", () => {
      // Same content but different whitespace
      const parts = ["Hello   world", "  Hello world  "];
      expect(deduplicateAndJoin(parts)).toBe("  Hello world  ");
    });

    it("should handle exact duplicates", () => {
      const parts = ["Same content", "Same content"];
      expect(deduplicateAndJoin(parts)).toBe("Same content");
    });
  });

  describe("partial overlap scenarios", () => {
    it("should keep parts not subsumed by later parts", () => {
      const parts = ["Unique intro", "Some other content", "Final response"];
      expect(deduplicateAndJoin(parts)).toBe(
        "Unique intro\n\nSome other content\n\nFinal response",
      );
    });

    it("should remove intermediate parts subsumed by final", () => {
      const parts = ["Some", "Some content", "Final: Some content plus more"];
      expect(deduplicateAndJoin(parts)).toBe("Final: Some content plus more");
    });
  });

  describe("edge cases", () => {
    it("should handle empty strings in parts", () => {
      const parts = ["", "Content", ""];
      expect(deduplicateAndJoin(parts)).toBe("Content");
    });

    it("should handle whitespace-only parts", () => {
      const parts = ["   ", "Content", "  \n  "];
      expect(deduplicateAndJoin(parts)).toBe("Content");
    });

    it("should handle newlines in content", () => {
      const parts = ["Line 1\nLine 2", "Line 1\nLine 2\nLine 3"];
      expect(deduplicateAndJoin(parts)).toBe("Line 1\nLine 2\nLine 3");
    });

    it("should preserve original formatting when not subsumed", () => {
      const parts = ["Part A with   extra   spaces", "Part B"];
      expect(deduplicateAndJoin(parts)).toBe("Part A with   extra   spaces\n\nPart B");
    });
  });

  describe("realistic response scenarios", () => {
    it("should handle streaming block + final response pattern", () => {
      // Simulates: block reply "Thinking..." followed by final "Here is my answer"
      const parts = ["Thinking...", "Here is my answer to your question."];
      expect(deduplicateAndJoin(parts)).toBe("Thinking...\n\nHere is my answer to your question.");
    });

    it("should handle incremental streaming pattern", () => {
      // Simulates: partial chunks building up the same response
      const parts = ["The answer", "The answer is", "The answer is 42."];
      expect(deduplicateAndJoin(parts)).toBe("The answer is 42.");
    });

    it("should handle tool result followed by final response", () => {
      const parts = [
        "Tool output: File saved.",
        "I have saved the file for you. The operation completed successfully.",
      ];
      expect(deduplicateAndJoin(parts)).toBe(
        "Tool output: File saved.\n\nI have saved the file for you. The operation completed successfully.",
      );
    });

    it("should handle duplicate block replies", () => {
      // Sometimes block replies can be duplicated
      const parts = ["Response chunk", "Response chunk", "Final response"];
      expect(deduplicateAndJoin(parts)).toBe("Response chunk\n\nFinal response");
    });
  });
});

describe("orderOpenClawTool.definition", () => {
  it("should have correct tool definition", async () => {
    const { orderOpenClawTool } = await import("./order-openclaw.js");
    const def = orderOpenClawTool.definition;

    expect(def.name).toBe("order_openclaw");
    expect(def.description).toContain("Send a message to OpenClaw");
    expect(def.inputSchema.type).toBe("object");
    expect(def.inputSchema.properties.message.type).toBe("string");
    expect(def.inputSchema.properties.sessionKey.type).toBe("string");
    expect(def.inputSchema.required).toEqual(["message"]);
  });
});
