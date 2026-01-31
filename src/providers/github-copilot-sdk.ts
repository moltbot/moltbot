/**
 * GitHub Copilot SDK integration.
 *
 * Uses the official @github/copilot-sdk which manages a Copilot CLI subprocess
 * for authentication and API access.
 */

import { CopilotClient, type ModelInfo } from "@github/copilot-sdk";

import { resolveStateDir } from "../config/paths.js";

let sharedClient: CopilotClient | null = null;
let clientStartPromise: Promise<void> | null = null;

export type CopilotAuthStatus = {
  isAuthenticated: boolean;
  authType?: string;
  host?: string;
  login?: string;
  statusMessage?: string;
};

export type CopilotModelInfo = ModelInfo;

// Legacy type for backward compatibility
export type CachedCopilotToken = {
  token: string;
  /** milliseconds since epoch */
  expiresAt: number;
  /** milliseconds since epoch */
  updatedAt: number;
};

// Legacy constant for backward compatibility
export const DEFAULT_COPILOT_API_BASE_URL = "https://api.individual.githubcopilot.com";

/**
 * Get or create the shared CopilotClient singleton.
 * The SDK manages a Copilot CLI subprocess internally.
 */
export function getCopilotClient(): CopilotClient {
  if (!sharedClient) {
    sharedClient = new CopilotClient({
      logLevel: "error",
      autoStart: false,
    });
  }
  return sharedClient;
}

/**
 * Ensure the Copilot CLI subprocess is started and connected.
 */
export async function ensureCopilotClientStarted(): Promise<CopilotClient> {
  const client = getCopilotClient();
  const state = client.getState();

  if (state === "connected") {
    return client;
  }

  if (clientStartPromise) {
    await clientStartPromise;
    return client;
  }

  clientStartPromise = client.start();
  try {
    await clientStartPromise;
  } finally {
    clientStartPromise = null;
  }

  return client;
}

/**
 * Stop the shared Copilot client if running.
 */
export async function stopCopilotClient(): Promise<void> {
  if (sharedClient) {
    const state = sharedClient.getState();
    if (state === "connected") {
      await sharedClient.stop();
    }
    sharedClient = null;
  }
}

/**
 * Get authentication status from the Copilot CLI.
 */
export async function getCopilotAuthStatus(): Promise<CopilotAuthStatus> {
  const client = await ensureCopilotClientStarted();
  return client.getAuthStatus();
}

/**
 * Check if the user is authenticated with GitHub Copilot.
 */
export async function isCopilotAuthenticated(): Promise<boolean> {
  try {
    const status = await getCopilotAuthStatus();
    return status.isAuthenticated;
  } catch {
    return false;
  }
}

/**
 * List available models from the Copilot API.
 * Requires authentication.
 */
export async function listCopilotModels(): Promise<CopilotModelInfo[]> {
  const client = await ensureCopilotClientStarted();
  return client.listModels();
}

/**
 * Get cached token path for legacy compatibility.
 * The SDK handles token management internally, but we keep this
 * for existing code that checks for token presence.
 */
export function getCopilotTokenCachePath(env: NodeJS.ProcessEnv = process.env): string {
  return `${resolveStateDir(env)}/credentials/github-copilot.token.json`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Legacy token compatibility layer
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @deprecated The SDK manages base URLs internally. This function always returns null.
 */
export function deriveCopilotApiBaseUrlFromToken(_token: string): string | null {
  return null;
}

/**
 * Resolve Copilot API token via the official SDK.
 *
 * The SDK manages token exchange and caching internally, so this function
 * now checks authentication status and returns a marker indicating SDK-managed auth.
 *
 * @throws Error if Copilot CLI is not authenticated
 */
export async function resolveCopilotApiToken(_params: {
  githubToken: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
}): Promise<{
  token: string;
  expiresAt: number;
  source: string;
  baseUrl: string;
}> {
  const isAuthenticated = await isCopilotAuthenticated();

  if (!isAuthenticated) {
    throw new Error("GitHub Copilot is not authenticated. Run 'copilot auth login' first.");
  }

  return {
    token: "sdk-managed",
    expiresAt: Date.now() + 3600 * 1000,
    source: "sdk:copilot-cli",
    baseUrl: DEFAULT_COPILOT_API_BASE_URL,
  };
}

/**
 * Check if Copilot SDK is available and authenticated.
 */
export async function isCopilotSdkReady(): Promise<boolean> {
  try {
    await ensureCopilotClientStarted();
    return await isCopilotAuthenticated();
  } catch {
    return false;
  }
}
