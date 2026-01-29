import { describe, expect, it } from "vitest";
import { resolveImplicitProviders } from "./models-config.providers.js";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("ShengSuanYun provider", () => {
  it("should not include shengsuanyun when no API key is configured", async () => {
    const agentDir = mkdtempSync(join(tmpdir(), "clawd-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    // ShengSuanYun requires explicit configuration via SHENGSUANYUN_API_KEY env var or profile
    expect(providers?.shengsuanyun).toBeUndefined();
  });
});
