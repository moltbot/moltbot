import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  discoverOllamaModels,
  probeOllama,
  isProviderHealthy,
  providerHealth,
} from "./models-config.providers.js";
import { fetchWithRetry } from "../utils/fetch-retry.js";

describe("Ollama discovery and probe", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    providerHealth.clear();
  });

  it("fetchWithRetry retries until success", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        calls += 1;
        if (calls < 3) {
          throw new Error("temporary failure");
        }
        return {
          ok: true,
          json: async () => ({
            models: [{ name: "qwen2.5-coder", modified_at: "", size: 1, digest: "d" }],
          }),
        } as unknown as Response;
      }),
    );

    const res = await fetchWithRetry("http://127.0.0.1:11434/api/tags", undefined, 4, 10);
    expect(res.ok).toBe(true);
  });

  it("discoverOllamaModels uses retry and marks provider healthy on success", async () => {
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        calls += 1;
        if (calls < 2) {
          throw new Error("connect fail");
        }
        return {
          ok: true,
          json: async () => ({
            models: [{ name: "qwen2.5-coder", modified_at: "", size: 1, digest: "d" }],
          }),
        } as unknown as Response;
      }),
    );

    // discovery skips when VITEST is set; clear it for this test so the retry path runs
    vi.stubEnv("VITEST", "");
    vi.stubEnv("NODE_ENV", "development");
    const models = await discoverOllamaModels();
    expect(models.length).toBeGreaterThan(0);
    expect(isProviderHealthy("ollama")).toBe(true);
  });

  it("probeOllama returns false and marks unhealthy when unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => {
        throw new Error("unreachable");
      }),
    );

    const ok = await probeOllama(100, 2);
    expect(ok).toBe(false);
    expect(isProviderHealthy("ollama")).toBe(false);
  });
});
