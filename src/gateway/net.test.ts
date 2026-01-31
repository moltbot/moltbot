import { describe, expect, it } from "vitest";

import { isTrustedProxyAddress, resolveGatewayListenHosts } from "./net.js";

describe("resolveGatewayListenHosts", () => {
  it("returns the input host when not loopback", async () => {
    const hosts = await resolveGatewayListenHosts("0.0.0.0", {
      canBindToHost: async () => {
        throw new Error("should not be called");
      },
    });
    expect(hosts).toEqual(["0.0.0.0"]);
  });

  it("adds ::1 when IPv6 loopback is available", async () => {
    const hosts = await resolveGatewayListenHosts("127.0.0.1", {
      canBindToHost: async () => true,
    });
    expect(hosts).toEqual(["127.0.0.1", "::1"]);
  });

  it("keeps only IPv4 loopback when IPv6 is unavailable", async () => {
    const hosts = await resolveGatewayListenHosts("127.0.0.1", {
      canBindToHost: async () => false,
    });
    expect(hosts).toEqual(["127.0.0.1"]);
  });
});

describe("isTrustedProxyAddress", () => {
  it("matches exact IP", () => {
    expect(isTrustedProxyAddress("172.19.0.2", ["172.19.0.2"])).toBe(true);
  });

  it("rejects non-matching exact IP", () => {
    expect(isTrustedProxyAddress("172.19.0.3", ["172.19.0.2"])).toBe(false);
  });

  it("matches CIDR range", () => {
    expect(isTrustedProxyAddress("172.19.0.2", ["172.16.0.0/12"])).toBe(true);
    expect(isTrustedProxyAddress("172.24.0.4", ["172.16.0.0/12"])).toBe(true);
    expect(isTrustedProxyAddress("172.31.255.255", ["172.16.0.0/12"])).toBe(true);
  });

  it("rejects IP outside CIDR range", () => {
    expect(isTrustedProxyAddress("172.32.0.1", ["172.16.0.0/12"])).toBe(false);
    expect(isTrustedProxyAddress("10.0.0.1", ["172.16.0.0/12"])).toBe(false);
  });

  it("handles IPv4-mapped IPv6 with CIDR", () => {
    expect(isTrustedProxyAddress("::ffff:172.19.0.2", ["172.16.0.0/12"])).toBe(true);
  });

  it("returns false for empty/undefined inputs", () => {
    expect(isTrustedProxyAddress(undefined, ["172.16.0.0/12"])).toBe(false);
    expect(isTrustedProxyAddress("172.19.0.2", undefined)).toBe(false);
    expect(isTrustedProxyAddress("172.19.0.2", [])).toBe(false);
  });
});
