import { beforeEach, describe, expect, it, vi } from "vitest";

// Hoist mock functions so they're available before module import
const mockGetAuthStatus = vi.hoisted(() => vi.fn());
const mockListModels = vi.hoisted(() => vi.fn());
const mockStart = vi.hoisted(() => vi.fn());
const mockStop = vi.hoisted(() => vi.fn());
const mockGetState = vi.hoisted(() => vi.fn().mockReturnValue("disconnected"));

// Create a mock class that vitest can instantiate
const MockCopilotClient = vi.hoisted(() =>
  vi.fn().mockImplementation(function () {
    return {
      getAuthStatus: mockGetAuthStatus,
      listModels: mockListModels,
      start: mockStart,
      stop: mockStop,
      getState: mockGetState,
    };
  }),
);

// Mock the @github/copilot-sdk module
vi.mock("@github/copilot-sdk", () => ({
  CopilotClient: MockCopilotClient,
}));

describe("github-copilot-sdk", () => {
  beforeEach(async () => {
    vi.resetModules();
    mockGetAuthStatus.mockReset();
    mockListModels.mockReset();
    mockStart.mockReset();
    mockStop.mockReset();
    mockGetState.mockReset();
    mockGetState.mockReturnValue("disconnected");
    MockCopilotClient.mockClear();
  });

  it("deriveCopilotApiBaseUrlFromToken returns null (SDK manages base URL)", async () => {
    const { deriveCopilotApiBaseUrlFromToken } = await import("./github-copilot-sdk.js");
    expect(deriveCopilotApiBaseUrlFromToken("token;proxy-ep=proxy.example.com;")).toBeNull();
    expect(deriveCopilotApiBaseUrlFromToken("anything")).toBeNull();
  });

  it("returns sdk-managed token when authenticated", async () => {
    mockStart.mockResolvedValue(undefined);
    mockGetAuthStatus.mockResolvedValue({ isAuthenticated: true });

    const { resolveCopilotApiToken } = await import("./github-copilot-sdk.js");
    const res = await resolveCopilotApiToken({ githubToken: "gh" });

    expect(res.token).toBe("sdk-managed");
    expect(res.source).toBe("sdk:copilot-cli");
    expect(res.baseUrl).toBe("https://api.individual.githubcopilot.com");
    expect(res.expiresAt).toBeGreaterThan(Date.now());
  });

  it("throws error when not authenticated", async () => {
    mockStart.mockResolvedValue(undefined);
    mockGetAuthStatus.mockResolvedValue({ isAuthenticated: false });

    const { resolveCopilotApiToken } = await import("./github-copilot-sdk.js");
    await expect(resolveCopilotApiToken({ githubToken: "gh" })).rejects.toThrow(
      "GitHub Copilot is not authenticated",
    );
  });

  it("isCopilotSdkReady returns true when SDK is available and authenticated", async () => {
    mockStart.mockResolvedValue(undefined);
    mockGetAuthStatus.mockResolvedValue({ isAuthenticated: true });

    const { isCopilotSdkReady } = await import("./github-copilot-sdk.js");
    expect(await isCopilotSdkReady()).toBe(true);
  });

  it("isCopilotSdkReady returns false when not authenticated", async () => {
    mockStart.mockResolvedValue(undefined);
    mockGetAuthStatus.mockResolvedValue({ isAuthenticated: false });

    const { isCopilotSdkReady } = await import("./github-copilot-sdk.js");
    expect(await isCopilotSdkReady()).toBe(false);
  });

  it("isCopilotSdkReady returns false when SDK fails to start", async () => {
    mockStart.mockRejectedValue(new Error("CLI not found"));

    const { isCopilotSdkReady } = await import("./github-copilot-sdk.js");
    expect(await isCopilotSdkReady()).toBe(false);
  });

  it("listCopilotModels returns models from SDK", async () => {
    mockStart.mockResolvedValue(undefined);
    mockListModels.mockResolvedValue([
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "o1", name: "O1" },
    ]);

    const { listCopilotModels } = await import("./github-copilot-sdk.js");
    const models = await listCopilotModels();
    expect(models).toHaveLength(2);
    expect(models[0].id).toBe("gpt-4o");
  });
});
