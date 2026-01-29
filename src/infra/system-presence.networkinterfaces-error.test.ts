import { describe, expect, it, vi } from "vitest";

const realOs = await vi.importActual<typeof import("node:os")>("node:os");

vi.mock("node:os", () => {
  const hostname = () => "moltbot-test-host";
  const platform = () => "linux";
  const networkInterfaces = () => {
    throw new Error("uv_interface_addresses returned Unknown system error 1");
  };
  return {
    ...realOs,
    default: {
      ...realOs,
      hostname,
      platform,
      networkInterfaces,
    },
    hostname,
    platform,
    networkInterfaces,
  };
});

describe("system-presence", () => {
  it("does not crash when os.networkInterfaces throws", async () => {
    vi.resetModules();
    const { listSystemPresence } = await import("./system-presence.js");
    const entries = listSystemPresence();
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((entry) => entry.host === "moltbot-test-host")).toBe(true);
  });
});
