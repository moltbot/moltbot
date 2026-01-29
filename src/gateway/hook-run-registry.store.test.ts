import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config/paths.js", () => ({
  STATE_DIR: "/mock/state",
}));

vi.mock("../infra/json-file.js", () => ({
  loadJsonFile: vi.fn(),
  saveJsonFile: vi.fn(),
}));

describe("hook-run-registry.store", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe("loadHookRunRegistryFromDisk", () => {
    it("returns empty map when file does not exist", async () => {
      const { loadJsonFile } = await import("../infra/json-file.js");
      vi.mocked(loadJsonFile).mockReturnValue(null);

      const { loadHookRunRegistryFromDisk } = await import("./hook-run-registry.store.js");
      const result = loadHookRunRegistryFromDisk();

      expect(result.size).toBe(0);
    });

    it("loads and parses existing registry file", async () => {
      const { loadJsonFile } = await import("../infra/json-file.js");
      vi.mocked(loadJsonFile).mockReturnValue({
        version: 1,
        runs: {
          "run-1": {
            runId: "run-1",
            sessionKey: "hook:test:1",
            jobName: "test",
            cleanup: "delete",
            cleanupDelayMinutes: 0,
            createdAt: 1000,
          },
        },
      });

      const { loadHookRunRegistryFromDisk } = await import("./hook-run-registry.store.js");
      const result = loadHookRunRegistryFromDisk();

      expect(result.size).toBe(1);
      expect(result.get("run-1")?.sessionKey).toBe("hook:test:1");
    });

    it("returns empty map for invalid version", async () => {
      const { loadJsonFile } = await import("../infra/json-file.js");
      vi.mocked(loadJsonFile).mockReturnValue({
        version: 999,
        runs: { "run-1": { runId: "run-1" } },
      });

      const { loadHookRunRegistryFromDisk } = await import("./hook-run-registry.store.js");
      const result = loadHookRunRegistryFromDisk();

      expect(result.size).toBe(0);
    });
  });

  describe("saveHookRunRegistryToDisk", () => {
    it("writes versioned registry to disk", async () => {
      const { saveJsonFile } = await import("../infra/json-file.js");
      const mockSave = vi.mocked(saveJsonFile);

      const { saveHookRunRegistryToDisk } = await import("./hook-run-registry.store.js");
      const registry = new Map([
        [
          "run-1",
          {
            runId: "run-1",
            sessionKey: "hook:test:1",
            jobName: "test",
            cleanup: "delete" as const,
            cleanupDelayMinutes: 0,
            createdAt: Date.now(),
          },
        ],
      ]);

      saveHookRunRegistryToDisk(registry);

      expect(mockSave).toHaveBeenCalledWith(
        expect.stringContaining("hook-runs.json"),
        expect.objectContaining({ version: 1 }),
      );
    });
  });

  describe("resolveHookRunRegistryPath", () => {
    it("returns path under STATE_DIR", async () => {
      const { resolveHookRunRegistryPath } = await import("./hook-run-registry.store.js");
      const result = resolveHookRunRegistryPath();

      expect(result).toContain("/mock/state");
      expect(result).toContain("hook-runs.json");
    });
  });
});
