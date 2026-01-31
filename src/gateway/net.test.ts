import { describe, expect, it } from "vitest";

import {
  resolveGatewayListenHosts,
  isIpv4InCidr,
  isValidCidr,
  isIpInAutoApproveAllowlist,
} from "./net.js";

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

describe("isIpv4InCidr", () => {
  it("returns true for IP in /8 CIDR range", () => {
    expect(isIpv4InCidr("10.0.1.5", "10.0.0.0/8")).toBe(true);
    expect(isIpv4InCidr("10.255.255.255", "10.0.0.0/8")).toBe(true);
  });

  it("returns false for IP outside /8 CIDR range", () => {
    expect(isIpv4InCidr("11.0.0.1", "10.0.0.0/8")).toBe(false);
    expect(isIpv4InCidr("192.168.1.1", "10.0.0.0/8")).toBe(false);
  });

  it("returns true for IP in /16 CIDR range", () => {
    expect(isIpv4InCidr("172.16.0.1", "172.16.0.0/12")).toBe(true);
    expect(isIpv4InCidr("172.31.255.255", "172.16.0.0/12")).toBe(true);
  });

  it("returns false for IP outside /16 CIDR range", () => {
    expect(isIpv4InCidr("172.32.0.1", "172.16.0.0/12")).toBe(false);
  });

  it("returns true for IP in /24 CIDR range", () => {
    expect(isIpv4InCidr("192.168.1.1", "192.168.1.0/24")).toBe(true);
    expect(isIpv4InCidr("192.168.1.254", "192.168.1.0/24")).toBe(true);
  });

  it("returns false for IP outside /24 CIDR range", () => {
    expect(isIpv4InCidr("192.168.2.1", "192.168.1.0/24")).toBe(false);
  });

  it("returns true for /32 exact match", () => {
    expect(isIpv4InCidr("192.168.1.1", "192.168.1.1/32")).toBe(true);
    expect(isIpv4InCidr("192.168.1.2", "192.168.1.1/32")).toBe(false);
  });

  it("returns true for /0 (any IP)", () => {
    expect(isIpv4InCidr("1.2.3.4", "0.0.0.0/0")).toBe(true);
    expect(isIpv4InCidr("255.255.255.255", "0.0.0.0/0")).toBe(true);
  });

  it("returns false for invalid CIDR", () => {
    expect(isIpv4InCidr("10.0.0.1", "invalid")).toBe(false);
    expect(isIpv4InCidr("10.0.0.1", "10.0.0.0")).toBe(false);
  });

  it("returns false for invalid IPv4 input", () => {
    expect(isIpv4InCidr("999.0.0.1", "10.0.0.0/8")).toBe(false);
    expect(isIpv4InCidr("10.0.0.1", "999.0.0.0/8")).toBe(false);
    expect(isIpv4InCidr("10.0.0.256", "10.0.0.0/8")).toBe(false);
  });
});

describe("isValidCidr", () => {
  it("returns true for valid CIDR notation", () => {
    expect(isValidCidr("10.0.0.0/8")).toBe(true);
    expect(isValidCidr("172.16.0.0/12")).toBe(true);
    expect(isValidCidr("192.168.1.0/24")).toBe(true);
    expect(isValidCidr("192.168.1.1/32")).toBe(true);
    expect(isValidCidr("0.0.0.0/0")).toBe(true);
  });

  it("returns false for invalid CIDR notation", () => {
    expect(isValidCidr("10.0.0.0")).toBe(false);
    expect(isValidCidr("10.0.0.0/")).toBe(false);
    expect(isValidCidr("10.0.0.0/33")).toBe(false);
    expect(isValidCidr("10.0.0.0/-1")).toBe(false);
    expect(isValidCidr("10.0.0/8")).toBe(false);
    expect(isValidCidr("256.0.0.0/8")).toBe(false);
    expect(isValidCidr("invalid")).toBe(false);
    expect(isValidCidr("")).toBe(false);
  });
});

describe("isIpInAutoApproveAllowlist", () => {
  it("allows localhost when no allowlist is provided", () => {
    expect(isIpInAutoApproveAllowlist("127.0.0.1", undefined)).toBe(true);
    expect(isIpInAutoApproveAllowlist("127.0.0.1", [])).toBe(true);
    expect(isIpInAutoApproveAllowlist("::1", undefined)).toBe(true);
  });

  it("denies non-localhost when no allowlist is provided", () => {
    expect(isIpInAutoApproveAllowlist("10.0.0.1", undefined)).toBe(false);
    expect(isIpInAutoApproveAllowlist("192.168.1.1", [])).toBe(false);
  });

  it("allows IP in CIDR allowlist", () => {
    const allowlist = ["10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];
    expect(isIpInAutoApproveAllowlist("10.0.1.5", allowlist)).toBe(true);
    expect(isIpInAutoApproveAllowlist("172.20.0.1", allowlist)).toBe(true);
    expect(isIpInAutoApproveAllowlist("192.168.100.50", allowlist)).toBe(true);
  });

  it("denies IP outside CIDR allowlist", () => {
    const allowlist = ["10.0.0.0/8"];
    expect(isIpInAutoApproveAllowlist("192.168.1.1", allowlist)).toBe(false);
    expect(isIpInAutoApproveAllowlist("8.8.8.8", allowlist)).toBe(false);
  });

  it("handles IPv4-mapped IPv6 addresses", () => {
    const allowlist = ["10.0.0.0/8"];
    expect(isIpInAutoApproveAllowlist("::ffff:10.0.1.5", allowlist)).toBe(true);
    expect(isIpInAutoApproveAllowlist("::ffff:192.168.1.1", allowlist)).toBe(false);
  });

  it("returns false for undefined/empty IP", () => {
    expect(isIpInAutoApproveAllowlist(undefined, ["10.0.0.0/8"])).toBe(false);
    expect(isIpInAutoApproveAllowlist("", ["10.0.0.0/8"])).toBe(false);
  });

  it("handles explicit localhost entries in allowlist", () => {
    expect(isIpInAutoApproveAllowlist("127.0.0.1", ["127.0.0.1"])).toBe(true);
    expect(isIpInAutoApproveAllowlist("::1", ["::1"])).toBe(true);
    expect(isIpInAutoApproveAllowlist("127.0.0.1", ["localhost"])).toBe(true);
  });
});
