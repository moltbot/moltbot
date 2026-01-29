import { describe, expect, it } from "vitest";
import { applyPluginAutoEnable } from "./plugin-auto-enable.js";

describe("applyPluginAutoEnable", () => {
  it("enables configured channel plugins and updates allowlist", () => {
    const result = applyPluginAutoEnable({
      config: {
        channels: { slack: { botToken: "x" } },
        plugins: { allow: ["telegram"] },
      },
      env: {},
    });

    // Built-in channels (slack) are enabled via channels.<id>.enabled, not plugins.entries.
    expect((result.config.channels as Record<string, unknown>)?.slack).toMatchObject({
      enabled: true,
    });
    // Built-in channels don't need plugins.allow entry.
    expect(result.config.plugins?.allow).toEqual(["telegram"]);
    expect(result.changes.join("\n")).toContain("Slack configured, not enabled yet.");
  });

  it("respects explicit disable", () => {
    const result = applyPluginAutoEnable({
      config: {
        channels: { slack: { botToken: "x", enabled: false } },
      },
      env: {},
    });

    // Built-in channels check enabled in channels.<id>.enabled.
    expect((result.config.channels as Record<string, unknown>)?.slack).toMatchObject({
      enabled: false,
    });
    expect(result.changes).toEqual([]);
  });

  it("enables provider auth plugins when profiles exist", () => {
    const result = applyPluginAutoEnable({
      config: {
        auth: {
          profiles: {
            "google-antigravity:default": {
              provider: "google-antigravity",
              mode: "oauth",
            },
          },
        },
      },
      env: {},
    });

    expect(result.config.plugins?.entries?.["google-antigravity-auth"]?.enabled).toBe(true);
  });

  it("skips when plugins are globally disabled", () => {
    const result = applyPluginAutoEnable({
      config: {
        channels: { slack: { botToken: "x" } },
        plugins: { enabled: false },
      },
      env: {},
    });

    expect(result.config.plugins?.entries?.slack?.enabled).toBeUndefined();
    expect(result.changes).toEqual([]);
  });

  describe("preferOver channel prioritization", () => {
    it("prefers bluebubbles: skips imessage auto-enable when both are configured", () => {
      const result = applyPluginAutoEnable({
        config: {
          channels: {
            bluebubbles: { serverUrl: "http://localhost:1234", password: "x" },
            imessage: { cliPath: "/usr/local/bin/imsg" },
          },
        },
        env: {},
      });

      // bluebubbles is a plugin channel, so it goes to plugins.entries.
      expect(result.config.plugins?.entries?.bluebubbles?.enabled).toBe(true);
      // imessage is a built-in channel, but it's skipped due to preferOver.
      expect((result.config.channels as Record<string, unknown>)?.imessage).not.toMatchObject({
        enabled: true,
      });
      expect(result.changes.join("\n")).toContain("bluebubbles configured, not enabled yet.");
      expect(result.changes.join("\n")).not.toContain("iMessage configured, not enabled yet.");
    });

    it("keeps imessage enabled if already explicitly enabled (non-destructive)", () => {
      const result = applyPluginAutoEnable({
        config: {
          channels: {
            bluebubbles: { serverUrl: "http://localhost:1234", password: "x" },
            imessage: { cliPath: "/usr/local/bin/imsg", enabled: true },
          },
        },
        env: {},
      });

      expect(result.config.plugins?.entries?.bluebubbles?.enabled).toBe(true);
      // imessage was already enabled in channels, stays enabled.
      expect((result.config.channels as Record<string, unknown>)?.imessage).toMatchObject({
        enabled: true,
      });
    });

    it("allows imessage auto-enable when bluebubbles is explicitly disabled", () => {
      const result = applyPluginAutoEnable({
        config: {
          channels: {
            bluebubbles: { serverUrl: "http://localhost:1234", password: "x" },
            imessage: { cliPath: "/usr/local/bin/imsg" },
          },
          plugins: { entries: { bluebubbles: { enabled: false } } },
        },
        env: {},
      });

      expect(result.config.plugins?.entries?.bluebubbles?.enabled).toBe(false);
      // imessage is a built-in channel, so it goes to channels.imessage.enabled.
      expect((result.config.channels as Record<string, unknown>)?.imessage).toMatchObject({
        enabled: true,
      });
      expect(result.changes.join("\n")).toContain("iMessage configured, not enabled yet.");
    });

    it("allows imessage auto-enable when bluebubbles is in deny list", () => {
      const result = applyPluginAutoEnable({
        config: {
          channels: {
            bluebubbles: { serverUrl: "http://localhost:1234", password: "x" },
            imessage: { cliPath: "/usr/local/bin/imsg" },
          },
          plugins: { deny: ["bluebubbles"] },
        },
        env: {},
      });

      expect(result.config.plugins?.entries?.bluebubbles?.enabled).toBeUndefined();
      // imessage is a built-in channel, so it goes to channels.imessage.enabled.
      expect((result.config.channels as Record<string, unknown>)?.imessage).toMatchObject({
        enabled: true,
      });
    });

    it("enables imessage normally when only imessage is configured", () => {
      const result = applyPluginAutoEnable({
        config: {
          channels: { imessage: { cliPath: "/usr/local/bin/imsg" } },
        },
        env: {},
      });

      // imessage is a built-in channel, so it goes to channels.imessage.enabled.
      expect((result.config.channels as Record<string, unknown>)?.imessage).toMatchObject({
        enabled: true,
      });
      expect(result.changes.join("\n")).toContain("iMessage configured, not enabled yet.");
    });
  });
});
