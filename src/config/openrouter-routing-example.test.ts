import { expect, it } from "vitest";

it("example: openRouterRouting configuration", () => {
  const config = {
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

  expect(
    config.agents.defaults.models?.["openrouter/anthropic/claude-sonnet-4-5"]?.compat
      ?.openRouterRouting,
  ).toEqual({
    only: ["anthropic"],
  });

  expect(
    config.agents.defaults.models?.["openrouter/openai/gpt-5.2"]?.compat?.openRouterRouting,
  ).toEqual({
    order: ["anthropic", "openai"],
  });
});
