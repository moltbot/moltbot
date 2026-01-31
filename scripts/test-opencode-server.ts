/**
 * Test harness for OpenCode Server integration.
 *
 * Tests the opencode-server-models.ts module against a running OpenCode server.
 *
 * Usage:
 *   1. Start server: opencode serve --port 4096
 *   2. Run tests: npx tsx scripts/test-opencode-server.ts
 *
 * Environment variables:
 *   - OPENCODE_SERVER_URL: Server URL (default: http://127.0.0.1:4096)
 *
 * Exit codes:
 *   0 - All tests passed
 *   1 - One or more tests failed
 */

import {
  fetchOpencodeServerModels,
  isOpencodeServerRunning,
  clearOpencodeServerModelCache,
  OPENCODE_SERVER_DEFAULT_URL,
} from "../src/agents/opencode-server-models.js";

const SERVER_URL = process.env.OPENCODE_SERVER_URL ?? OPENCODE_SERVER_DEFAULT_URL;

// Models to test - modify as needed
const MODELS_TO_TEST = [{ providerID: "opencode", modelID: "antigravity-gemini-3-flash" }];

interface SessionInfo {
  id: string;
}
interface MessageResponse {
  parts?: Array<{ type: string; text?: string }>;
}

async function testModel(
  providerID: string,
  modelID: string,
  prompt: string,
): Promise<{ success: boolean; response?: string; error?: string; ms: number }> {
  const startTime = Date.now();

  try {
    const sessionRes = await fetch(`${SERVER_URL}/session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: `Test: ${modelID}` }),
    });

    if (!sessionRes.ok) {
      return {
        success: false,
        error: `Session failed: ${sessionRes.status}`,
        ms: Date.now() - startTime,
      };
    }

    const session = (await sessionRes.json()) as SessionInfo;

    const msgRes = await fetch(`${SERVER_URL}/session/${session.id}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parts: [{ type: "text", text: prompt }],
        providerID,
        modelID,
        noReply: false,
      }),
    });

    const ms = Date.now() - startTime;

    if (!msgRes.ok) {
      await fetch(`${SERVER_URL}/session/${session.id}`, { method: "DELETE" });
      return { success: false, error: `Message failed: ${msgRes.status}`, ms };
    }

    const data = (await msgRes.json()) as MessageResponse;
    const response = data.parts?.find((p) => p.type === "text")?.text ?? "";

    await fetch(`${SERVER_URL}/session/${session.id}`, { method: "DELETE" });
    return { success: true, response, ms };
  } catch (error) {
    return { success: false, error: String(error), ms: Date.now() - startTime };
  }
}

async function runTests(): Promise<boolean> {
  console.log("=== OpenCode Server Integration Test ===\n");
  console.log(`Server: ${SERVER_URL}\n`);

  let allPassed = true;

  // Check server health
  const isRunning = await isOpencodeServerRunning(SERVER_URL);
  if (!isRunning) {
    console.error("[FAIL] Server not running. Start with: opencode serve");
    throw new Error("Server not running");
  }
  console.log("[PASS] Server running\n");

  // Test model discovery
  console.log("Testing model discovery...");
  clearOpencodeServerModelCache();
  const models = await fetchOpencodeServerModels(SERVER_URL);
  if (models.length === 0) {
    console.error("[FAIL] No models discovered");
    allPassed = false;
  } else {
    console.log(`[PASS] Fetched ${models.length} models\n`);
  }

  // Test messaging with specified models
  if (MODELS_TO_TEST.length > 0) {
    const prompt = "What is 2+2? Reply with just the number.";
    console.log(`Testing messaging with prompt: "${prompt}"\n`);

    for (const { providerID, modelID } of MODELS_TO_TEST) {
      process.stdout.write(`  ${providerID}/${modelID}... `);
      const result = await testModel(providerID, modelID, prompt);

      if (result.success) {
        const preview = result.response?.slice(0, 50).replace(/\n/g, " ") ?? "";
        console.log(`[PASS] (${result.ms}ms) "${preview}"`);
      } else {
        console.log(`[FAIL] ${result.error}`);
        allPassed = false;
      }
    }
  }

  console.log("\n=== Done ===");
  return allPassed;
}

runTests()
  .then((passed) => {
    // Use process.exitCode instead of process.exit() to allow cleanup
    process.exitCode = passed ? 0 : 1;
  })
  .catch((error) => {
    console.error("[ERROR]", error);
    process.exitCode = 1;
  });
