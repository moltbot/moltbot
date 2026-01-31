import { describe, expect, it } from "vitest";

import type { Api, Model } from "@mariozechner/pi-ai";

import { maybeInjectCloudflareAiGatewayAuthHeader } from "./model.js";

function makeModel(overrides?: Partial<Model<Api>>): Model<Api> {
  return {
    id: "openrouter/moonshotai/kimi-k2-thinking",
    name: "Kimi",
    provider: "openrouter",
    api: "openai-completions",
    baseUrl: "https://gateway.ai.cloudflare.com/v1/acc/gw/openrouter",
    reasoning: true,
    input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 8192,
    ...(overrides ?? {}),
  } as Model<Api>;
}

describe("maybeInjectCloudflareAiGatewayAuthHeader", () => {
  it("injects cf-aig-authorization for openrouter models routed via gateway.ai.cloudflare.com", () => {
    const model = makeModel();
    const out = maybeInjectCloudflareAiGatewayAuthHeader(model, {
      CLOUDFLARE_AIG_TOKEN: "cf_test_token",
    });
    expect(out.headers?.["cf-aig-authorization"]).toBe("Bearer cf_test_token");
  });

  it("does not inject when token is missing", () => {
    const model = makeModel();
    const out = maybeInjectCloudflareAiGatewayAuthHeader(model, {});
    expect(out.headers?.["cf-aig-authorization"]).toBeUndefined();
  });

  it("does not inject when baseUrl is not Cloudflare AI Gateway", () => {
    const model = makeModel({ baseUrl: "https://openrouter.ai/api/v1" });
    const out = maybeInjectCloudflareAiGatewayAuthHeader(model, {
      CLOUDFLARE_AIG_TOKEN: "cf_test_token",
    });
    expect(out.headers?.["cf-aig-authorization"]).toBeUndefined();
  });

  it("does not override existing header", () => {
    const model = makeModel({
      headers: { "cf-aig-authorization": "Bearer existing" },
    });
    const out = maybeInjectCloudflareAiGatewayAuthHeader(model, {
      CLOUDFLARE_AIG_TOKEN: "cf_test_token",
    });
    expect(out.headers?.["cf-aig-authorization"]).toBe("Bearer existing");
  });

  it("does not inject for non-openrouter providers", () => {
    const model = makeModel({ provider: "openai" });
    const out = maybeInjectCloudflareAiGatewayAuthHeader(model, {
      CLOUDFLARE_AIG_TOKEN: "cf_test_token",
    });
    expect(out.headers?.["cf-aig-authorization"]).toBeUndefined();
  });
});

