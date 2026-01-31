/**
 * Tests for Cursor Agent plugin.
 */

import { describe, it, expect } from "vitest";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import { cursorAgentPlugin } from "./plugin.js";

describe("cursorAgentPlugin", () => {
  describe("metadata", () => {
    it("should have correct id", () => {
      expect(cursorAgentPlugin.id).toBe("cursor-agent");
    });

    it("should have correct meta", () => {
      expect(cursorAgentPlugin.meta.id).toBe("cursor-agent");
      expect(cursorAgentPlugin.meta.label).toBe("Cursor Agent");
      expect(cursorAgentPlugin.meta.aliases).toContain("cursor");
    });

    it("should have dm capability", () => {
      expect(cursorAgentPlugin.capabilities.chatTypes).toContain("dm");
    });
  });

  describe("config adapter", () => {
    it("should list account IDs from config", () => {
      const cfg = {
        channels: {
          cursorAgent: {
            accounts: {
              default: { apiKey: "key1" },
              work: { apiKey: "key2" },
            },
          },
        },
      } as OpenClawConfig;

      const ids = cursorAgentPlugin.config.listAccountIds(cfg);
      expect(ids).toContain("default");
      expect(ids).toContain("work");
    });

    it("should return empty array for missing config", () => {
      const cfg = {} as OpenClawConfig;
      const ids = cursorAgentPlugin.config.listAccountIds(cfg);
      expect(ids).toEqual([]);
    });

    it("should resolve account by ID", () => {
      const cfg = {
        channels: {
          cursorAgent: {
            accounts: {
              default: { apiKey: "default-key" },
              work: { apiKey: "work-key", repository: "https://github.com/work/repo" },
            },
          },
        },
      } as OpenClawConfig;

      const account = cursorAgentPlugin.config.resolveAccount(cfg, "work");
      expect(account.apiKey).toBe("work-key");
      expect(account.repository).toBe("https://github.com/work/repo");
    });

    it("should return empty account for missing config", () => {
      const cfg = {} as OpenClawConfig;
      const account = cursorAgentPlugin.config.resolveAccount(cfg, "default");
      expect(account.apiKey).toBe("");
      expect(account.enabled).toBe(false);
    });

    it("should return default account ID", () => {
      expect(cursorAgentPlugin.config.defaultAccountId()).toBe("default");
    });

    it("should check if account is configured", () => {
      const cfgWithKey = {
        channels: {
          cursorAgent: {
            accounts: {
              default: { apiKey: "test-key" },
            },
          },
        },
      } as OpenClawConfig;

      const cfgWithoutKey = {
        channels: {
          cursorAgent: {
            accounts: {
              default: { apiKey: "" },
            },
          },
        },
      } as OpenClawConfig;

      expect(cursorAgentPlugin.config.isConfigured({}, cfgWithKey)).toBe(true);
      expect(cursorAgentPlugin.config.isConfigured({}, cfgWithoutKey)).toBe(false);
    });

    it("should check if account is enabled", () => {
      expect(cursorAgentPlugin.config.isEnabled({ apiKey: "key", enabled: true })).toBe(true);
      expect(cursorAgentPlugin.config.isEnabled({ apiKey: "key", enabled: false })).toBe(false);
      expect(cursorAgentPlugin.config.isEnabled({ apiKey: "key" })).toBe(true); // Default enabled
    });

    it("should describe account", () => {
      const account = { apiKey: "test-key", enabled: true };
      const description = cursorAgentPlugin.config.describeAccount(account);

      expect(description.accountId).toBe("default");
      expect(description.enabled).toBe(true);
      expect(description.configured).toBe(true);
    });
  });

  describe("status adapter", () => {
    it("should have default runtime state", () => {
      const defaultRuntime = cursorAgentPlugin.status?.defaultRuntime;
      expect(defaultRuntime?.accountId).toBe("default");
      expect(defaultRuntime?.running).toBe(false);
    });

    it("should build channel summary", () => {
      const snapshot = {
        accountId: "default",
        configured: true,
        running: true,
        lastStartAt: Date.now(),
        lastStopAt: null,
        lastError: null,
      };

      const summary = cursorAgentPlugin.status?.buildChannelSummary?.({ snapshot });
      expect(summary?.configured).toBe(true);
      expect(summary?.running).toBe(true);
    });

    it("should build account snapshot", () => {
      const account = { apiKey: "test-key", enabled: true };
      const snapshot = cursorAgentPlugin.status?.buildAccountSnapshot?.({
        account,
        runtime: { running: true, lastStartAt: Date.now() },
      });

      expect(snapshot?.configured).toBe(true);
      expect(snapshot?.enabled).toBe(true);
      expect(snapshot?.running).toBe(true);
    });
  });

  describe("gateway adapter", () => {
    it("should have startAccount function", () => {
      expect(cursorAgentPlugin.gateway?.startAccount).toBeDefined();
      expect(typeof cursorAgentPlugin.gateway?.startAccount).toBe("function");
    });

    it("should have stopAccount function", () => {
      expect(cursorAgentPlugin.gateway?.stopAccount).toBeDefined();
      expect(typeof cursorAgentPlugin.gateway?.stopAccount).toBe("function");
    });
  });

  describe("outbound adapter", () => {
    it("should have sendMessage function", () => {
      expect(cursorAgentPlugin.outbound?.sendMessage).toBeDefined();
      expect(typeof cursorAgentPlugin.outbound?.sendMessage).toBe("function");
    });
  });

  describe("onboarding adapter", () => {
    it("should have onboarding defined", () => {
      expect(cursorAgentPlugin.onboarding).toBeDefined();
    });
  });
});
