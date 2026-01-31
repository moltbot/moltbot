import { HipocapClient } from "./client.js";
import { Logger } from "tslog";
import type { OpenClawConfig } from "../../config/types.js";
import { getHipocapConfig } from "./config.js";
import { initLmnr } from "../../observability/lmnr.js";

const logger = new Logger({ name: "HipocapMiddleware" });
let client = new HipocapClient();

/**
 * Re-initializes the global Hipocap client with the provided Moltbot configuration.
 */
export function initHipocap(config?: OpenClawConfig) {
  const hipocapConfig = getHipocapConfig(config);
  client = new HipocapClient(hipocapConfig);

  if (hipocapConfig.enabled) {
    initLmnr({
      apiKey: hipocapConfig.apiKey,
      baseUrl: hipocapConfig.observabilityUrl,
      httpPort: hipocapConfig.httpPort,
      grpcPort: hipocapConfig.grpcPort,
    });
  }
}

/**
 * analyzes an incoming user message for direct prompt injection using Shields.
 * Returns true if the message is safe, false if it should be blocked.
 */
export async function interceptMessage(
  content: string,
  options: { shieldKey?: string; config?: OpenClawConfig } = {},
): Promise<{ safe: boolean; reason?: string }> {
  if (options.config) {
    initHipocap(options.config);
  }

  if (!client.isEnabled()) {
    return { safe: true };
  }

  // Skip very short messages to avoid false positives on navigation/simple commands
  if (!content || content.trim().length < 4) {
    return { safe: true };
  }

  try {
    const result = await client.shield({
      shield_key: options.shieldKey || "jailbreak", // Default to generic jailbreak shield
      content: content,
      require_reason: true,
    });

    if (result.decision === "BLOCK") {
      logger.warn(`Hipocap Shield detected security concern: ${result.reason}`);
      return { safe: false, reason: result.reason };
    }

    return { safe: true };
  } catch (error) {
    logger.error("Error in Hipocap message intercept:", error);
    // Fail closed or open? relying on client implementation
    // If client threw, it means it failed.
    // Let's assume fail open for middleware if strictly connectivity issue to avoid DoS?
    // But client.shield() catches errors and returns BLOCK. So we trust the result.
    return { safe: false, reason: "Security check failed" };
  }
}

/**
 * Extracted text from complex tool results for better security analysis.
 */
function extractTextFromToolResult(result: any): any {
  if (result === null || result === undefined) return result;

  // Handle standard pi-agent AgentToolResult
  if (typeof result === "object" && Array.isArray(result.content)) {
    const textParts = result.content
      .filter((c: any) => c && c.type === "text" && typeof c.text === "string")
      .map((c: any) => c.text);

    if (textParts.length > 0) {
      return textParts.join("\n\n");
    }

    // If no text but has images, indicate it
    const hasImages = result.content.some((c: any) => c && c.type === "image");
    if (hasImages) {
      return "[Tool result contains image data]";
    }
  }

  // Handle objects by stringifying if they are small, or just return as is
  return result;
}

/**
 * Analyzes a tool/function call result against security policies.
 */
export async function analyzeToolCall(
  functionName: string,
  functionArgs: any,
  functionResult: any,
  userQuery: string,
  userRole: string = "assistant",
  options: { config?: OpenClawConfig } = {},
): Promise<{ safe: boolean; reason?: string }> {
  if (options.config) {
    initHipocap(options.config);
  }

  if (!client.isEnabled()) {
    return { safe: true };
  }

  try {
    const result = await client.analyze({
      function_name: functionName,
      function_args: functionArgs,
      function_result: extractTextFromToolResult(functionResult),
      user_query: userQuery,
      user_role: userRole,
      input_analysis: true, // Always do fast check
      llm_analysis: true, // Do deeper check
      quarantine_analysis: false, // Default to false for speed
    });

    if (!result.safe_to_use) {
      logger.warn(`Hipocap tool analysis detected security concern: ${result.reason}`);
      return { safe: false, reason: result.reason };
    }

    return { safe: true };
  } catch (e) {
    logger.error("Error in Hipocap tool analysis:", e);
    return { safe: false, reason: "Security analysis failed" };
  }
}
