import { describe, expect, it } from "vitest";
import type { MoltbotConfig } from "../config/config.js";

describe("OpenRouter routing", () => {
  it("config accepts openRouterRouting with 'only' field", () => {
    const cfg: MoltbotConfig = {
      env: {
        OPENROUTER_API_KEY: "sk-or-test-key",
      },
      agents: {
        defaults: {
          model: { primary: "openrouter/anthropic/claude-sonnet-4-5" },
          models: {
            "openrouter/anthropic/claude-sonnet-4-5": {
              alias: "Claude Sonnet",
              compat: {
                openRouterRouting: {
                  only: ["anthropic"],
                },
              },
            },
          },
        },
      },
    };

    const modelKey = "openrouter/anthropic/claude-sonnet-4-5";
    const modelConfig = cfg.agents?.defaults?.models?.[modelKey];

    expect(modelConfig?.compat?.openRouterRouting).toEqual({
      only: ["anthropic"],
    });
  });

  it("config accepts openRouterRouting with 'order' field", () => {
    const cfg: MoltbotConfig = {
      env: {
        OPENROUTER_API_KEY: "sk-or-test-key",
      },
      agents: {
        defaults: {
          model: { primary: "openrouter/openai/gpt-5.2" },
          models: {
            "openrouter/openai/gpt-5.2": {
              alias: "GPT-5.2",
              compat: {
                openRouterRouting: {
                  order: ["anthropic", "openai"],
                },
              },
            },
          },
        },
      },
    };

    const modelKey = "openrouter/openai/gpt-5.2";
    const modelConfig = cfg.agents?.defaults?.models?.[modelKey];

    expect(modelConfig?.compat?.openRouterRouting).toEqual({
      order: ["anthropic", "openai"],
    });
  });

  it("validates openRouterRouting config shape", () => {
    const testCases = [
      {
        name: "only with single provider",
        config: { only: ["anthropic"] },
      },
      {
        name: "only with multiple providers",
        config: { only: ["anthropic", "openai"] },
      },
      {
        name: "order with single provider",
        config: { order: ["anthropic"] },
      },
      {
        name: "order with multiple providers",
        config: { order: ["anthropic", "openai"] },
      },
      {
        name: "empty routing",
        config: {},
      },
      {
        name: "both only and order",
        config: { only: ["anthropic"], order: ["openai"] },
      },
    ];

    for (const testCase of testCases) {
      const cfg: MoltbotConfig = {
        env: { OPENROUTER_API_KEY: "sk-or-test-key" },
        agents: {
          defaults: {
            model: { primary: "openrouter/anthropic/claude-sonnet-4-5" },
            models: {
              "openrouter/anthropic/claude-sonnet-4-5": {
                compat: {
                  openRouterRouting: testCase.config,
                },
              },
            },
          },
        },
      };

      expect(() => {
        const modelConfig =
          cfg.agents?.defaults?.models?.["openrouter/anthropic/claude-sonnet-4-5"];
        expect(modelConfig?.compat?.openRouterRouting).toEqual(testCase.config);
      }).not.toThrow();
    }
  });
});
