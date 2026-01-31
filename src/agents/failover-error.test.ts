import { describe, expect, it } from "vitest";
import {
  coerceToFailoverError,
  describeFailoverError,
  resolveFailoverReasonFromError,
} from "./failover-error.js";

describe("failover-error", () => {
  it("infers failover reason from HTTP status", () => {
    expect(resolveFailoverReasonFromError({ status: 402 })).toBe("billing");
    expect(resolveFailoverReasonFromError({ statusCode: "429" })).toBe("rate_limit");
    expect(resolveFailoverReasonFromError({ status: 403 })).toBe("auth");
    expect(resolveFailoverReasonFromError({ status: 408 })).toBe("timeout");
  });

  it("infers format errors from error messages", () => {
    expect(
      resolveFailoverReasonFromError({
        message: "invalid request format: messages.1.content.1.tool_use.id",
      }),
    ).toBe("format");
  });

  it("infers timeout from common node error codes", () => {
    expect(resolveFailoverReasonFromError({ code: "ETIMEDOUT" })).toBe("timeout");
    expect(resolveFailoverReasonFromError({ code: "ECONNRESET" })).toBe("timeout");
  });

  it("coerces failover-worthy errors into FailoverError with metadata", () => {
    const err = coerceToFailoverError("credit balance too low", {
      provider: "anthropic",
      model: "claude-opus-4-5",
    });
    expect(err?.name).toBe("FailoverError");
    expect(err?.reason).toBe("billing");
    expect(err?.status).toBe(402);
    expect(err?.provider).toBe("anthropic");
    expect(err?.model).toBe("claude-opus-4-5");
  });

  it("coerces format errors with a 400 status", () => {
    const err = coerceToFailoverError("invalid request format", {
      provider: "google",
      model: "cloud-code-assist",
    });
    expect(err?.reason).toBe("format");
    expect(err?.status).toBe(400);
  });

  it("infers provider_unavailable from OpenRouter no-endpoints error", () => {
    expect(
      resolveFailoverReasonFromError({
        status: 404,
        message: "No endpoints found that support tool use",
      }),
    ).toBe("provider_unavailable");
  });

  it("infers provider_unavailable from model-unavailable messages", () => {
    expect(
      resolveFailoverReasonFromError({
        message: "model is currently unavailable",
      }),
    ).toBe("provider_unavailable");
    expect(
      resolveFailoverReasonFromError({
        message: "model not available for this request",
      }),
    ).toBe("provider_unavailable");
  });

  it("coerces provider_unavailable errors with a 404 status", () => {
    const err = coerceToFailoverError(
      { message: "No endpoints found that support tool use", status: 404 },
      { provider: "openrouter", model: "deepseek/deepseek-chat-v3-0324" },
    );
    expect(err?.reason).toBe("provider_unavailable");
    expect(err?.status).toBe(404);
    expect(err?.provider).toBe("openrouter");
  });

  it("describes non-Error values consistently", () => {
    const described = describeFailoverError(123);
    expect(described.message).toBe("123");
    expect(described.reason).toBeUndefined();
  });
});
