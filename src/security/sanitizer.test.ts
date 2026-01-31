import { afterEach, describe, expect, it } from "vitest";
import { resetSanitizerCache, sanitizeResponse } from "./sanitizer.js";

describe("sanitizeResponse", () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = originalEnv;
    resetSanitizerCache();
  });

  it("returns empty string for null/undefined", () => {
    expect(sanitizeResponse(null)).toBe("");
    expect(sanitizeResponse(undefined)).toBe("");
  });

  it("redacts environment variables that look sensitive", () => {
    process.env = { ...originalEnv, TEST_API_KEY: "super_secret_value_123" };

    const input = "Here is my key: super_secret_value_123";
    const expected = "Here is my key: ****";

    expect(sanitizeResponse(input)).toBe(expected);
  });

  it("ignores short environment variables", () => {
    process.env = { ...originalEnv, TEST_API_KEY: "short" };

    const input = "The value is short here";
    expect(sanitizeResponse(input)).toBe(input);
  });

  it("ignores environment variables without sensitive keys", () => {
    process.env = { ...originalEnv, SOME_PATH: "not_a_secret_path" };
    const input = "Path: not_a_secret_path";
    expect(sanitizeResponse(input)).toBe(input);
  });

  it("redacts known secret patterns (Bearer token)", () => {
    const input = "Header: Authorization: Bearer abcdef1234567890abcdef1234567890 end";

    const output = sanitizeResponse(input);
    expect(output).toContain("Authorization: Bearer ****");
    expect(output).not.toContain("abcdef1234567890");
  });

  it("redacts sk- keys", () => {
    const input = "Key: sk-1234567890abcdef1234567890";
    const output = sanitizeResponse(input);
    expect(output).toBe("Key: ****");
  });

  it("handles mixed redaction", () => {
    process.env = { ...originalEnv, MY_SECRET_PASS: "hunter2_complex" };
    const input = "My pass is hunter2_complex and my key is sk-1234567890abcdef";

    const output = sanitizeResponse(input);
    expect(output).toContain("My pass is ****");
    expect(output).toContain("my key is ****");
    expect(output).not.toContain("hunter2_complex");
    expect(output).not.toContain("sk-123");
  });
});
