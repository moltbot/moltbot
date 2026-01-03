/**
 * Deep Research E2E Tests (dry-run mode)
 * Run with: pnpm test src/deep-research/e2e.test.ts
 */

import { accessSync, constants } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { getDefaultDeepResearchCliPath } from "../config/config.js";
import {
  type DeliveryContext,
  deliverResults,
  executeDeepResearch,
  messages,
  parseDeepResearchCommand,
  parseResultJson,
} from "./index.js";

const cliPath =
  process.env.DEEP_RESEARCH_CLI_PATH?.trim() || getDefaultDeepResearchCliPath();
let hasCli = false;
try {
  accessSync(cliPath, constants.X_OK);
  hasCli = true;
} catch {
  hasCli = false;
}
const describeE2E = hasCli ? describe : describe.skip;

describeE2E("Deep Research E2E (dry-run)", () => {
  // Ensure dry-run is enabled
  beforeAll(() => {
    process.env.DEEP_RESEARCH_DRY_RUN = "true";
  });

  describe("Command → Execution → Delivery flow", () => {
    const testMessage = "/deep квантовые компьютеры";

    it("Step 1: parses deep research command", () => {
      const parsed = parseDeepResearchCommand(testMessage);
      expect(parsed).not.toBeNull();
    });

    it("Step 2: extracts topic from command", () => {
      const parsed = parseDeepResearchCommand(testMessage);
      expect(parsed).not.toBeNull();
      expect(parsed!.topic).toBe("квантовые компьютеры");
    });

    it("Step 3: generates acknowledgment message", () => {
      const parsed = parseDeepResearchCommand(testMessage);
      expect(parsed).not.toBeNull();
      const ack = messages.acknowledgment(parsed!.topic);
      expect(ack).toContain("🔍");
      expect(ack).toContain("deep research");
      expect(ack).toContain(parsed!.topic);
    });

    it("Step 4: executes dry-run successfully", async () => {
      const parsed = parseDeepResearchCommand(testMessage);
      expect(parsed).not.toBeNull();
      const topic = parsed!.topic;
      const result = await executeDeepResearch({
        topic,
        dryRun: true,
      });

      expect(result.success).toBe(true);
      expect(result.runId).toBeDefined();
      expect(result.error).toBeUndefined();
    }, 60000);

    it("Step 5: parses result.json", async () => {
      const parsed = parseDeepResearchCommand(testMessage);
      expect(parsed).not.toBeNull();
      const topic = parsed!.topic;
      const execResult = await executeDeepResearch({
        topic,
        dryRun: true,
      });

      expect(execResult.success).toBe(true);
      expect(execResult.resultJsonPath).toBeDefined();

      const parsed = await parseResultJson(execResult.resultJsonPath!);

      expect(parsed).not.toBeNull();
      expect(parsed!.summaryBullets).toBeDefined();
      expect(parsed!.summaryBullets.length).toBeGreaterThan(0);
      expect(parsed!.shortAnswer).toBeDefined();
      expect(parsed!.publishUrl).toMatch(/^https:\/\//);
    }, 60000);

    it("Step 6: generates result delivery message", async () => {
      const parsed = parseDeepResearchCommand(testMessage);
      expect(parsed).not.toBeNull();
      const topic = parsed!.topic;
      const execResult = await executeDeepResearch({
        topic,
        dryRun: true,
      });
      const parsed = await parseResultJson(execResult.resultJsonPath!);

      const delivery = messages.resultDelivery(parsed!);

      expect(delivery).toContain("✅ Deep Research завершен");
      expect(delivery).toContain("📝 Краткий ответ");
      expect(delivery).toContain("📋 Основные пункты");
      expect(delivery).toContain("💭 Мнение");
      expect(delivery).toContain("🔗 Полный отчет");
      expect(delivery).toContain("https://");
    }, 60000);
  });

  describe("Error handling", () => {
    it("generates error message with run_id", () => {
      const error = messages.error("Test error", "test-run-id-123");
      expect(error).toContain("❌");
      expect(error).toContain("Test error");
      expect(error).toContain("test-run-id-123");
    });
  });

});

describe("Deep Research E2E (publish fallback)", () => {
  let tempDir: string | null = null;
  const originalCliPath = process.env.DEEP_RESEARCH_CLI_PATH;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    if (originalCliPath === undefined) {
      delete process.env.DEEP_RESEARCH_CLI_PATH;
    } else {
      process.env.DEEP_RESEARCH_CLI_PATH = originalCliPath;
    }
  });

  it("keeps results when publish fails", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "clawdis-dr-"));
    const runId = "test-publish-failure";
    const runDir = path.join(tempDir, "runs", runId, "md");

    await mkdir(runDir, { recursive: true });
    await writeFile(path.join(runDir, "report.md"), "# Report\n", "utf-8");
    await writeFile(
      path.join(runDir, "agent_summary.json"),
      JSON.stringify(
        {
          summary_bullets: ["Alpha", "Beta"],
          short_answer_summary_2_initial_request: "Short answer",
          opinion: "Opinion",
        },
        null,
        2,
      ),
      "utf-8",
    );

    const cliPath = path.join(tempDir, "gdr-stub");
    const script = `#!/usr/bin/env node
const runId = ${JSON.stringify(runId)};
console.log(JSON.stringify({ event: "run.start", run_id: runId }));
console.log(JSON.stringify({ event: "publish.error", detail: "publish failed" }));
console.log(JSON.stringify({ event: "run.error", detail: "publish required but failed" }));
process.exit(1);
`;
    await writeFile(cliPath, script, { mode: 0o755 });
    await chmod(cliPath, 0o755);

    process.env.DEEP_RESEARCH_CLI_PATH = cliPath;

    const execResult = await executeDeepResearch({
      topic: "test topic",
      dryRun: false,
    });

    expect(execResult.success).toBe(true);
    expect(execResult.resultJsonPath).toBeDefined();

    const parsed = await parseResultJson(execResult.resultJsonPath!);
    expect(parsed).not.toBeNull();
    expect(parsed!.publishUrl).toMatch(/^file:\/\//);

    const raw = await readFile(execResult.resultJsonPath!, "utf-8");
    const fallback = JSON.parse(raw) as { publish?: { ok?: boolean } };
    expect(fallback.publish?.ok).toBe(false);
  });

  it("delivers fallback results successfully", async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), "clawdis-dr-"));
    const runId = "test-publish-failure-delivery";
    const runDir = path.join(tempDir, "runs", runId, "md");

    await mkdir(runDir, { recursive: true });
    await writeFile(
      path.join(runDir, "report.md"),
      "# Test Report\nContent here\n",
      "utf-8",
    );
    await writeFile(
      path.join(runDir, "agent_summary.json"),
      JSON.stringify(
        {
          summary_bullets: ["Point 1", "Point 2", "Point 3"],
          short_answer_summary_2_initial_request: "Short answer to test topic",
          opinion: "Test opinion",
        },
        null,
        2,
      ),
      "utf-8",
    );

    const cliPath = path.join(tempDir, "gdr-stub-fail");
    const script = `#!/usr/bin/env node
const runId = ${JSON.stringify(runId)};
console.log(JSON.stringify({ event: "run.start", run_id: runId }));
console.log(JSON.stringify({ event: "publish.error", detail: "Telegraph API failed" }));
console.log(JSON.stringify({ event: "run.error", detail: "publish required but failed" }));
process.exit(1);
`;
    await writeFile(cliPath, script, { mode: 0o755 });
    await chmod(cliPath, 0o755);

    process.env.DEEP_RESEARCH_CLI_PATH = cliPath;

    // Execute deep research (with publish failure)
    const execResult = await executeDeepResearch({
      topic: "test delivery topic",
      dryRun: false,
    });

    expect(execResult.success).toBe(true);
    expect(execResult.resultJsonPath).toBeDefined();

    // Deliver results
    let deliveredMessage = "";
    const mockContext: DeliveryContext = {
      sendMessage: async (text: string) => {
        deliveredMessage = text;
      },
      sendError: async (text: string) => {
        throw new Error(`sendError called: ${text}`);
      },
    };

    const deliverySuccess = await deliverResults(execResult, mockContext);
    expect(deliverySuccess).toBe(true);
    expect(deliveredMessage).toContain("✅ Deep Research завершен");
    expect(deliveredMessage).toContain("Short answer to test topic");
    expect(deliveredMessage).toContain("Point 1");
    expect(deliveredMessage).toContain("Point 2");
    expect(deliveredMessage).toContain("Point 3");
    expect(deliveredMessage).toContain("Test opinion");
    expect(deliveredMessage).toContain("file://");
  });
});
