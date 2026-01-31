import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDeepSeekProvider,
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_CHAT_MODEL_ID,
  DEEPSEEK_REASONER_MODEL_ID,
  resolveImplicitProviders,
} from "./models-config.providers.js";

describe("DeepSeek provider", () => {
  describe("buildDeepSeekProvider", () => {
    it("returns correct provider configuration", () => {
      const provider = buildDeepSeekProvider();

      expect(provider.baseUrl).toBe(DEEPSEEK_API_BASE_URL);
      expect(provider.api).toBe("openai-completions");
      expect(provider.models).toHaveLength(2);
    });

    it("includes deepseek-chat model with correct config", () => {
      const provider = buildDeepSeekProvider();
      const chatModel = provider.models.find((m) => m.id === DEEPSEEK_CHAT_MODEL_ID);

      expect(chatModel).toBeDefined();
      expect(chatModel?.name).toBe("DeepSeek Chat");
      expect(chatModel?.reasoning).toBe(false);
      expect(chatModel?.input).toEqual(["text"]);
      expect(chatModel?.contextWindow).toBe(64000);
      expect(chatModel?.maxTokens).toBe(8192);
    });

    it("includes deepseek-reasoner model with reasoning enabled", () => {
      const provider = buildDeepSeekProvider();
      const reasonerModel = provider.models.find((m) => m.id === DEEPSEEK_REASONER_MODEL_ID);

      expect(reasonerModel).toBeDefined();
      expect(reasonerModel?.name).toBe("DeepSeek Reasoner");
      expect(reasonerModel?.reasoning).toBe(true);
      expect(reasonerModel?.input).toEqual(["text"]);
    });
  });

  describe("resolveImplicitProviders", () => {
    let previousKey: string | undefined;

    beforeEach(() => {
      previousKey = process.env.DEEPSEEK_API_KEY;
    });

    afterEach(() => {
      if (previousKey === undefined) {
        delete process.env.DEEPSEEK_API_KEY;
      } else {
        process.env.DEEPSEEK_API_KEY = previousKey;
      }
      vi.resetModules();
    });

    it("does not include deepseek when no API key is configured", async () => {
      delete process.env.DEEPSEEK_API_KEY;
      const agentDir = mkdtempSync(join(tmpdir(), "clawd-test-deepseek-"));
      const providers = await resolveImplicitProviders({ agentDir });

      expect(providers?.deepseek).toBeUndefined();
    });

    it("includes deepseek when DEEPSEEK_API_KEY env var is set", async () => {
      process.env.DEEPSEEK_API_KEY = "sk-test-deepseek-key";
      const agentDir = mkdtempSync(join(tmpdir(), "clawd-test-deepseek-"));

      vi.resetModules();
      const { resolveImplicitProviders: freshResolve } =
        await import("./models-config.providers.js");
      const providers = await freshResolve({ agentDir });

      expect(providers?.deepseek).toBeDefined();
      expect(providers?.deepseek?.baseUrl).toBe(DEEPSEEK_API_BASE_URL);
      expect(providers?.deepseek?.apiKey).toBe("DEEPSEEK_API_KEY");
      expect(providers?.deepseek?.models).toHaveLength(2);
    });
  });
});
