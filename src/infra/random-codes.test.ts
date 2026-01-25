import { describe, expect, it } from "vitest";
import {
  generateHumanCode,
  generateSecureToken,
  generateTempSuffix,
  generateUUID,
} from "./random-codes.js";

const HUMAN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

describe("random code helpers", () => {
  it("generates human-friendly codes with the default length", () => {
    const code = generateHumanCode();
    expect(code).toHaveLength(8);
  });

  it("generates human-friendly codes with a custom length", () => {
    const code = generateHumanCode(16);
    expect(code).toHaveLength(16);
  });

  it("generates human-friendly codes from the expected alphabet", () => {
    const code = generateHumanCode(64);
    for (const char of code) {
      expect(HUMAN_CODE_ALPHABET).toContain(char);
    }
    expect(code).not.toMatch(/[01IO]/);
  });

  it("returns an empty human code when length is zero", () => {
    expect(generateHumanCode(0)).toBe("");
  });

  it("generates secure tokens as base64url", () => {
    const token = generateSecureToken();
    expect(token).toHaveLength(32);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toMatch(/[+=\/]/);
  });

  it("generates UUIDs", () => {
    const uuid = generateUUID();
    expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("generates temp suffixes with timestamp and random hex", () => {
    const suffix = generateTempSuffix();
    const match = /^([0-9]+)\.([0-9a-f]{8})$/.exec(suffix);
    expect(match).not.toBeNull();
    const timestamp = match ? Number(match[1]) : 0;
    expect(timestamp).toBeGreaterThan(0);
  });
});
