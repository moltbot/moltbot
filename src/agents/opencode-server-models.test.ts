import { describe, expect, it } from "vitest";

import {
  getOpencodeServerStaticFallbackModels,
  OPENCODE_SERVER_MODEL_ALIASES,
  resolveOpencodeServerAlias,
  resolveOpencodeServerModelApi,
} from "./opencode-server-models.js";

describe("resolveOpencodeServerAlias", () => {
  it("resolves opus alias", () => {
    expect(resolveOpencodeServerAlias("opus")).toBe("claude-opus-4-5");
  });

  it("resolves gpt aliases", () => {
    expect(resolveOpencodeServerAlias("gpt4")).toBe("gpt-4-turbo");
    expect(resolveOpencodeServerAlias("gpt5")).toBe("gpt-5");
  });

  it("resolves gemini alias", () => {
    expect(resolveOpencodeServerAlias("gemini")).toBe("gemini-2.5-pro");
    expect(resolveOpencodeServerAlias("flash")).toBe("gemini-2.5-flash");
  });

  it("returns input if no alias exists", () => {
    expect(resolveOpencodeServerAlias("some-unknown-model")).toBe("some-unknown-model");
  });

  it("is case-insensitive", () => {
    expect(resolveOpencodeServerAlias("OPUS")).toBe("claude-opus-4-5");
    expect(resolveOpencodeServerAlias("Gpt5")).toBe("gpt-5");
  });
});

describe("resolveOpencodeServerModelApi", () => {
  it("maps Claude models to anthropic-messages", () => {
    expect(resolveOpencodeServerModelApi("claude-opus-4-5")).toBe("anthropic-messages");
    expect(resolveOpencodeServerModelApi("claude-sonnet-4")).toBe("anthropic-messages");
    expect(resolveOpencodeServerModelApi("claude-haiku-3.5")).toBe("anthropic-messages");
  });

  it("maps GPT models to openai-responses", () => {
    expect(resolveOpencodeServerModelApi("gpt-4-turbo")).toBe("openai-responses");
    expect(resolveOpencodeServerModelApi("gpt-5")).toBe("openai-responses");
  });

  it("maps O1/O3 models to openai-responses", () => {
    expect(resolveOpencodeServerModelApi("o1-preview")).toBe("openai-responses");
    expect(resolveOpencodeServerModelApi("o3-mini")).toBe("openai-responses");
  });

  it("maps Gemini models to google-generative-ai", () => {
    expect(resolveOpencodeServerModelApi("gemini-2.5-pro")).toBe("google-generative-ai");
    expect(resolveOpencodeServerModelApi("gemini-2.5-flash")).toBe("google-generative-ai");
  });

  it("maps unknown models to openai-completions fallback", () => {
    expect(resolveOpencodeServerModelApi("some-unknown-model")).toBe("openai-completions");
    expect(resolveOpencodeServerModelApi("llama-3")).toBe("openai-completions");
  });

  it("maps minimax models to anthropic-messages", () => {
    expect(resolveOpencodeServerModelApi("minimax-m2")).toBe("anthropic-messages");
  });
});

describe("getOpencodeServerStaticFallbackModels", () => {
  it("returns an array of models", () => {
    const models = getOpencodeServerStaticFallbackModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
  });

  it("includes Claude, GPT, and Gemini models", () => {
    const models = getOpencodeServerStaticFallbackModels();
    const ids = models.map((m) => m.id);

    expect(ids).toContain("claude-opus-4-5");
    expect(ids).toContain("gpt-4-turbo");
    expect(ids).toContain("gemini-2.5-pro");
  });

  it("returns valid ModelDefinitionConfig objects", () => {
    const models = getOpencodeServerStaticFallbackModels();
    for (const model of models) {
      expect(model.id).toBeDefined();
      expect(model.name).toBeDefined();
      expect(typeof model.reasoning).toBe("boolean");
      expect(Array.isArray(model.input)).toBe(true);
      expect(model.cost).toBeDefined();
      expect(typeof model.contextWindow).toBe("number");
      expect(typeof model.maxTokens).toBe("number");
    }
  });
});

describe("OPENCODE_SERVER_MODEL_ALIASES", () => {
  it("has expected aliases", () => {
    expect(OPENCODE_SERVER_MODEL_ALIASES.opus).toBe("claude-opus-4-5");
    expect(OPENCODE_SERVER_MODEL_ALIASES.sonnet).toBe("claude-sonnet-4");
    expect(OPENCODE_SERVER_MODEL_ALIASES.gpt4).toBe("gpt-4-turbo");
    expect(OPENCODE_SERVER_MODEL_ALIASES.gemini).toBe("gemini-2.5-pro");
  });
});
