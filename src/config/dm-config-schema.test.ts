import { describe, it, expect } from "vitest";
import { DmConfigSchema, DmRoleSchema } from "./zod-schema.core.js";

describe("DmRoleSchema", () => {
  it("accepts valid roles", () => {
    for (const role of ["owner", "elevated", "family", "limited", "default"]) {
      expect(DmRoleSchema.parse(role)).toBe(role);
    }
  });

  it("rejects invalid roles", () => {
    expect(() => DmRoleSchema.parse("admin")).toThrow();
    expect(() => DmRoleSchema.parse("")).toThrow();
    expect(() => DmRoleSchema.parse(123)).toThrow();
  });
});

describe("DmConfigSchema", () => {
  it("parses minimal config (empty)", () => {
    const result = DmConfigSchema.parse({});
    expect(result).toEqual({});
  });

  it("parses historyLimit only (backward compat)", () => {
    const result = DmConfigSchema.parse({ historyLimit: 50 });
    expect(result.historyLimit).toBe(50);
  });

  it("parses full config with all fields", () => {
    const input = {
      historyLimit: 20,
      role: "family",
      tools: {
        allow: ["message"],
        deny: ["exec", "browser"],
      },
      requireOwnerConfirmation: true,
      systemPromptSuffix: "This is a family member. Confirm before acting.",
    };
    const result = DmConfigSchema.parse(input);
    expect(result.role).toBe("family");
    expect(result.tools).toEqual({ allow: ["message"], deny: ["exec", "browser"] });
    expect(result.requireOwnerConfirmation).toBe(true);
    expect(result.systemPromptSuffix).toBe("This is a family member. Confirm before acting.");
  });

  it("parses owner role without optional fields", () => {
    const result = DmConfigSchema.parse({ role: "owner" });
    expect(result.role).toBe("owner");
    expect(result.requireOwnerConfirmation).toBeUndefined();
    expect(result.systemPromptSuffix).toBeUndefined();
  });

  it("rejects unknown fields (strict mode)", () => {
    expect(() => DmConfigSchema.parse({ role: "owner", unknownField: true })).toThrow();
  });

  it("rejects invalid role value", () => {
    expect(() => DmConfigSchema.parse({ role: "superadmin" })).toThrow();
  });

  it("rejects invalid tools structure", () => {
    expect(() => DmConfigSchema.parse({ tools: { allow: "not-an-array" } })).toThrow();
  });

  it("parses tools with alsoAllow", () => {
    const result = DmConfigSchema.parse({
      tools: { allow: ["jira"], alsoAllow: ["github"] },
    });
    expect(result.tools).toEqual({ allow: ["jira"], alsoAllow: ["github"] });
  });
});
