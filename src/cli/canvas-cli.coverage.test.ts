import { Command } from "commander";
import { describe, expect, it, vi } from "vitest";

const callGateway = vi.fn(
  async (opts: { method?: string; params?: { command?: string } }) => {
    if (opts.method === "node.list") {
      return {
        nodes: [
          {
            nodeId: "mac-1",
            displayName: "Mac",
            platform: "macos",
            caps: ["canvas"],
            connected: true,
          },
        ],
      };
    }
    if (opts.method === "node.invoke") {
      if (opts.params?.command === "canvas.eval") {
        return { payload: { result: "ok" } };
      }
      return { ok: true };
    }
    return { ok: true };
  },
);

const randomIdempotencyKey = vi.fn(() => "rk_test");

const runtimeLogs: string[] = [];
const runtimeErrors: string[] = [];
const defaultRuntime = {
  log: (msg: string) => runtimeLogs.push(msg),
  error: (msg: string) => runtimeErrors.push(msg),
  exit: (code: number) => {
    throw new Error(`__exit__:${code}`);
  },
};

vi.mock("../gateway/call.js", () => ({
  callGateway: (opts: unknown) => callGateway(opts as { method?: string }),
  randomIdempotencyKey: () => randomIdempotencyKey(),
}));

vi.mock("../runtime.js", () => ({
  defaultRuntime,
}));

describe("canvas-cli coverage", () => {
  it("invokes canvas.present with placement and target", async () => {
    runtimeLogs.length = 0;
    runtimeErrors.length = 0;
    callGateway.mockClear();
    randomIdempotencyKey.mockClear();

    const { registerCanvasCli } = await import("./canvas-cli.js");
    const program = new Command();
    program.exitOverride();
    registerCanvasCli(program);

    await program.parseAsync(
      [
        "canvas",
        "present",
        "--node",
        "mac-1",
        "--target",
        "https://example.com",
        "--x",
        "10",
        "--y",
        "20",
        "--width",
        "800",
        "--height",
        "600",
      ],
      { from: "user" },
    );

    const invoke = callGateway.mock.calls.find(
      (call) => call[0]?.method === "node.invoke",
    )?.[0];

    expect(invoke).toBeTruthy();
    expect(invoke?.params?.command).toBe("canvas.present");
    expect(invoke?.params?.idempotencyKey).toBe("rk_test");
    expect(invoke?.params?.params).toEqual({
      url: "https://example.com",
      placement: { x: 10, y: 20, width: 800, height: 600 },
    });
  });

  it("prints canvas.eval result", async () => {
    runtimeLogs.length = 0;
    runtimeErrors.length = 0;
    callGateway.mockClear();

    const { registerCanvasCli } = await import("./canvas-cli.js");
    const program = new Command();
    program.exitOverride();
    registerCanvasCli(program);

    await program.parseAsync(["canvas", "eval", "1+1"], { from: "user" });

    expect(runtimeErrors).toHaveLength(0);
    expect(runtimeLogs.join("\n")).toContain("ok");
  });

  it("pushes A2UI text payload", async () => {
    runtimeLogs.length = 0;
    runtimeErrors.length = 0;
    callGateway.mockClear();

    const { registerCanvasCli } = await import("./canvas-cli.js");
    const program = new Command();
    program.exitOverride();
    registerCanvasCli(program);

    await program.parseAsync(
      ["canvas", "a2ui", "push", "--node", "mac-1", "--text", "Hello A2UI"],
      { from: "user" },
    );

    const invoke = callGateway.mock.calls.find(
      (call) => call[0]?.method === "node.invoke",
    )?.[0];

    expect(invoke?.params?.command).toBe("canvas.a2ui.pushJSONL");
    expect(invoke?.params?.params?.jsonl).toContain("Hello A2UI");
  });

  it("rejects invalid A2UI JSONL", async () => {
    runtimeLogs.length = 0;
    runtimeErrors.length = 0;
    callGateway.mockClear();

    vi.resetModules();
    vi.doMock("node:fs/promises", () => ({
      default: { readFile: vi.fn(async () => "{broken") },
    }));

    const { registerCanvasCli } = await import("./canvas-cli.js");
    const program = new Command();
    program.exitOverride();
    registerCanvasCli(program);

    await expect(
      program.parseAsync(
        [
          "canvas",
          "a2ui",
          "push",
          "--node",
          "mac-1",
          "--jsonl",
          "/tmp/a2ui.jsonl",
        ],
        { from: "user" },
      ),
    ).rejects.toThrow("__exit__:1");

    expect(runtimeErrors.join("\n")).toContain("Invalid A2UI JSONL");
  });
});
