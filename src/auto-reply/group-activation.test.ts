import { describe, expect, it } from "vitest";

import { normalizeGroupActivation, parseActivationCommand } from "./group-activation.js";

describe("normalizeGroupActivation", () => {
  it("returns 'mention' for 'mention'", () => {
    expect(normalizeGroupActivation("mention")).toBe("mention");
  });

  it("returns 'always' for 'always'", () => {
    expect(normalizeGroupActivation("always")).toBe("always");
  });

  it("returns 'replies' for 'replies'", () => {
    expect(normalizeGroupActivation("replies")).toBe("replies");
  });

  it("returns 'mention+replies' for 'mention+replies'", () => {
    expect(normalizeGroupActivation("mention+replies")).toBe("mention+replies");
  });

  it("returns 'never' for 'never'", () => {
    expect(normalizeGroupActivation("never")).toBe("never");
  });

  it("handles case-insensitive input", () => {
    expect(normalizeGroupActivation("MENTION")).toBe("mention");
    expect(normalizeGroupActivation("Always")).toBe("always");
    expect(normalizeGroupActivation("REPLIES")).toBe("replies");
    expect(normalizeGroupActivation("MENTION+REPLIES")).toBe("mention+replies");
    expect(normalizeGroupActivation("NEVER")).toBe("never");
  });

  it("trims whitespace", () => {
    expect(normalizeGroupActivation("  mention  ")).toBe("mention");
    expect(normalizeGroupActivation("\treplies\n")).toBe("replies");
  });

  it("returns undefined for invalid values", () => {
    expect(normalizeGroupActivation("invalid")).toBeUndefined();
    expect(normalizeGroupActivation("")).toBeUndefined();
    expect(normalizeGroupActivation("on")).toBeUndefined();
    expect(normalizeGroupActivation("off")).toBeUndefined();
  });

  it("returns undefined for null/undefined", () => {
    expect(normalizeGroupActivation(null)).toBeUndefined();
    expect(normalizeGroupActivation(undefined)).toBeUndefined();
  });
});

describe("parseActivationCommand", () => {
  it("parses /activation mention", () => {
    const result = parseActivationCommand("/activation mention");
    expect(result.hasCommand).toBe(true);
    expect(result.mode).toBe("mention");
  });

  it("parses /activation always", () => {
    const result = parseActivationCommand("/activation always");
    expect(result.hasCommand).toBe(true);
    expect(result.mode).toBe("always");
  });

  it("parses /activation replies", () => {
    const result = parseActivationCommand("/activation replies");
    expect(result.hasCommand).toBe(true);
    expect(result.mode).toBe("replies");
  });

  it("parses /activation mention+replies", () => {
    const result = parseActivationCommand("/activation mention+replies");
    expect(result.hasCommand).toBe(true);
    expect(result.mode).toBe("mention+replies");
  });

  it("parses /activation never", () => {
    const result = parseActivationCommand("/activation never");
    expect(result.hasCommand).toBe(true);
    expect(result.mode).toBe("never");
  });

  it("returns hasCommand=true but undefined mode for bare /activation", () => {
    const result = parseActivationCommand("/activation");
    expect(result.hasCommand).toBe(true);
    expect(result.mode).toBeUndefined();
  });

  it("returns hasCommand=false for non-command text", () => {
    const result = parseActivationCommand("hello world");
    expect(result.hasCommand).toBe(false);
  });

  it("handles case-insensitive commands", () => {
    const result = parseActivationCommand("/ACTIVATION REPLIES");
    expect(result.hasCommand).toBe(true);
    expect(result.mode).toBe("replies");
  });
});
