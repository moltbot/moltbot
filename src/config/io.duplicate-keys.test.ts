import { describe, expect, it } from "vitest";

import { detectDuplicateKeys } from "./io.js";

describe("detectDuplicateKeys", () => {
  it("detects duplicate keys in top-level object", () => {
    const raw = `{ key: "first", key: "second" }`;
    const warnings = detectDuplicateKeys(raw);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe("key");
  });

  it("detects duplicate keys in nested object", () => {
    const raw = `{ outer: { inner: 1, inner: 2 } }`;
    const warnings = detectDuplicateKeys(raw);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe("outer.inner");
  });

  it("returns empty array when no duplicates", () => {
    const raw = `{ a: 1, b: 2, c: 3 }`;
    const warnings = detectDuplicateKeys(raw);
    expect(warnings).toHaveLength(0);
  });

  it("detects duplicates in top-level array with nested objects", () => {
    const raw = `[{ key: "first", key: "duplicate" }]`;
    const warnings = detectDuplicateKeys(raw);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe("key");
  });

  it("detects duplicates in multiple nested objects within array", () => {
    const raw = `[
      { a: 1 },
      { b: 1, b: 2 },
      { c: { d: 1, d: 2 } }
    ]`;
    const warnings = detectDuplicateKeys(raw);
    expect(warnings).toHaveLength(2);
  });

  it("handles empty array", () => {
    const raw = `[]`;
    const warnings = detectDuplicateKeys(raw);
    expect(warnings).toHaveLength(0);
  });

  it("handles empty object", () => {
    const raw = `{}`;
    const warnings = detectDuplicateKeys(raw);
    expect(warnings).toHaveLength(0);
  });

  it("handles unterminated block comment at EOF", () => {
    const raw = `{ a: 1 /* unterminated`;
    const warnings = detectDuplicateKeys(raw);
    expect(warnings).toHaveLength(0); // should not crash
  });

  it("handles unterminated string at EOF", () => {
    const raw = `{ a: "unterminated`;
    const warnings = detectDuplicateKeys(raw);
    expect(warnings).toHaveLength(0); // should not crash
  });

  it("handles trailing slash at EOF", () => {
    const raw = `{ a: 1 } /`;
    const warnings = detectDuplicateKeys(raw);
    expect(warnings).toHaveLength(0); // should not crash
  });

  it("detects duplicates after comments", () => {
    const raw = `{
      // comment
      key: 1,
      /* block */ key: 2
    }`;
    const warnings = detectDuplicateKeys(raw);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].path).toBe("key");
  });
});
