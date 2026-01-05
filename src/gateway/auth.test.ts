import { describe, expect, it } from "vitest";

import { authorizeGatewayConnect } from "./auth.js";

describe("gateway auth", () => {
  it("does not throw when req is missing socket", async () => {
    const res = await authorizeGatewayConnect({
      auth: { mode: "none", allowTailscale: false },
      connectAuth: null,
      // Regression: avoid crashing on req.socket.remoteAddress when callers pass a non-IncomingMessage.
      req: {} as never,
    });
    expect(res.ok).toBe(true);
  });
});
