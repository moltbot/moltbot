import { describe, it, expect } from "vitest";
import { resolveDmUserConfig } from "./dm-user-config.js";
import type { OpenClawConfig } from "./config.js";

function makeConfig(dms: Record<string, any>, channel = "whatsapp"): OpenClawConfig {
  return {
    channels: {
      [channel]: { dms },
    },
  } as unknown as OpenClawConfig;
}

describe("resolveDmUserConfig", () => {
  it("returns undefined when no senderId provided", () => {
    const cfg = makeConfig({ "+1234": { role: "owner" } });
    expect(resolveDmUserConfig({ cfg, channel: "whatsapp", senderId: null })).toBeUndefined();
    expect(resolveDmUserConfig({ cfg, channel: "whatsapp", senderId: undefined })).toBeUndefined();
  });

  it("returns undefined when sender has no DM config", () => {
    const cfg = makeConfig({ "+1234": { role: "owner" } });
    expect(resolveDmUserConfig({ cfg, channel: "whatsapp", senderId: "+9999" })).toBeUndefined();
  });

  it("resolves owner role", () => {
    const cfg = makeConfig({ "+1234": { role: "owner" } });
    const result = resolveDmUserConfig({ cfg, channel: "whatsapp", senderId: "+1234" });
    expect(result).toEqual({
      role: "owner",
      tools: undefined,
      requireOwnerConfirmation: false,
      systemPromptSuffix: undefined,
      historyLimit: undefined,
    });
  });

  it("resolves family role with owner confirmation", () => {
    const cfg = makeConfig({
      "+5555": {
        role: "family",
        requireOwnerConfirmation: true,
        systemPromptSuffix: "This is mom. Always confirm with owner.",
      },
    });
    const result = resolveDmUserConfig({ cfg, channel: "whatsapp", senderId: "+5555" });
    expect(result).toEqual({
      role: "family",
      tools: undefined,
      requireOwnerConfirmation: true,
      systemPromptSuffix: "This is mom. Always confirm with owner.",
      historyLimit: undefined,
    });
  });

  it("resolves elevated role with tools", () => {
    const cfg = makeConfig({
      "+4444": {
        role: "elevated",
        tools: { allow: ["jira", "github"], deny: ["exec"] },
        systemPromptSuffix: "Co-founder. Can create Jira tasks.",
      },
    });
    const result = resolveDmUserConfig({ cfg, channel: "whatsapp", senderId: "+4444" });
    expect(result).toEqual({
      role: "elevated",
      tools: { allow: ["jira", "github"], deny: ["exec"] },
      requireOwnerConfirmation: false,
      systemPromptSuffix: "Co-founder. Can create Jira tasks.",
      historyLimit: undefined,
    });
  });

  it("defaults role to 'default' when not specified", () => {
    const cfg = makeConfig({ "+1234": { historyLimit: 10 } });
    const result = resolveDmUserConfig({ cfg, channel: "whatsapp", senderId: "+1234" });
    expect(result).toEqual({
      role: "default",
      tools: undefined,
      requireOwnerConfirmation: false,
      systemPromptSuffix: undefined,
      historyLimit: 10,
    });
  });

  it("returns undefined when channel config is missing", () => {
    const cfg = { channels: {} } as unknown as OpenClawConfig;
    expect(resolveDmUserConfig({ cfg, channel: "whatsapp", senderId: "+1234" })).toBeUndefined();
  });

  it("returns undefined when channels is missing entirely", () => {
    const cfg = {} as unknown as OpenClawConfig;
    expect(resolveDmUserConfig({ cfg, channel: "whatsapp", senderId: "+1234" })).toBeUndefined();
  });

  it("resolves from account-level dms when accountId provided", () => {
    const cfg = {
      channels: {
        whatsapp: {
          accounts: {
            myaccount: {
              dms: {
                "+1234": { role: "elevated", systemPromptSuffix: "account-level" },
              },
            },
          },
          dms: {
            "+1234": { role: "limited", systemPromptSuffix: "channel-level" },
          },
        },
      },
    } as unknown as OpenClawConfig;

    // Account-level takes priority
    const result = resolveDmUserConfig({
      cfg,
      channel: "whatsapp",
      senderId: "+1234",
      accountId: "myaccount",
    });
    expect(result?.role).toBe("elevated");
    expect(result?.systemPromptSuffix).toBe("account-level");
  });

  it("falls back to channel-level dms when accountId has no match", () => {
    const cfg = {
      channels: {
        whatsapp: {
          accounts: {
            other: {
              dms: { "+9999": { role: "owner" } },
            },
          },
          dms: {
            "+1234": { role: "family", systemPromptSuffix: "channel fallback" },
          },
        },
      },
    } as unknown as OpenClawConfig;

    const result = resolveDmUserConfig({
      cfg,
      channel: "whatsapp",
      senderId: "+1234",
      accountId: "nonexistent",
    });
    expect(result?.role).toBe("family");
    expect(result?.systemPromptSuffix).toBe("channel fallback");
  });
});
