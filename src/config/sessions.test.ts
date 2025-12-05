import { describe, expect, it } from "vitest";

import { deriveSessionKey } from "./sessions.js";

describe("sessions", () => {
  it("returns normalized per-sender key", async () => {
    expect(await deriveSessionKey("per-sender", { From: "whatsapp:+1555" })).toBe(
      "+1555",
    );
  });

  it("falls back to unknown when sender missing", async () => {
    expect(await deriveSessionKey("per-sender", {})).toBe("unknown");
  });

  it("global scope returns global", async () => {
    expect(await deriveSessionKey("global", { From: "+1" })).toBe("global");
  });

  it("keeps group chats distinct", async () => {
    expect(await deriveSessionKey("per-sender", { From: "12345-678@g.us" })).toBe(
      "group:12345-678@g.us",
    );
  });
});
