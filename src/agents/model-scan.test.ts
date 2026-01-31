import { describe, expect, it } from "vitest";

import { scanEdenAiModels, scanOpenRouterModels } from "./model-scan.js";

function createFetchFixture(payload: unknown): typeof fetch {
  return async () =>
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
}

describe("scanOpenRouterModels", () => {
  it("lists free models without probing", async () => {
    const fetchImpl = createFetchFixture({
      data: [
        {
          id: "acme/free-by-pricing",
          name: "Free By Pricing",
          context_length: 16_384,
          max_completion_tokens: 1024,
          supported_parameters: ["tools", "tool_choice", "temperature"],
          modality: "text",
          pricing: { prompt: "0", completion: "0", request: "0", image: "0" },
          created_at: 1_700_000_000,
        },
        {
          id: "acme/free-by-suffix:free",
          name: "Free By Suffix",
          context_length: 8_192,
          supported_parameters: [],
          modality: "text",
          pricing: { prompt: "0", completion: "0" },
        },
        {
          id: "acme/paid",
          name: "Paid",
          context_length: 4_096,
          supported_parameters: ["tools"],
          modality: "text",
          pricing: { prompt: "0.000001", completion: "0.000002" },
        },
      ],
    });

    const results = await scanOpenRouterModels({
      fetchImpl,
      probe: false,
    });

    expect(results.map((entry) => entry.id)).toEqual([
      "acme/free-by-pricing",
      "acme/free-by-suffix:free",
    ]);

    const [byPricing] = results;
    expect(byPricing).toBeTruthy();
    if (!byPricing) {
      throw new Error("Expected pricing-based model result.");
    }
    expect(byPricing.supportsToolsMeta).toBe(true);
    expect(byPricing.supportedParametersCount).toBe(3);
    expect(byPricing.isFree).toBe(true);
    expect(byPricing.tool.skipped).toBe(true);
    expect(byPricing.image.skipped).toBe(true);
  });

  it("requires an API key when probing", async () => {
    const fetchImpl = createFetchFixture({ data: [] });
    const previousKey = process.env.OPENROUTER_API_KEY;
    try {
      delete process.env.OPENROUTER_API_KEY;
      await expect(
        scanOpenRouterModels({
          fetchImpl,
          probe: true,
          apiKey: "",
        }),
      ).rejects.toThrow(/Missing OpenRouter API key/);
    } finally {
      if (previousKey === undefined) {
        delete process.env.OPENROUTER_API_KEY;
      } else {
        process.env.OPENROUTER_API_KEY = previousKey;
      }
    }
  });
});

describe("scanEdenAiModels", () => {
  it("lists models from {object, data} response format", async () => {
    const fetchImpl = createFetchFixture({
      object: "list",
      data: [
        {
          id: "anthropic/claude-3-haiku",
          model_name: "Claude 3 Haiku",
          owned_by: "anthropic",
          context_length: 200000,
          created: 1700000000,
          capabilities: {
            supports_function_calling: true,
            supports_vision: false,
            supports_tool_choice: true,
            input_modalities: ["text"],
            output_modalities: ["text"],
          },
          pricing: { input_cost_per_token: 0.00025, output_cost_per_token: 0.00125 },
        },
      ],
    });

    const results = await scanEdenAiModels({
      fetchImpl,
      apiKey: "test-key",
      probe: false,
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("anthropic/claude-3-haiku");
    expect(results[0]?.modelRef).toBe("edenai/anthropic/claude-3-haiku");
    expect(results[0]?.provider).toBe("edenai");
    expect(results[0]?.name).toBe("Claude 3 Haiku");
    expect(results[0]?.supportsToolsMeta).toBe(true);
  });

  it("requires an API key", async () => {
    const fetchImpl = createFetchFixture({ object: "list", data: [] });
    const previousKey = process.env.EDENAI_API_KEY;
    try {
      delete process.env.EDENAI_API_KEY;
      await expect(scanEdenAiModels({ fetchImpl, probe: false, apiKey: "" })).rejects.toThrow(
        /Missing Eden AI API key/,
      );
    } finally {
      if (previousKey === undefined) {
        delete process.env.EDENAI_API_KEY;
      } else {
        process.env.EDENAI_API_KEY = previousKey;
      }
    }
  });

  it("filters by provider", async () => {
    const fetchImpl = createFetchFixture({
      object: "list",
      data: [
        {
          id: "anthropic/claude-3",
          model_name: "Claude",
          owned_by: "anthropic",
          context_length: 200000,
          created: 1700000000,
          capabilities: {
            supports_function_calling: true,
            supports_vision: false,
            supports_tool_choice: true,
            input_modalities: ["text"],
            output_modalities: ["text"],
          },
          pricing: { input_cost_per_token: 0.001, output_cost_per_token: 0.002 },
        },
        {
          id: "openai/gpt-4",
          model_name: "GPT-4",
          owned_by: "openai",
          context_length: 128000,
          created: 1700000000,
          capabilities: {
            supports_function_calling: true,
            supports_vision: true,
            supports_tool_choice: true,
            input_modalities: ["text", "image"],
            output_modalities: ["text"],
          },
          pricing: { input_cost_per_token: 0.003, output_cost_per_token: 0.006 },
        },
      ],
    });

    const results = await scanEdenAiModels({
      fetchImpl,
      apiKey: "test-key",
      probe: false,
      providerFilter: "anthropic",
    });

    expect(results).toHaveLength(1);
    expect(results[0]?.id).toBe("anthropic/claude-3");
  });

  it("detects free models", async () => {
    const fetchImpl = createFetchFixture({
      object: "list",
      data: [
        {
          id: "free/model",
          model_name: "Free Model",
          owned_by: "free",
          context_length: 4096,
          created: 1700000000,
          capabilities: {
            supports_function_calling: false,
            supports_vision: false,
            supports_tool_choice: false,
            input_modalities: ["text"],
            output_modalities: ["text"],
          },
          pricing: { input_cost_per_token: 0, output_cost_per_token: 0 },
        },
        {
          id: "paid/model",
          model_name: "Paid Model",
          owned_by: "paid",
          context_length: 8192,
          created: 1700000000,
          capabilities: {
            supports_function_calling: true,
            supports_vision: false,
            supports_tool_choice: true,
            input_modalities: ["text"],
            output_modalities: ["text"],
          },
          pricing: { input_cost_per_token: 0.001, output_cost_per_token: 0.002 },
        },
      ],
    });

    const results = await scanEdenAiModels({ fetchImpl, apiKey: "test-key", probe: false });

    expect(results.find((r) => r.id === "free/model")?.isFree).toBe(true);
    expect(results.find((r) => r.id === "paid/model")?.isFree).toBe(false);
  });
});
