/**
 * Cursor Model Provider for OpenClaw
 *
 * This module provides integration with Cursor's Language Model API,
 * allowing OpenClaw to use models available through Cursor's subscription
 * (Claude, GPT-4, etc.).
 *
 * How it works:
 * 1. Cursor exposes models via a local HTTP API when the Copilot Proxy extension is active
 * 2. OpenClaw connects to this API as an OpenAI-compatible endpoint
 * 3. You can then use Cursor's models in OpenClaw prompts
 *
 * Setup:
 * 1. Install "Copilot Proxy" extension in Cursor
 * 2. Run `openclaw setup cursor` to configure
 * 3. Use models like `cursor/claude-sonnet-4` in OpenClaw
 */

import type { CursorMcpConfig } from "./types.js";

// Default Cursor proxy configuration
const DEFAULT_CURSOR_PROXY_URL = "http://localhost:3000/v1";
const DEFAULT_CURSOR_PROXY_PORT = 3000;

// Models typically available through Cursor
export const CURSOR_AVAILABLE_MODELS = [
  {
    id: "claude-sonnet-4",
    name: "Claude Sonnet 4",
    provider: "anthropic",
    contextWindow: 200000,
    reasoning: false,
  },
  {
    id: "claude-sonnet-4-thinking",
    name: "Claude Sonnet 4 (Thinking)",
    provider: "anthropic",
    contextWindow: 200000,
    reasoning: true,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    provider: "openai",
    contextWindow: 128000,
    reasoning: false,
  },
  {
    id: "gpt-4o-mini",
    name: "GPT-4o Mini",
    provider: "openai",
    contextWindow: 128000,
    reasoning: false,
  },
  {
    id: "o1",
    name: "o1",
    provider: "openai",
    contextWindow: 200000,
    reasoning: true,
  },
  {
    id: "o1-mini",
    name: "o1-mini",
    provider: "openai",
    contextWindow: 128000,
    reasoning: true,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    provider: "google",
    contextWindow: 1000000,
    reasoning: false,
  },
] as const;

export type CursorModelId = (typeof CURSOR_AVAILABLE_MODELS)[number]["id"];

export type CursorModelConfig = {
  baseUrl: string;
  models: string[];
};

/**
 * Check if the Cursor proxy is running and accessible
 */
export async function checkCursorProxyHealth(
  baseUrl: string = DEFAULT_CURSOR_PROXY_URL,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${baseUrl}/models`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.ok) {
      return { ok: true };
    }
    return { ok: false, error: `HTTP ${response.status}: ${response.statusText}` };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { ok: false, error: "Connection timeout - is Copilot Proxy running in Cursor?" };
    }
    return { ok: false, error: String(err) };
  }
}

/**
 * Generate OpenClaw configuration patch for Cursor models
 */
export function generateCursorProviderConfig(opts: {
  baseUrl?: string;
  models?: string[];
}): Record<string, unknown> {
  const baseUrl = opts.baseUrl ?? DEFAULT_CURSOR_PROXY_URL;
  const modelIds = opts.models ?? CURSOR_AVAILABLE_MODELS.map((m) => m.id);

  return {
    models: {
      providers: {
        cursor: {
          baseUrl,
          apiKey: "cursor-proxy", // Placeholder - Copilot Proxy handles auth
          api: "openai-completions",
          authHeader: false,
          models: modelIds.map((id) => {
            const model = CURSOR_AVAILABLE_MODELS.find((m) => m.id === id);
            return {
              id,
              name: model?.name ?? id,
              api: "openai-completions",
              reasoning: model?.reasoning ?? false,
              input: ["text", "image"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: model?.contextWindow ?? 128000,
              maxTokens: 8192,
            };
          }),
        },
      },
    },
    agents: {
      defaults: {
        models: Object.fromEntries(modelIds.map((id) => [`cursor/${id}`, {}])),
      },
    },
  };
}

/**
 * Instructions for setting up Cursor model integration
 */
export const CURSOR_SETUP_INSTRUCTIONS = `
# Using Cursor's Models with OpenClaw

## Prerequisites
1. Cursor IDE with an active subscription (Pro/Business)
2. The "Copilot Proxy" VS Code extension installed in Cursor

## Setup Steps

### Step 1: Install Copilot Proxy Extension
In Cursor, go to Extensions and search for "Copilot Proxy" by AdrianGonz97.
Install it and restart Cursor.

### Step 2: Start the Proxy Server
The extension should start automatically. Verify it's running:
- Look for "Copilot Proxy" in the status bar
- Or check http://localhost:3000/v1/models in your browser

### Step 3: Configure OpenClaw
Run the setup command:
  openclaw setup cursor

Or manually add to your config (~/.clawdbot/config.yaml):

models:
  providers:
    cursor:
      baseUrl: "http://localhost:3000/v1"
      apiKey: "cursor-proxy"
      api: openai-completions
      authHeader: false
      models:
        - id: claude-sonnet-4
          name: Claude Sonnet 4
          contextWindow: 200000
        - id: gpt-4o
          name: GPT-4o
          contextWindow: 128000

### Step 4: Use Cursor Models
Now you can use Cursor's models in OpenClaw:

# Set as default model
openclaw config set agents.defaults.model cursor/claude-sonnet-4

# Use in a specific message
openclaw message send --model cursor/gpt-4o "Hello!"

# Use in the TUI
openclaw tui --model cursor/claude-sonnet-4

## Available Models (depends on your Cursor subscription)
- cursor/claude-sonnet-4
- cursor/claude-sonnet-4-thinking
- cursor/gpt-4o
- cursor/gpt-4o-mini
- cursor/o1
- cursor/o1-mini
- cursor/gemini-2.5-pro

## Troubleshooting

### Proxy not responding
- Ensure Cursor is running with the Copilot Proxy extension active
- Check if http://localhost:3000/v1/models returns a response
- Try restarting Cursor

### Model not available
- Your Cursor subscription may not include all models
- Check Cursor's model selector to see which models you have access to

### Authentication errors
- Ensure you're logged into Cursor with your subscription account
- The proxy uses your Cursor session for authentication
`;
