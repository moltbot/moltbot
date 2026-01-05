import { loadConfig, type ClawdisConfig } from "../config/config.js";
import { MiniMaxTTSClient } from "./client.js";
import type { TTSProgressCallback, TTSRequest, TTSResponse } from "./types.js";

// Cached client with metadata for validation
interface CachedClient {
  client: MiniMaxTTSClient;
  configHash: string;
}

let cachedClient: CachedClient | null = null;

/**
 * Generate hash from TTS config for cache invalidation
 */
function getConfigHash(config: ClawdisConfig): string {
  const ttsConfig = config.tts;
  if (!ttsConfig) return "";

  const apiKey = ttsConfig.minimaxApiKey || process.env.MINIMAX_API_KEY || "";
  // Hash the relevant config values
  return JSON.stringify({
    apiKey: apiKey.slice(0, 10), // Only first 10 chars for privacy
    groupId: ttsConfig.minimaxGroupId,
    maxChars: ttsConfig.maxChars,
    timeoutSec: ttsConfig.timeoutSec,
  });
}

/**
 * Get or create TTS client from config
 * Recreates client if config has changed
 */
export function getTTSClient(): MiniMaxTTSClient | null {
  const config = loadConfig();
  const ttsConfig = config.tts;

  if (!ttsConfig?.enabled) {
    return null;
  }

  const apiKey = ttsConfig.minimaxApiKey || process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    console.warn("[tts] No MiniMax API key configured");
    return null;
  }

  const currentConfigHash = getConfigHash(config);

  // Check if we need to recreate the client
  if (cachedClient) {
    if (cachedClient.configHash === currentConfigHash) {
      return cachedClient.client;
    }
    // Config changed, recreate client
    console.log("[tts] Config changed, recreating client");
    cachedClient = null;
  }

  const client = new MiniMaxTTSClient({
    apiKey,
    groupId: ttsConfig.minimaxGroupId,
    cacheTtlSec: ttsConfig.cacheTtlSec,
    maxChars: ttsConfig.maxChars,
    timeoutSec: ttsConfig.timeoutSec,
  });

  cachedClient = { client, configHash: currentConfigHash };
  return client;
}

/**
 * Synthesize text using configured TTS provider
 * Fixed: No duplicate config loading
 */
export async function synthesize(
  text: string,
  onProgress?: TTSProgressCallback,
): Promise<TTSResponse> {
  const client = getTTSClient();
  if (!client) {
    return {
      success: false,
      error: "TTS not enabled or not configured",
    };
  }

  // Get config once from loadConfig (not duplicating getTTSClient logic)
  const config = loadConfig();
  const ttsConfig = config.tts;

  if (!ttsConfig) {
    return {
      success: false,
      error: "TTS not configured",
    };
  }

  const request: TTSRequest = {
    text,
    model: ttsConfig.model,
    voiceId: ttsConfig.voiceId,
    emotion: ttsConfig.emotion,
    speed: ttsConfig.speed,
  };

  return client.synthesize(request, onProgress);
}

/**
 * Check if TTS is enabled
 */
export function isTTSEnabled(): boolean {
  const config = loadConfig();
  return config.tts?.enabled ?? false;
}

/**
 * Reset cached client (useful for testing)
 */
export function resetTTSClient(): void {
  if (cachedClient) {
    cachedClient.client.reset();
  }
  cachedClient = null;
}
