import { describe, expect, it } from "vitest";

import { completeSimple } from "@mariozechner/pi-ai";
import { CHUTES_BASE_URL } from "../commands/onboard-auth.models.js";
import { isTruthyEnvValue } from "../infra/env.js";
import { discoverChutesModels, fetchChutesModels } from "./chutes-models.js";

const LIVE = isTruthyEnvValue(process.env.LIVE) || isTruthyEnvValue(process.env.OPENCLAW_LIVE_TEST);
const describeLive = LIVE ? describe : describe.skip;

describeLive("chutes-models [live]", () => {
  it("verify Chutes API /v1/models endpoint returns valid models", async () => {
    const response = await fetch(`${CHUTES_BASE_URL}/models`, {
      signal: AbortSignal.timeout(10000),
    });
    expect(response.ok).toBe(true);
    const data = (await response.json()) as { data: any[] };
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.data.length).toBeGreaterThan(0);

    const firstModel = data.data[0];
    expect(firstModel).toHaveProperty("id");
  });

  it("verify TEE model IDs match production and have confidential_compute: true", async () => {
    const response = await fetch(`${CHUTES_BASE_URL}/models`, {
      signal: AbortSignal.timeout(10000),
    });
    const data = (await response.json()) as { data: any[] };
    const apiModels = data.data;

    const knownTeeModels = [
      "moonshotai/Kimi-K2.5-TEE",
      "deepseek-ai/DeepSeek-V3.2-TEE",
      "Qwen/Qwen3-235B-A22B-Instruct-2507-TEE",
    ];

    for (const teeId of knownTeeModels) {
      const match = apiModels.find((m) => m.id === teeId);
      if (match) {
        expect(
          match.confidential_compute,
          `Model ${teeId} should have confidential_compute: true`,
        ).toBe(true);
      }
    }
  });

  it("verify discoverChutesModels({ teeOnly: true }) filters correctly against live API", async () => {
    const originalVitest = process.env.VITEST;
    delete process.env.VITEST;
    try {
      const models = await discoverChutesModels({ teeOnly: true });
      expect(models.length).toBeGreaterThan(0);
      for (const model of models) {
        expect(
          model.confidentialCompute,
          `Model ${model.id} should have confidentialCompute: true`,
        ).toBe(true);
      }
    } finally {
      process.env.VITEST = originalVitest;
    }
  });

  it("verify fetchChutesModels returns data when VITEST is not set", async () => {
    const originalVitest = process.env.VITEST;
    delete process.env.VITEST;
    try {
      const models = await fetchChutesModels();
      expect(Array.isArray(models)).toBe(true);
      if (models.length > 0) {
        expect(models[0]).toHaveProperty("id");
      }
    } finally {
      process.env.VITEST = originalVitest;
    }
  });

  it("verify chat completion works with real API key", async () => {
    const apiKey = process.env.CHUTES_API_KEY;
    if (!apiKey) {
      console.warn("[live] Skipping completion test: CHUTES_API_KEY not set");
      return;
    }

    const model = {
      provider: "chutes",
      id: "zai-org/GLM-4.7-Flash",
      api: "openai-completions" as const,
      baseUrl: "https://llm.chutes.ai/v1",
    };

    const result = await completeSimple(
      model,
      {
        messages: [
          { role: "user", content: "Say 'Hello World' and nothing else.", timestamp: Date.now() },
        ],
      },
      {
        apiKey,
        maxTokens: 100,
      },
    );

    const text = result.content.find((c) => c.type === "text")?.text?.trim();
    const thinking = result.content.find((c) => c.type === "thinking")?.thinking?.trim();

    // We verify the key works by checking either text or thinking contains the target string.
    expect(text || thinking).toContain("Hello World");
  });
});
