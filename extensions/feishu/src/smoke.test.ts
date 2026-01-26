import { describe, expect, it } from "vitest";

import { feishuDock, feishuPlugin } from "./channel.js";

describe("feishu/smoke", () => {
  it("registers channel metadata", () => {
    expect(feishuDock.id).toBe("feishu");
    expect(feishuPlugin.id).toBe("feishu");
  });

  it("exports a plugin entrypoint", async () => {
    const mod = await import("../index.ts");
    expect(mod.default.id).toBe("feishu");
    expect(typeof mod.default.register).toBe("function");
  });
});
