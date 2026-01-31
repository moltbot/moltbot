import { describe, expect, it } from "vitest";

import { MoltbotSchema } from "./zod-schema.js";

describe("gateway.devices.autoApprove config", () => {
  it("accepts valid autoApprove=none", () => {
    const result = MoltbotSchema.safeParse({
      gateway: {
        devices: {
          autoApprove: "none",
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gateway?.devices?.autoApprove).toBe("none");
    }
  });

  it("accepts valid autoApprove=tailscale", () => {
    const result = MoltbotSchema.safeParse({
      gateway: {
        devices: {
          autoApprove: "tailscale",
        },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gateway?.devices?.autoApprove).toBe("tailscale");
    }
  });

  it("accepts omitted autoApprove (defaults to none)", () => {
    const result = MoltbotSchema.safeParse({
      gateway: {
        devices: {},
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gateway?.devices?.autoApprove).toBeUndefined();
    }
  });

  it("accepts omitted devices config entirely", () => {
    const result = MoltbotSchema.safeParse({
      gateway: {
        port: 18789,
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gateway?.devices).toBeUndefined();
    }
  });

  it("rejects invalid autoApprove values", () => {
    const invalidValues = ["all", "always", "local", "open", "", "TAILSCALE", "Tailscale"];
    for (const value of invalidValues) {
      const result = MoltbotSchema.safeParse({
        gateway: {
          devices: {
            autoApprove: value,
          },
        },
      });
      expect(result.success, `should reject autoApprove=${value}`).toBe(false);
    }
  });

  it("rejects extra properties in devices config", () => {
    const result = MoltbotSchema.safeParse({
      gateway: {
        devices: {
          autoApprove: "none",
          unknownProperty: "value",
        },
      },
    });
    expect(result.success).toBe(false);
  });
});
