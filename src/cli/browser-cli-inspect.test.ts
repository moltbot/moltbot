import { afterEach, describe, expect, it, vi } from "vitest";
import { Command } from "commander";

const gatewayMocks = vi.hoisted(() => ({
  callGatewayFromCli: vi.fn(async () => ({
    ok: true,
    format: "ai",
    targetId: "t1",
    url: "https://example.com",
    snapshot: "ok",
  })),
}));

vi.mock("./gateway-rpc.js", () => ({
  callGatewayFromCli: gatewayMocks.callGatewayFromCli,
}));

const configMocks = vi.hoisted(() => ({
  loadConfig: vi.fn(() => ({ browser: {} })),
}));
vi.mock("../config/config.js", () => configMocks);

const runtime = {
  log: vi.fn(),
  error: vi.fn(),
  exit: vi.fn(),
};
vi.mock("../runtime.js", () => ({
  defaultRuntime: runtime,
}));

describe("browser cli snapshot defaults", () => {
  afterEach(() => {
    vi.clearAllMocks();
    configMocks.loadConfig.mockReturnValue({ browser: {} });
  });

  it("uses config snapshot defaults when mode is not provided", async () => {
    configMocks.loadConfig.mockReturnValue({
      browser: { snapshotDefaults: { mode: "efficient" } },
    });

    const { registerBrowserInspectCommands } = await import("./browser-cli-inspect.js");
    const program = new Command();
    const browser = program.command("browser").option("--json", false);
    registerBrowserInspectCommands(browser, () => ({}));

    await program.parseAsync(["browser", "snapshot"], { from: "user" });

    expect(gatewayMocks.callGatewayFromCli).toHaveBeenCalledWith(
      "browser.request",
      expect.any(Object),
      expect.objectContaining({
        method: "GET",
        path: "/snapshot",
        query: expect.objectContaining({
          format: "ai",
          mode: "efficient",
        }),
      }),
      expect.any(Object),
    );
  });

  it("does not apply config snapshot defaults to aria snapshots", async () => {
    configMocks.loadConfig.mockReturnValue({
      browser: { snapshotDefaults: { mode: "efficient" } },
    });

    gatewayMocks.callGatewayFromCli.mockResolvedValueOnce({
      ok: true,
      format: "aria",
      targetId: "t1",
      url: "https://example.com",
      nodes: [],
    });

    const { registerBrowserInspectCommands } = await import("./browser-cli-inspect.js");
    const program = new Command();
    const browser = program.command("browser").option("--json", false);
    registerBrowserInspectCommands(browser, () => ({}));

    await program.parseAsync(["browser", "snapshot", "--format", "aria"], { from: "user" });

    expect(gatewayMocks.callGatewayFromCli).toHaveBeenCalled();
    const [, , params] = gatewayMocks.callGatewayFromCli.mock.calls.at(-1) ?? [];
    expect(params).toBeTruthy();
    expect((params as { query?: Record<string, string> }).query?.mode).toBeUndefined();
  });
});
