/**
 * PowerMem HTTP client tests (mocked fetch).
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import { PowerMemClient } from "./client.js";

describe("PowerMemClient", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  test("health returns status", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({ success: true, data: { status: "healthy" } }),
        ),
    } as Response);

    const client = new PowerMemClient({
      baseUrl: "http://localhost:8000",
      userId: "u1",
      agentId: "a1",
    });
    const h = await client.health();
    expect(h.status).toBe("healthy");
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toContain(
      "/api/v1/system/health",
    );

    globalThis.fetch = originalFetch;
  });

  test("search returns results", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            data: {
              results: [
                { memory_id: 1, content: "User likes tea", score: 0.9 },
              ],
            },
          }),
        ),
    } as Response);

    const client = new PowerMemClient({
      baseUrl: "http://localhost:8000",
      userId: "u1",
      agentId: "a1",
    });
    const results = await client.search("tea", 5);
    expect(results).toHaveLength(1);
    expect(results[0].content).toBe("User likes tea");
    expect(results[0].memory_id).toBe(1);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("/api/v1/memories/search");
    expect(call[1]?.method).toBe("POST");
    const body = JSON.parse((call[1]?.body as string) ?? "{}");
    expect(body.query).toBe("tea");
    expect(body.limit).toBe(5);
    expect(body.user_id).toBe("u1");
    expect(body.agent_id).toBe("a1");

    globalThis.fetch = originalFetch;
  });

  test("add sends content and infer", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            data: [
              { memory_id: 100, content: "User likes coffee", user_id: "u1", agent_id: "a1" },
            ],
          }),
        ),
    } as Response);

    const client = new PowerMemClient({
      baseUrl: "http://localhost:8000",
      userId: "u1",
      agentId: "a1",
    });
    const created = await client.add("User likes coffee", { infer: true });
    expect(created).toHaveLength(1);
    expect(created[0].memory_id).toBe(100);
    expect(created[0].content).toBe("User likes coffee");

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse((call[1]?.body as string) ?? "{}");
    expect(body.content).toBe("User likes coffee");
    expect(body.infer).toBe(true);
    expect(body.user_id).toBe("u1");
    expect(body.agent_id).toBe("a1");

    globalThis.fetch = originalFetch;
  });

  test("delete calls correct URL with query params", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () => Promise.resolve(""),
    } as Response);

    const client = new PowerMemClient({
      baseUrl: "http://localhost:8000",
      userId: "u1",
      agentId: "a1",
    });
    await client.delete(12345);

    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toContain("/api/v1/memories/12345");
    expect(call[0]).toContain("user_id=u1");
    expect(call[0]).toContain("agent_id=a1");
    expect(call[1]?.method).toBe("DELETE");

    globalThis.fetch = originalFetch;
  });

  test("throws on API error", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: () => Promise.resolve(JSON.stringify({ message: "Invalid API key" })),
    } as Response);

    const client = new PowerMemClient({
      baseUrl: "http://localhost:8000",
      apiKey: "bad",
    });
    await expect(client.health()).rejects.toThrow("Invalid API key");

    globalThis.fetch = originalFetch;
  });
});
