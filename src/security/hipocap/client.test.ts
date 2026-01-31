import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HipocapClient } from "./client.js";
import type { HipocapConfig } from "../../config/types.hipocap.js";

vi.mock("../../observability/lmnr.js", () => ({
  withHipocapSpan: vi.fn((name, attributes, _request, fn) => fn()),
  recordLmnrEvent: vi.fn(),
  setLmnrSpanAttributes: vi.fn(),
  setLmnrTraceMetadata: vi.fn(),
  setLmnrSpanStatus: vi.fn(),
  withLmnrSpan: vi.fn((name, fn) => fn()),
}));

describe("HipocapClient", () => {
  const mockConfig: HipocapConfig = {
    enabled: true,
    apiKey: "test-key",
    userId: "test-user",
    serverUrl: "http://test-server",
    observabilityUrl: "http://test-obs",
    defaultPolicy: "test-policy",
    defaultShield: "test-shield",
    fastMode: true,
  };

  let client: HipocapClient;

  // Mock global fetch
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    client = new HipocapClient(mockConfig);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("initialization", () => {
    it("should be enabled when config is enabled", () => {
      expect(client.isEnabled()).toBe(true);
    });

    it("should be disabled when config is disabled", () => {
      const disabledClient = new HipocapClient({ ...mockConfig, enabled: false });
      expect(disabledClient.isEnabled()).toBe(false);
    });

    it("should pass health check when server responds ok", async () => {
      fetchMock.mockResolvedValueOnce({ ok: true });
      const result = await client.healthCheck();
      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith("http://test-server/api/v1/health");
    });

    it("should fail health check when server fails", async () => {
      fetchMock.mockResolvedValueOnce({ ok: false });
      const result = await client.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe("analyze", () => {
    it("should return safe fallback if disabled", async () => {
      const disabledClient = new HipocapClient({ ...mockConfig, enabled: false });
      const result = await disabledClient.analyze({ function_name: "test" });
      expect(result.safe_to_use).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("should call API with correct headers and body", async () => {
      const mockResponse = {
        final_decision: "ALLOWED",
        safe_to_use: true,
      };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const request = {
        function_name: "test_func",
        user_query: "hello",
      };

      const result = await client.analyze(request);

      expect(result).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toContain("http://test-server/api/v1/analyze");
      expect(url).toContain("policy_key=test-policy");
      expect(options.method).toBe("POST");
      expect(options.headers).toMatchObject({
        "Content-Type": "application/json",
        Authorization: "Bearer test-key",
        "X-LMNR-API-Key": "test-key",
        "X-LMNR-User-Id": "test-user",
      });
      const body = JSON.parse(options.body as string);
      expect(body).toMatchObject({
        function_name: "test_func",
        user_query: "hello",
      });
    });

    it("should return REVIEW_REQUIRED on API failure", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        statusText: "Internal Server Error",
        status: 500,
      });

      const result = await client.analyze({ function_name: "test" });
      expect(result.final_decision).toBe("REVIEW_REQUIRED");
      expect(result.safe_to_use).toBe(false);
      expect(result.reason).toContain("Hipocap API error");
    });

    it("should return REVIEW_REQUIRED on connection error", async () => {
      fetchMock.mockRejectedValueOnce(new Error("Network error"));

      const result = await client.analyze({ function_name: "test" });
      expect(result.final_decision).toBe("REVIEW_REQUIRED");
      expect(result.safe_to_use).toBe(false);
      expect(result.reason).toContain("Network error");
    });
  });

  describe("shield", () => {
    it("should allow if disabled", async () => {
      const disabledClient = new HipocapClient({ ...mockConfig, enabled: false });
      const result = await disabledClient.shield({ shield_key: "jailbreak", content: "test" });
      expect(result.decision).toBe("ALLOW");
    });

    it("should call shield API correct", async () => {
      const mockResponse = {
        decision: "BLOCK",
        reason: "Prompt Injection",
      };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.shield({
        shield_key: "jailbreak",
        content: "ignore instructions",
      });

      expect(result).toEqual(mockResponse);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(url).toBe("http://test-server/api/v1/shields/jailbreak/analyze");
      const body = JSON.parse(options.body as string);
      expect(body).toMatchObject({
        content: "ignore instructions",
      });
      expect(options.headers).toMatchObject({
        "X-LMNR-API-Key": "test-key",
        "X-LMNR-User-Id": "test-user",
      });
    });
  });

  describe("policy and shield management", () => {
    it("should list policies correctly", async () => {
      const mockPolicies = [{ policy_key: "test" }];
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicies,
      });

      const result = await client.listPolicies();
      expect(result).toEqual(mockPolicies);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://test-server/api/v1/policies",
        expect.any(Object),
      );
    });

    it("should list shields correctly", async () => {
      const mockShields = [{ shield_key: "test" }];
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockShields,
      });

      const result = await client.listShields();
      expect(result).toEqual(mockShields);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://test-server/api/v1/shields",
        expect.any(Object),
      );
    });

    it("should create a policy correctly", async () => {
      const mockPolicy = { policy_key: "new" };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockPolicy,
      });

      const result = await client.createPolicy({
        policy_key: "new",
        roles: ["user"],
        functions: ["*"],
      });
      expect(result).toEqual(mockPolicy);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://test-server/api/v1/policies",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("should create a shield correctly", async () => {
      const mockShield = { shield_key: "new" };
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => mockShield,
      });

      const result = await client.createShield({ shield_key: "new", name: "New" } as any);
      expect(result).toEqual(mockShield);
      expect(fetchMock).toHaveBeenCalledWith(
        "http://test-server/api/v1/shields",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });
  });
});
