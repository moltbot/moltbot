/**
 * Integration test for Plivo SMS extension
 * Tests core functionality without requiring real Plivo credentials
 */

import { createServer } from "node:http";
import { plivoPlugin } from "./src/channel.js";
import { startWebhookServer } from "./src/webhook.js";
import type { PlivoResolvedAccount } from "./src/types.js";

const TEST_PORT = 19876;

// Mock account config
const mockAccount: PlivoResolvedAccount = {
  authId: "test_auth_id",
  authToken: "test_auth_token",
  phoneNumber: "+15551234567",
  webhookPath: "/plivo",
  dmPolicy: "open",
  allowFrom: [],
  enableQuickCommands: true,
  quickCommands: [
    { trigger: "cal", fullCommand: "show my calendar for today", description: "Calendar" },
    { trigger: "todo", fullCommand: "show my todo list", description: "Todos" },
  ],
};

// Mock Clawdbot config
const mockConfig = {
  channels: {
    plivo: {
      authId: "test_auth_id",
      authToken: "test_auth_token",
      phoneNumber: "+15551234567",
      enabled: true,
    },
  },
};

async function testConfigAdapter() {
  console.log("\n📋 Testing Config Adapter...");

  // Test listAccountIds
  const accountIds = plivoPlugin.config.listAccountIds(mockConfig);
  console.log(`  ✓ listAccountIds: ${JSON.stringify(accountIds)}`);
  if (accountIds.length !== 1 || accountIds[0] !== "default") {
    throw new Error("listAccountIds failed");
  }

  // Test isConfigured
  const isConfigured = plivoPlugin.config.isConfigured(mockConfig);
  console.log(`  ✓ isConfigured: ${isConfigured}`);
  if (!isConfigured) {
    throw new Error("isConfigured should be true");
  }

  // Test describeAccount
  const description = plivoPlugin.config.describeAccount(mockConfig);
  console.log(`  ✓ describeAccount: ${JSON.stringify(description)}`);

  console.log("  ✅ Config adapter tests passed!");
}

async function testOutboundAdapter() {
  console.log("\n📤 Testing Outbound Adapter...");

  // Test resolveTarget
  const validTarget = plivoPlugin.outbound.resolveTarget("+15559876543");
  console.log(`  ✓ resolveTarget (valid): ${JSON.stringify(validTarget)}`);
  if (!validTarget.ok) {
    throw new Error("resolveTarget should succeed for valid number");
  }

  const invalidTarget = plivoPlugin.outbound.resolveTarget("abc");
  console.log(`  ✓ resolveTarget (invalid): ${JSON.stringify(invalidTarget)}`);
  if (invalidTarget.ok) {
    throw new Error("resolveTarget should fail for invalid number");
  }

  // Test 10-digit US number normalization
  const usNumber = plivoPlugin.outbound.resolveTarget("5559876543");
  console.log(`  ✓ resolveTarget (10-digit): ${JSON.stringify(usNumber)}`);
  if (usNumber.to !== "+15559876543") {
    throw new Error("10-digit number should be normalized to +1");
  }

  console.log("  ✅ Outbound adapter tests passed!");
}

async function testWebhookServer() {
  console.log("\n🌐 Testing Webhook Server...");

  let receivedMessage: unknown = null;

  const { server, stop } = await startWebhookServer({
    account: mockAccount,
    accountId: "test",
    path: "/plivo",
    port: TEST_PORT,
    onMessage: async (message) => {
      receivedMessage = message;
      return "Test reply";
    },
    log: () => {}, // Silent logging for tests
  });

  console.log(`  ✓ Webhook server started on port ${TEST_PORT}`);

  // Test health endpoint
  const healthResponse = await fetch(`http://localhost:${TEST_PORT}/plivo/health`);
  const healthData = await healthResponse.json();
  console.log(`  ✓ Health check: ${JSON.stringify(healthData)}`);
  if (healthData.status !== "healthy") {
    throw new Error("Health check failed");
  }

  // Test inbound SMS webhook
  const inboundPayload = new URLSearchParams({
    From: "+15559876543",
    To: "+15551234567",
    Text: "Hello world",
    MessageUUID: "test-uuid-123",
    Type: "sms",
  });

  const inboundResponse = await fetch(`http://localhost:${TEST_PORT}/plivo`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: inboundPayload.toString(),
  });

  console.log(`  ✓ Inbound webhook status: ${inboundResponse.status}`);
  if (inboundResponse.status !== 200) {
    throw new Error("Inbound webhook failed");
  }

  // Verify message was received
  if (!receivedMessage) {
    throw new Error("Message handler was not called");
  }
  console.log(`  ✓ Received message: ${JSON.stringify(receivedMessage)}`);

  // Test quick command expansion
  receivedMessage = null;
  const quickCommandPayload = new URLSearchParams({
    From: "+15559876543",
    To: "+15551234567",
    Text: "cal",
    MessageUUID: "test-uuid-456",
    Type: "sms",
  });

  await fetch(`http://localhost:${TEST_PORT}/plivo`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: quickCommandPayload.toString(),
  });

  const msg = receivedMessage as { text: string };
  console.log(`  ✓ Quick command expanded: "${msg?.text}"`);
  if (msg?.text !== "show my calendar for today") {
    throw new Error("Quick command not expanded correctly");
  }

  // Stop server
  await stop();
  console.log("  ✓ Webhook server stopped");

  console.log("  ✅ Webhook server tests passed!");
}

async function testCapabilities() {
  console.log("\n🔧 Testing Channel Capabilities...");

  console.log(`  ✓ Channel ID: ${plivoPlugin.id}`);
  console.log(`  ✓ Supports text: ${plivoPlugin.capabilities.supportsText}`);
  console.log(`  ✓ Supports media: ${plivoPlugin.capabilities.supportsMedia}`);
  console.log(`  ✓ Max text length: ${plivoPlugin.capabilities.maxTextLength}`);

  if (!plivoPlugin.capabilities.supportsText) {
    throw new Error("Should support text");
  }
  if (!plivoPlugin.capabilities.supportsMedia) {
    throw new Error("Should support media");
  }

  console.log("  ✅ Capabilities tests passed!");
}

async function runAllTests() {
  console.log("🧪 Plivo SMS Extension Integration Tests\n");
  console.log("=========================================");

  try {
    await testCapabilities();
    await testConfigAdapter();
    await testOutboundAdapter();
    await testWebhookServer();

    console.log("\n=========================================");
    console.log("✅ All integration tests passed!\n");
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  }
}

runAllTests();
