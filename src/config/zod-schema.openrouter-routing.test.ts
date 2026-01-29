import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { withTempHome } from "./test-helpers.js";

describe("OpenRouter routing integration", () => {
  it("validates and loads openRouterRouting config from moltbot.json", async () => {
    await withTempHome(async (home) => {
      const configDir = path.join(home, ".clawdbot");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "moltbot.json"),
        JSON.stringify(
          {
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
          },
          null,
          2,
        ),
        "utf-8",
      );

      const { loadConfig } = await import("./config.js");
      const cfg = loadConfig();

      expect(cfg.agents?.defaults?.model?.primary).toBe("openrouter/anthropic/claude-sonnet-4-5");

      const sonnetModel = cfg.agents?.defaults?.models?.["openrouter/anthropic/claude-sonnet-4-5"];
      expect(sonnetModel?.alias).toBe("Claude Sonnet");
      expect(sonnetModel?.compat?.openRouterRouting).toEqual({
        only: ["anthropic"],
      });

      const gptModel = cfg.agents?.defaults?.models?.["openrouter/openai/gpt-5.2"];
      expect(gptModel?.alias).toBe("GPT-5.2");
      expect(gptModel?.compat?.openRouterRouting).toEqual({
        order: ["anthropic", "openai"],
      });
    });
  });

  it("accepts openRouterRouting with empty config", async () => {
    await withTempHome(async (home) => {
      const configDir = path.join(home, ".clawdbot");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "moltbot.json"),
        JSON.stringify(
          {
            agents: {
              defaults: {
                model: { primary: "openrouter/anthropic/claude-sonnet-4-5" },
                models: {
                  "openrouter/anthropic/claude-sonnet-4-5": {
                    compat: {
                      openRouterRouting: {},
                    },
                  },
                },
              },
            },
          },
          null,
          2,
        ),
        "utf-8",
      );

      const { loadConfig } = await import("./config.js");
      const cfg = loadConfig();

      const model = cfg.agents?.defaults?.models?.["openrouter/anthropic/claude-sonnet-4-5"];
      expect(model?.compat?.openRouterRouting).toEqual({});
    });
  });
});
