import { describe, expect, it } from "vitest";

import { buildInlineProviderModels } from "./model.js";

const makeModel = (id: string) => ({
  id,
  name: id,
  reasoning: false,
  input: ["text"] as const,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1,
  maxTokens: 1,
});

describe("buildInlineProviderModels", () => {
  it("attaches provider ids to inline models", () => {
    const providers = {
      " alpha ": { models: [makeModel("alpha-model")] },
      beta: { models: [makeModel("beta-model")] },
    };

    const result = buildInlineProviderModels(providers);

    expect(result).toEqual([
      { ...makeModel("alpha-model"), provider: "alpha" },
      { ...makeModel("beta-model"), provider: "beta" },
    ]);
  });

  it("preserves model api field when set", () => {
    const providers = {
      "amazon-bedrock": {
        api: "bedrock-converse-stream",
        models: [{ ...makeModel("claude-v2"), api: "anthropic-messages" }],
      },
    };

    const result = buildInlineProviderModels(providers);

    expect(result[0].api).toBe("anthropic-messages");
  });
});

describe("resolveModel inline api inheritance", () => {
  it("inherits api from provider config when model api is not set", async () => {
    // This validates the fix: when inlineMatch.api is undefined,
    // it should fall back to providerCfg.api

    const cfg = {
      models: {
        providers: {
          "amazon-bedrock": {
            baseUrl: "https://bedrock.us-east-1.amazonaws.com",
            api: "bedrock-converse-stream" as const,
            models: [
              {
                id: "anthropic.claude-3-sonnet",
                name: "Claude 3 Sonnet",
                reasoning: false,
                input: ["text" as const],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 200000,
                maxTokens: 4096,
                // Note: no api field here - should inherit from provider
              },
            ],
          },
        },
      },
    };

    const inlineModels = buildInlineProviderModels(cfg.models.providers);
    const match = inlineModels.find((m) => m.id === "anthropic.claude-3-sonnet");

    expect(match).toBeDefined();
    expect(match!.api).toBeUndefined(); // Model doesn't have api set

    // The fix ensures that when resolveModel processes this match,
    // it looks up providers[inlineMatch.provider].api and uses that
    const providerCfg = cfg.models.providers["amazon-bedrock"];
    const resolvedApi = match!.api ?? providerCfg?.api ?? "openai-responses";

    expect(resolvedApi).toBe("bedrock-converse-stream");
  });
});
