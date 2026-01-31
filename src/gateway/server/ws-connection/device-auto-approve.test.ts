import { describe, expect, it } from "vitest";

import type { GatewayDeviceAutoApproveMode } from "../../../config/types.gateway.js";

/**
 * Replicates the shouldAutoApprove logic from message-handler.ts for testing.
 * This must match the implementation in message-handler.ts exactly.
 */
function computeShouldAutoApprove(params: {
  isLocalClient: boolean;
  deviceAutoApprove: GatewayDeviceAutoApproveMode;
  authMethod: string;
}): boolean {
  const { isLocalClient, deviceAutoApprove, authMethod } = params;
  return isLocalClient || (deviceAutoApprove === "tailscale" && authMethod === "tailscale");
}

describe("device auto-approve logic", () => {
  describe("local client", () => {
    it("auto-approves local clients regardless of config", () => {
      expect(
        computeShouldAutoApprove({
          isLocalClient: true,
          deviceAutoApprove: "none",
          authMethod: "token",
        }),
      ).toBe(true);
    });

    it("auto-approves local clients even with tailscale config", () => {
      expect(
        computeShouldAutoApprove({
          isLocalClient: true,
          deviceAutoApprove: "tailscale",
          authMethod: "token",
        }),
      ).toBe(true);
    });
  });

  describe("config=none (default)", () => {
    it("does NOT auto-approve remote clients with token auth", () => {
      expect(
        computeShouldAutoApprove({
          isLocalClient: false,
          deviceAutoApprove: "none",
          authMethod: "token",
        }),
      ).toBe(false);
    });

    it("does NOT auto-approve remote clients with password auth", () => {
      expect(
        computeShouldAutoApprove({
          isLocalClient: false,
          deviceAutoApprove: "none",
          authMethod: "password",
        }),
      ).toBe(false);
    });

    it("does NOT auto-approve remote clients with tailscale auth when config is none", () => {
      expect(
        computeShouldAutoApprove({
          isLocalClient: false,
          deviceAutoApprove: "none",
          authMethod: "tailscale",
        }),
      ).toBe(false);
    });

    it("does NOT auto-approve remote clients with device-token auth", () => {
      expect(
        computeShouldAutoApprove({
          isLocalClient: false,
          deviceAutoApprove: "none",
          authMethod: "device-token",
        }),
      ).toBe(false);
    });
  });

  describe("config=tailscale", () => {
    it("auto-approves remote clients with tailscale auth", () => {
      expect(
        computeShouldAutoApprove({
          isLocalClient: false,
          deviceAutoApprove: "tailscale",
          authMethod: "tailscale",
        }),
      ).toBe(true);
    });

    it("does NOT auto-approve remote clients with token auth", () => {
      expect(
        computeShouldAutoApprove({
          isLocalClient: false,
          deviceAutoApprove: "tailscale",
          authMethod: "token",
        }),
      ).toBe(false);
    });

    it("does NOT auto-approve remote clients with password auth", () => {
      expect(
        computeShouldAutoApprove({
          isLocalClient: false,
          deviceAutoApprove: "tailscale",
          authMethod: "password",
        }),
      ).toBe(false);
    });

    it("does NOT auto-approve remote clients with device-token auth", () => {
      expect(
        computeShouldAutoApprove({
          isLocalClient: false,
          deviceAutoApprove: "tailscale",
          authMethod: "device-token",
        }),
      ).toBe(false);
    });
  });

  describe("security invariants", () => {
    it("never auto-approves non-tailscale remote auth when config is tailscale", () => {
      const nonTailscaleAuthMethods = ["token", "password", "device-token", "unknown", ""];
      for (const authMethod of nonTailscaleAuthMethods) {
        expect(
          computeShouldAutoApprove({
            isLocalClient: false,
            deviceAutoApprove: "tailscale",
            authMethod,
          }),
        ).toBe(false);
      }
    });

    it("never auto-approves any remote auth when config is none", () => {
      const allAuthMethods = ["token", "password", "device-token", "tailscale", "unknown", ""];
      for (const authMethod of allAuthMethods) {
        expect(
          computeShouldAutoApprove({
            isLocalClient: false,
            deviceAutoApprove: "none",
            authMethod,
          }),
        ).toBe(false);
      }
    });
  });
});
