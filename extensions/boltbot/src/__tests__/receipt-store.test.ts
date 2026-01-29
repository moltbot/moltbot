import { describe, it, expect, beforeEach } from "vitest";
import { LocalReceiptStore } from "../stores/local.js";
import { hashData, type ActionReceipt } from "../receipt-store.js";

function makeReceipt(overrides: Partial<ActionReceipt> = {}): ActionReceipt {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    sessionKey: "test-session",
    tier: "medium",
    toolName: "message",
    argumentsHash: hashData({ to: "user" }),
    resultHash: hashData({ ok: true }),
    success: true,
    durationMs: 100,
    anomalies: [],
    ...overrides,
  };
}

describe("LocalReceiptStore", () => {
  let store: LocalReceiptStore;

  beforeEach(() => {
    store = new LocalReceiptStore(":memory:");
  });

  it("put and get roundtrip", async () => {
    const receipt = makeReceipt();
    await store.put(receipt);
    const retrieved = await store.get(receipt.id);
    expect(retrieved).toEqual(receipt);
  });

  it("get returns null for nonexistent id", async () => {
    const result = await store.get("nonexistent-id");
    expect(result).toBeNull();
  });

  it("list returns receipts in reverse chronological order", async () => {
    const r1 = makeReceipt({ timestamp: "2026-01-01T00:00:00.000Z" });
    const r2 = makeReceipt({ timestamp: "2026-01-02T00:00:00.000Z" });
    const r3 = makeReceipt({ timestamp: "2026-01-03T00:00:00.000Z" });
    await store.put(r1);
    await store.put(r2);
    await store.put(r3);

    const list = await store.list({ limit: 10, offset: 0 });
    expect(list).toHaveLength(3);
    expect(list[0].id).toBe(r3.id);
    expect(list[1].id).toBe(r2.id);
    expect(list[2].id).toBe(r1.id);
  });

  it("stats returns correct counts", async () => {
    await store.put(makeReceipt({ tier: "high" }));
    await store.put(makeReceipt({ tier: "high" }));
    await store.put(makeReceipt({ tier: "medium" }));
    await store.put(makeReceipt({ tier: "medium" }));
    await store.put(makeReceipt({ tier: "medium" }));

    const stats = await store.stats();
    expect(stats.total).toBe(5);
    expect(stats.byTier).toEqual({ high: 2, medium: 3 });
  });

  it("stats counts anomalies correctly", async () => {
    await store.put(makeReceipt({ anomalies: ["unexpected_recipient"] }));
    await store.put(makeReceipt({ anomalies: [] }));
    await store.put(makeReceipt({ anomalies: ["unauthorized_outbound", "process_management"] }));

    const stats = await store.stats();
    expect(stats.anomalyCount).toBe(2);
  });

  it("uses sessionKey field", async () => {
    const receipt = makeReceipt({ sessionKey: "my-session-key" });
    await store.put(receipt);
    const retrieved = await store.get(receipt.id);
    expect(retrieved?.sessionKey).toBe("my-session-key");
  });
});

describe("hashData", () => {
  it("produces consistent SHA-256 hex", () => {
    const h1 = hashData({ foo: "bar" });
    const h2 = hashData({ foo: "bar" });
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles null/undefined", () => {
    const h = hashData(null);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces the same hash regardless of key order", () => {
    const h1 = hashData({ a: 1, b: 2 });
    const h2 = hashData({ b: 2, a: 1 });
    expect(h1).toBe(h2);
  });
});
