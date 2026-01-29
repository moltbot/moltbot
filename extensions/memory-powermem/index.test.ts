/**
 * Memory (PowerMem) plugin tests.
 * Config parsing, plugin registration, and tool behavior with mocked fetch.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import { powerMemConfigSchema } from "./config.js";
import { default as memoryPlugin } from "./index.js";

describe("memory-powermem plugin", () => {
  test("plugin metadata", () => {
    expect(memoryPlugin.id).toBe("memory-powermem");
    expect(memoryPlugin.name).toBe("Memory (PowerMem)");
    expect(memoryPlugin.kind).toBe("memory");
    expect(memoryPlugin.configSchema).toBeDefined();
    expect(memoryPlugin.register).toBeInstanceOf(Function);
  });

  test("config schema parses valid config", () => {
    const config = powerMemConfigSchema.parse({
      baseUrl: "http://localhost:8000",
      autoCapture: true,
      autoRecall: true,
      inferOnAdd: true,
    });
    expect(config.baseUrl).toBe("http://localhost:8000");
    expect(config.autoCapture).toBe(true);
    expect(config.autoRecall).toBe(true);
    expect(config.inferOnAdd).toBe(true);
  });

  test("config schema strips trailing slash from baseUrl", () => {
    const config = powerMemConfigSchema.parse({
      baseUrl: "http://localhost:8000/",
    });
    expect(config.baseUrl).toBe("http://localhost:8000");
  });

  test("config schema rejects missing baseUrl", () => {
    expect(() => powerMemConfigSchema.parse({})).toThrow("baseUrl is required");
    expect(() => powerMemConfigSchema.parse({ baseUrl: "" })).toThrow(
      "baseUrl is required",
    );
  });

  test("config schema resolves env vars", () => {
    process.env.TEST_POWERMEM_URL = "http://127.0.0.1:8000";
    const config = powerMemConfigSchema.parse({
      baseUrl: "${TEST_POWERMEM_URL}",
    });
    expect(config.baseUrl).toBe("http://127.0.0.1:8000");
    delete process.env.TEST_POWERMEM_URL;
  });

  test("config schema uses default user/agent when not set", () => {
    const config = powerMemConfigSchema.parse({ baseUrl: "http://localhost:8000" });
    expect(config.userId).toBeUndefined();
    expect(config.agentId).toBeUndefined();
  });

  test("plugin registers tools, CLI, service, and hooks", async () => {
    const registeredTools: { tool: unknown; opts: unknown }[] = [];
    const registeredClis: { registrar: unknown; opts: unknown }[] = [];
    const registeredServices: unknown[] = [];
    const registeredHooks: Record<string, unknown[]> = {};

    const mockApi = {
      pluginConfig: {
        baseUrl: "http://localhost:8000",
        autoCapture: false,
        autoRecall: false,
      },
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      },
      registerTool: (tool: unknown, opts: unknown) => {
        registeredTools.push({ tool, opts });
      },
      registerCli: (registrar: unknown, opts: unknown) => {
        registeredClis.push({ registrar, opts });
      },
      registerService: (service: unknown) => {
        registeredServices.push(service);
      },
      on: (hookName: string, handler: unknown) => {
        if (!registeredHooks[hookName]) registeredHooks[hookName] = [];
        registeredHooks[hookName].push(handler);
      },
      resolvePath: (p: string) => p,
    };

    await memoryPlugin.register(mockApi as never);

    expect(registeredTools.length).toBe(3);
    expect(registeredTools.map((t) => (t.opts as { name?: string })?.name)).toContain(
      "memory_recall",
    );
    expect(registeredTools.map((t) => (t.opts as { name?: string })?.name)).toContain(
      "memory_store",
    );
    expect(registeredTools.map((t) => (t.opts as { name?: string })?.name)).toContain(
      "memory_forget",
    );
    expect(registeredClis.length).toBe(1);
    expect(registeredServices.length).toBe(1);
  });

  test("memory_recall returns error when fetch fails", async () => {
    const registeredTools: { tool: { execute: (id: string, params: unknown) => Promise<unknown> }; opts: unknown }[] = [];
    const mockApi = {
      pluginConfig: { baseUrl: "http://localhost:8000" },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      registerTool: (tool: unknown, opts: unknown) => {
        registeredTools.push({ tool: tool as { execute: (id: string, params: unknown) => Promise<unknown> }, opts });
      },
      registerCli: () => {},
      registerService: () => {},
      on: () => {},
      resolvePath: (p: string) => p,
    };
    await memoryPlugin.register(mockApi as never);

    const recallTool = registeredTools.find(
      (t) => (t.opts as { name?: string })?.name === "memory_recall",
    )?.tool;
    expect(recallTool).toBeDefined();

    // No fetch mock: will fail (or hit real localhost). Use mock to force error.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network error"));

    const result = await recallTool!.execute("call-1", {
      query: "user preferences",
      limit: 5,
    });

    expect(result).toBeDefined();
    const content = (result as { content?: { text?: string }[] })?.content;
    expect(Array.isArray(content)).toBe(true);
    expect((content as { text: string }[])?.[0]?.text).toContain("Memory search failed");

    globalThis.fetch = originalFetch;
  });

  test("memory_recall returns memories when fetch returns results", async () => {
    const registeredTools: { tool: { execute: (id: string, params: unknown) => Promise<unknown> }; opts: unknown }[] = [];
    const mockApi = {
      pluginConfig: { baseUrl: "http://localhost:8000" },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
      registerTool: (tool: unknown, opts: unknown) => {
        registeredTools.push({ tool: tool as { execute: (id: string, params: unknown) => Promise<unknown> }, opts });
      },
      registerCli: () => {},
      registerService: () => {},
      on: () => {},
      resolvePath: (p: string) => p,
    };
    await memoryPlugin.register(mockApi as never);

    const recallTool = registeredTools.find(
      (t) => (t.opts as { name?: string })?.name === "memory_recall",
    )?.tool;
    expect(recallTool).toBeDefined();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      text: () =>
        Promise.resolve(
          JSON.stringify({
            success: true,
            data: {
              results: [
                { memory_id: 1, content: "User likes coffee", score: 0.95 },
              ],
            },
          }),
        ),
    } as Response);

    const result = await recallTool!.execute("call-1", {
      query: "coffee",
      limit: 5,
    });

    expect((result as { details?: { count: number } })?.details?.count).toBe(1);
    expect((result as { details?: { memories?: { text: string }[] } })?.details?.memories?.[0]?.text).toBe(
      "User likes coffee",
    );

    globalThis.fetch = originalFetch;
  });
});
