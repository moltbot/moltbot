import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { resolveImplicitProviders } from "./models-config.providers.js";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("Firmware provider", () => {
  let previousFirmwareKey: string | undefined;

  beforeEach(() => {
    previousFirmwareKey = process.env.FIRMWARE_API_KEY;
  });

  afterEach(() => {
    if (previousFirmwareKey !== undefined) {
      process.env.FIRMWARE_API_KEY = previousFirmwareKey;
    } else {
      delete process.env.FIRMWARE_API_KEY;
    }
  });

  it("should not include firmware when no API key is configured", async () => {
    delete process.env.FIRMWARE_API_KEY;
    const agentDir = mkdtempSync(join(tmpdir(), "clawd-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.firmware).toBeUndefined();
  });

  it("should include firmware when FIRMWARE_API_KEY env var is set", async () => {
    process.env.FIRMWARE_API_KEY = "test-firmware-key";
    const agentDir = mkdtempSync(join(tmpdir(), "clawd-test-"));
    const providers = await resolveImplicitProviders({ agentDir });

    expect(providers?.firmware).toBeDefined();
    expect(providers?.firmware?.baseUrl).toBe("https://app.firmware.ai/api/v1");
    expect(providers?.firmware?.api).toBe("openai-completions");
    expect(providers?.firmware?.models?.length).toBeGreaterThan(0);
  });
});
