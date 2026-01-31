/**
 * Tests for Cursor Agent configuration.
 */

import { describe, it, expect } from "vitest";
import type { OpenClawConfig } from "openclaw/plugin-sdk";
import {
  getCursorAgentConfig,
  listAccountIds,
  getAccountConfig,
  isAccountConfigured,
  DEFAULT_ACCOUNT_ID,
} from "./config.js";

describe("getCursorAgentConfig", () => {
  it("should return null for empty config", () => {
    const cfg = {} as OpenClawConfig;
    expect(getCursorAgentConfig(cfg)).toBeNull();
  });

  it("should return null for missing cursorAgent section", () => {
    const cfg = { channels: {} } as OpenClawConfig;
    expect(getCursorAgentConfig(cfg)).toBeNull();
  });

  it("should parse valid config", () => {
    const cfg = {
      channels: {
        cursorAgent: {
          accounts: {
            default: {
              apiKey: "test-api-key",
              enabled: true,
            },
          },
        },
      },
    } as OpenClawConfig;

    const result = getCursorAgentConfig(cfg);
    expect(result).not.toBeNull();
    expect(result?.accounts?.default?.apiKey).toBe("test-api-key");
  });
});

describe("listAccountIds", () => {
  it("should return empty array for missing config", () => {
    const cfg = {} as OpenClawConfig;
    expect(listAccountIds(cfg)).toEqual([]);
  });

  it("should return account IDs", () => {
    const cfg = {
      channels: {
        cursorAgent: {
          accounts: {
            default: { apiKey: "key1" },
            secondary: { apiKey: "key2" },
          },
        },
      },
    } as OpenClawConfig;

    const ids = listAccountIds(cfg);
    expect(ids).toContain("default");
    expect(ids).toContain("secondary");
    expect(ids).toHaveLength(2);
  });
});

describe("getAccountConfig", () => {
  it("should return null for missing account", () => {
    const cfg = {} as OpenClawConfig;
    expect(getAccountConfig(cfg, "default")).toBeNull();
  });

  it("should return default account when no ID specified", () => {
    const cfg = {
      channels: {
        cursorAgent: {
          accounts: {
            default: { apiKey: "default-key" },
          },
        },
      },
    } as OpenClawConfig;

    const account = getAccountConfig(cfg);
    expect(account?.apiKey).toBe("default-key");
  });

  it("should return specific account by ID", () => {
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

    const account = getAccountConfig(cfg, "work");
    expect(account?.apiKey).toBe("work-key");
    expect(account?.repository).toBe("https://github.com/work/repo");
  });
});

describe("isAccountConfigured", () => {
  it("should return false for null account", () => {
    expect(isAccountConfigured(null)).toBe(false);
  });

  it("should return false for missing API key", () => {
    expect(isAccountConfigured({ apiKey: "" })).toBe(false);
  });

  it("should return true for valid account", () => {
    expect(isAccountConfigured({ apiKey: "test-key" })).toBe(true);
  });
});

describe("DEFAULT_ACCOUNT_ID", () => {
  it("should be 'default'", () => {
    expect(DEFAULT_ACCOUNT_ID).toBe("default");
  });
});
