import { describe, expect, it } from "vitest";

import { __testing } from "./web-search.js";

const {
  inferPerplexityBaseUrlFromApiKey,
  resolvePerplexityBaseUrl,
  normalizeFreshness,
  resolvePerplexityRequestParams,
  buildWebSearchCacheKey,
} = __testing;

describe("web_search perplexity baseUrl defaults", () => {
  it("detects a Perplexity key prefix", () => {
    expect(inferPerplexityBaseUrlFromApiKey("pplx-123")).toBe("direct");
  });

  it("detects an OpenRouter key prefix", () => {
    expect(inferPerplexityBaseUrlFromApiKey("sk-or-v1-123")).toBe("openrouter");
  });

  it("returns undefined for unknown key formats", () => {
    expect(inferPerplexityBaseUrlFromApiKey("unknown-key")).toBeUndefined();
  });

  it("prefers explicit baseUrl over key-based defaults", () => {
    expect(resolvePerplexityBaseUrl({ baseUrl: "https://example.com" }, "config", "pplx-123")).toBe(
      "https://example.com",
    );
  });

  it("defaults to direct when using PERPLEXITY_API_KEY", () => {
    expect(resolvePerplexityBaseUrl(undefined, "perplexity_env")).toBe("https://api.perplexity.ai");
  });

  it("defaults to OpenRouter when using OPENROUTER_API_KEY", () => {
    expect(resolvePerplexityBaseUrl(undefined, "openrouter_env")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  it("defaults to direct when config key looks like Perplexity", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "pplx-123")).toBe(
      "https://api.perplexity.ai",
    );
  });

  it("defaults to OpenRouter when config key looks like OpenRouter", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "sk-or-v1-123")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });

  it("defaults to OpenRouter for unknown config key formats", () => {
    expect(resolvePerplexityBaseUrl(undefined, "config", "weird-key")).toBe(
      "https://openrouter.ai/api/v1",
    );
  });
});

describe("web_search freshness normalization", () => {
  it("accepts Brave shortcut values", () => {
    expect(normalizeFreshness("pd")).toBe("pd");
    expect(normalizeFreshness("PW")).toBe("pw");
  });

  it("accepts valid date ranges", () => {
    expect(normalizeFreshness("2024-01-01to2024-01-31")).toBe("2024-01-01to2024-01-31");
  });

  it("rejects invalid date ranges", () => {
    expect(normalizeFreshness("2024-13-01to2024-01-31")).toBeUndefined();
    expect(normalizeFreshness("2024-02-30to2024-03-01")).toBeUndefined();
    expect(normalizeFreshness("2024-03-10to2024-03-01")).toBeUndefined();
  });
});

describe("web_search model parameter", () => {
  it("prefixes short model names for OpenRouter", () => {
    const { effectivePerplexityModel: shortModel } = resolvePerplexityRequestParams({
      baseUrl: "https://openrouter.ai/api/v1",
      model: "sonar",
    });
    expect(shortModel).toBe("perplexity/sonar");

    const { effectivePerplexityModel: prefixedModel } = resolvePerplexityRequestParams({
      baseUrl: "https://openrouter.ai/api/v1",
      model: "perplexity/sonar-pro",
    });
    expect(prefixedModel).toBe("perplexity/sonar-pro");
  });

  it("keeps short model names for direct Perplexity", () => {
    const { effectivePerplexityModel } = resolvePerplexityRequestParams({
      baseUrl: "https://api.perplexity.ai",
      model: "sonar",
    });
    expect(effectivePerplexityModel).toBe("sonar");
  });

  it("differentiates cache keys by model", () => {
    const baseParams = {
      provider: "perplexity" as const,
      query: "model test",
      count: 5,
      perplexityBaseUrl: "default",
    };

    const firstParams = resolvePerplexityRequestParams({
      baseUrl: "https://openrouter.ai/api/v1",
      model: "sonar",
    });
    const secondParams = resolvePerplexityRequestParams({
      baseUrl: "https://openrouter.ai/api/v1",
      model: "sonar-pro",
    });

    const first = buildWebSearchCacheKey({
      ...baseParams,
      perplexityModel: firstParams.cachePerplexityModel,
      perplexityBaseUrl: firstParams.cachePerplexityBaseUrl,
    });
    const second = buildWebSearchCacheKey({
      ...baseParams,
      perplexityModel: secondParams.cachePerplexityModel,
      perplexityBaseUrl: secondParams.cachePerplexityBaseUrl,
    });

    expect(first).not.toBe(second);
  });

  it("differentiates cache keys by baseUrl", () => {
    const baseParams = {
      provider: "perplexity" as const,
      query: "base url test",
      count: 5,
    };

    const openRouterParams = resolvePerplexityRequestParams({
      baseUrl: "https://openrouter.ai/api/v1",
      model: "sonar",
    });
    const directParams = resolvePerplexityRequestParams({
      baseUrl: "https://api.perplexity.ai",
      model: "sonar",
    });

    const openRouter = buildWebSearchCacheKey({
      ...baseParams,
      perplexityModel: openRouterParams.cachePerplexityModel,
      perplexityBaseUrl: openRouterParams.cachePerplexityBaseUrl,
    });
    const direct = buildWebSearchCacheKey({
      ...baseParams,
      perplexityModel: directParams.cachePerplexityModel,
      perplexityBaseUrl: directParams.cachePerplexityBaseUrl,
    });

    expect(openRouter).not.toBe(direct);
  });
});
