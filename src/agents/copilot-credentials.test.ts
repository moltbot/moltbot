import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  isCopilotCliInstalled,
  readCopilotAuthStatus,
  readCopilotAuthStatusCached,
  resetCopilotCredentialCacheForTest,
} from "./copilot-credentials.js";

describe("copilot-credentials", () => {
  beforeEach(() => {
    resetCopilotCredentialCacheForTest();
  });

  describe("isCopilotCliInstalled", () => {
    it("returns true when copilot --version succeeds", () => {
      const execSync = vi.fn().mockReturnValue("0.0.1");
      const result = isCopilotCliInstalled({ execSync });
      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith("copilot --version", expect.any(Object));
    });

    it("returns false when copilot --version fails", () => {
      const execSync = vi.fn().mockImplementation(() => {
        throw new Error("ENOENT: not found");
      });
      const result = isCopilotCliInstalled({ execSync });
      expect(result).toBe(false);
    });

    it("uses custom cliPath when provided", () => {
      const execSync = vi.fn().mockReturnValue("0.0.1");
      isCopilotCliInstalled({ cliPath: "/usr/local/bin/copilot", execSync });
      expect(execSync).toHaveBeenCalledWith("/usr/local/bin/copilot --version", expect.any(Object));
    });
  });

  describe("readCopilotAuthStatus", () => {
    it("returns authenticated status when CLI reports authenticated", () => {
      const execSync = vi.fn().mockReturnValue(
        JSON.stringify({
          isAuthenticated: true,
          user: {
            login: "testuser",
            avatarUrl: "https://example.com/avatar.png",
          },
        }),
      );
      const result = readCopilotAuthStatus({ execSync });
      expect(result).toEqual({
        authenticated: true,
        login: "testuser",
        avatarUrl: "https://example.com/avatar.png",
      });
    });

    it("returns not authenticated when CLI reports not authenticated", () => {
      const execSync = vi.fn().mockReturnValue(
        JSON.stringify({
          isAuthenticated: false,
        }),
      );
      const result = readCopilotAuthStatus({ execSync });
      expect(result).toEqual({ authenticated: false });
    });

    it("returns null when CLI is not installed", () => {
      const execSync = vi.fn().mockImplementation(() => {
        const error = new Error("ENOENT: not found");
        throw error;
      });
      const result = readCopilotAuthStatus({ execSync });
      expect(result).toBe(null);
    });

    it("returns not authenticated on stderr indicating not logged in", () => {
      const execSync = vi.fn().mockImplementation(() => {
        const error = new Error("Command failed") as Error & { stderr: string };
        error.stderr = "You are not logged in";
        throw error;
      });
      const result = readCopilotAuthStatus({ execSync });
      expect(result).toEqual({ authenticated: false });
    });
  });

  describe("readCopilotAuthStatusCached", () => {
    it("returns cached value within TTL", () => {
      const execSync = vi.fn().mockReturnValue(
        JSON.stringify({
          isAuthenticated: true,
          user: { login: "testuser" },
        }),
      );

      // First call populates cache
      const result1 = readCopilotAuthStatusCached({ execSync, ttlMs: 60000 });
      expect(result1?.authenticated).toBe(true);
      expect(execSync).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const result2 = readCopilotAuthStatusCached({ execSync, ttlMs: 60000 });
      expect(result2?.authenticated).toBe(true);
      expect(execSync).toHaveBeenCalledTimes(1); // Not called again
    });

    it("refreshes cache after TTL expires", async () => {
      const execSync = vi.fn().mockReturnValue(
        JSON.stringify({
          isAuthenticated: true,
          user: { login: "testuser" },
        }),
      );

      // First call with very short TTL
      readCopilotAuthStatusCached({ execSync, ttlMs: 1 });
      expect(execSync).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 5));

      // Second call should refresh
      readCopilotAuthStatusCached({ execSync, ttlMs: 1 });
      expect(execSync).toHaveBeenCalledTimes(2);
    });

    it("does not cache when ttlMs is 0", () => {
      const execSync = vi.fn().mockReturnValue(
        JSON.stringify({
          isAuthenticated: true,
          user: { login: "testuser" },
        }),
      );

      readCopilotAuthStatusCached({ execSync, ttlMs: 0 });
      readCopilotAuthStatusCached({ execSync, ttlMs: 0 });
      expect(execSync).toHaveBeenCalledTimes(2);
    });
  });
});
