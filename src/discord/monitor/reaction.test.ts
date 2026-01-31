import { describe, expect, it } from "vitest";

import { classifyReactionEmoji, shouldTriggerOnReaction } from "./listeners.js";

describe("classifyReactionEmoji", () => {
  it("classifies default emojis correctly", () => {
    expect(classifyReactionEmoji("👍")).toBe("positive");
    expect(classifyReactionEmoji("👎")).toBe("negative");
    expect(classifyReactionEmoji("👀")).toBe("neutral");
  });

  it("respects custom config", () => {
    const config = {
      positiveEmojis: ["🔥"],
      negativeEmojis: ["💩"],
    };
    expect(classifyReactionEmoji("🔥", config)).toBe("positive");
    expect(classifyReactionEmoji("👍", config)).toBe("neutral"); // Default no longer applies if overridden?
    // Wait, implementation uses ?? default, so if I pass config with empty array?
    // The implementation: const positiveEmojis = config?.positiveEmojis ?? DEFAULT_POSITIVE_EMOJIS;
    // So if config has positiveEmojis, it OVERRIDES. Yes.
    expect(classifyReactionEmoji("💩", config)).toBe("negative");
  });
});

describe("shouldTriggerOnReaction", () => {
  const baseParams = {
    botUserId: "bot-1",
    messageAuthorId: "bot-1",
    messageTimestamp: Date.now(),
    emojiSentiment: "positive" as const,
    config: { enabled: true, windowSeconds: 60 },
  };

  it("triggers when conditions are met", () => {
    expect(shouldTriggerOnReaction(baseParams)).toBe(true);
  });

  it("returns false if disabled", () => {
    expect(shouldTriggerOnReaction({ ...baseParams, config: { enabled: false } })).toBe(false);
  });

  it("returns false if message is not from bot", () => {
    expect(shouldTriggerOnReaction({ ...baseParams, messageAuthorId: "user-1" })).toBe(false);
  });

  it("returns false if neutral sentiment", () => {
    expect(shouldTriggerOnReaction({ ...baseParams, emojiSentiment: "neutral" })).toBe(false);
  });

  it("returns false if window elapsed", () => {
    const oldTimestamp = Date.now() - 61 * 1000;
    expect(
      shouldTriggerOnReaction({
        ...baseParams,
        messageTimestamp: oldTimestamp,
        config: { enabled: true, windowSeconds: 60 },
      }),
    ).toBe(false);
  });
});
