/**
 * GitHub Copilot SDK integration for Moltbot.
 *
 * This module provides a thin wrapper around the `@github/copilot-sdk` package
 * for programmatic control of GitHub Copilot CLI via JSON-RPC.
 */
import type {
  CopilotClient,
  CopilotClientOptions,
  CopilotSession,
  SessionConfig,
  SessionEvent,
} from "@github/copilot-sdk";

import { createSubsystemLogger } from "../logging/subsystem.js";
import { isCopilotCliInstalled, readCopilotAuthStatusCached } from "./copilot-credentials.js";

const log = createSubsystemLogger("agents/copilot-sdk");

// Re-export SDK types that consumers may need.
export type { CopilotClient, CopilotClientOptions, CopilotSession, SessionConfig, SessionEvent };

/**
 * Options for creating a Moltbot-configured Copilot client.
 */
export type MoltbotCopilotClientOptions = {
  /** Path to the Copilot CLI executable (default: "copilot" from PATH). */
  cliPath?: string;
  /** Working directory for the CLI process. */
  cwd?: string;
  /** Log level for the CLI server. */
  logLevel?: "none" | "error" | "warning" | "info" | "debug" | "all";
  /** Auto-restart the CLI server if it crashes (default: true). */
  autoRestart?: boolean;
  /** Environment variables to pass to the CLI process. */
  env?: Record<string, string | undefined>;
};

/**
 * Check if the Copilot CLI is available and authenticated.
 *
 * @returns Object with `available` and `authenticated` flags, plus optional user info.
 */
export function checkCopilotAvailable(options?: { cliPath?: string }): {
  available: boolean;
  authenticated: boolean;
  login?: string;
  avatarUrl?: string;
} {
  const installed = isCopilotCliInstalled({ cliPath: options?.cliPath });
  if (!installed) {
    return { available: false, authenticated: false };
  }

  const authStatus = readCopilotAuthStatusCached({
    cliPath: options?.cliPath,
    ttlMs: 5 * 60 * 1000, // Cache for 5 minutes
  });

  if (!authStatus) {
    return { available: true, authenticated: false };
  }

  return {
    available: true,
    authenticated: authStatus.authenticated,
    login: authStatus.login,
    avatarUrl: authStatus.avatarUrl,
  };
}

/**
 * Create a CopilotClient with Moltbot-specific defaults.
 *
 * This is a factory function that lazily imports the SDK and creates
 * a client instance. The client should be started before use.
 */
export async function createCopilotClient(
  options?: MoltbotCopilotClientOptions,
): Promise<CopilotClient> {
  const { CopilotClient: CopilotClientClass } = await import("@github/copilot-sdk");

  const clientOptions: CopilotClientOptions = {
    cliPath: options?.cliPath ?? "copilot",
    cwd: options?.cwd,
    logLevel: options?.logLevel ?? "warning",
    autoRestart: false, // Disable auto-restart to avoid keeping event loop alive
    useStdio: true, // Use stdio transport for better process control
    autoStart: false, // We'll start manually for better error handling
    env: options?.env,
  };

  log.info("creating copilot client", {
    cliPath: clientOptions.cliPath,
    cwd: clientOptions.cwd,
    logLevel: clientOptions.logLevel,
  });

  return new CopilotClientClass(clientOptions);
}

/**
 * Parameters for running a single-turn Copilot agent interaction.
 */
export type RunCopilotAgentParams = {
  /** The prompt/message to send. */
  prompt: string;
  /** Model to use (e.g., "gpt-5", "gpt-4.1", "claude-sonnet-4.5"). */
  model?: string;
  /** Path to the Copilot CLI executable. */
  cliPath?: string;
  /** Working directory for the CLI process. */
  cwd?: string;
  /** System message content (appended to CLI defaults). */
  systemPrompt?: string;
  /** Timeout in milliseconds (default: 120000). */
  timeoutMs?: number;
  /** Session ID to resume (for multi-turn conversations). */
  sessionId?: string;
  /** Environment variables to pass to the CLI. */
  env?: Record<string, string | undefined>;
  /** Callback for streaming events. */
  onEvent?: (event: SessionEvent) => void;
};

/**
 * Result from a Copilot agent run.
 */
export type CopilotAgentResult = {
  /** The final assistant response text. */
  text: string;
  /** Session ID for resuming conversations. */
  sessionId: string;
  /** Events received during the run. */
  events: SessionEvent[];
  /** Duration in milliseconds. */
  durationMs: number;
};

/**
 * Run a single-turn Copilot agent interaction.
 *
 * Creates a client, starts a session, sends the prompt, waits for completion,
 * and cleans up. For multi-turn conversations, pass the returned `sessionId`
 * back in subsequent calls.
 *
 * Note: When resuming a session, model and system prompt settings from the
 * original session are preserved. New configuration values are not applied
 * during resumption.
 */
export async function runCopilotAgent(params: RunCopilotAgentParams): Promise<CopilotAgentResult> {
  const started = Date.now();
  const events: SessionEvent[] = [];
  let finalText = "";

  const client = await createCopilotClient({
    cliPath: params.cliPath,
    cwd: params.cwd,
    env: params.env,
  });

  let session: CopilotSession | null = null;
  let unsubscribe: (() => void) | null = null;

  try {
    // Start the client
    await client.start();

    // Configure session for new sessions
    const sessionConfig: SessionConfig = {
      model: params.model,
      sessionId: params.sessionId,
    };

    // Add system message if provided (only applies to new sessions)
    if (params.systemPrompt) {
      sessionConfig.systemMessage = {
        mode: "append",
        content: params.systemPrompt,
      };
    }

    // Create or resume session
    // Note: When resuming, the SDK preserves the original session's model/prompt.
    // The ResumeSessionConfig type only supports tools, provider, streaming,
    // onPermissionRequest, mcpServers, customAgents, skillDirectories, disabledSkills.
    if (params.sessionId) {
      session = await client.resumeSession(params.sessionId, {
        streaming: true,
      });
    } else {
      session = await client.createSession(sessionConfig);
    }

    const sessionId = session.sessionId;

    // Set up event handler
    unsubscribe = session.on((event: SessionEvent) => {
      events.push(event);
      params.onEvent?.(event);

      // Capture final text from assistant message events
      if (event.type === "assistant.message") {
        const data = event.data as { content?: string };
        if (typeof data.content === "string") {
          finalText = data.content;
        }
      }
    });

    // Send the message and wait for completion
    const result = await session.sendAndWait({ prompt: params.prompt }, params.timeoutMs ?? 120000);

    // Extract text from result if available
    if (result?.data?.content && typeof result.data.content === "string") {
      finalText = result.data.content;
    }

    return {
      text: finalText,
      sessionId,
      events,
      durationMs: Date.now() - started,
    };
  } finally {
    // Clean up in order: unsubscribe, abort session, destroy session, stop client
    // NOTE: Due to a limitation in vscode-jsonrpc (used by @github/copilot-sdk),
    // the process may not exit cleanly after cleanup. This is acceptable for gateway
    // usage but means CLI one-off commands will hang. The SDK team should fix this.
    if (unsubscribe) {
      unsubscribe();
    }

    // Abort any in-flight request, then destroy the session
    if (session) {
      try {
        await session.abort();
      } catch {
        // Ignore abort errors (may not have active request)
      }

      // Only destroy session if we created a new one (not resuming)
      if (!params.sessionId) {
        try {
          await session.destroy();
        } catch {
          // Ignore destroy errors
        }
      }
    }

    // Access internal SDK handles BEFORE cleanup so we can unref them after
    const clientAny = client as unknown as {
      cliProcess?: {
        unref?: () => void;
        stdin?: { unref?: () => void };
        stdout?: { unref?: () => void };
        stderr?: { unref?: () => void };
        removeAllListeners?: () => void;
      };
      socket?: { unref?: () => void };
    };
    const cliProcess = clientAny.cliProcess;
    const socket = clientAny.socket;

    // Stop the client gracefully first, then force if needed
    try {
      await client.stop();
    } catch {
      try {
        await client.forceStop();
      } catch {
        // Ignore forceStop errors
      }
    }

    // Unref all handles to allow Node to exit (works around SDK cleanup bug)
    if (cliProcess) {
      cliProcess.unref?.();
      cliProcess.stdin?.unref?.();
      cliProcess.stdout?.unref?.();
      cliProcess.stderr?.unref?.();
      cliProcess.removeAllListeners?.();
    }
    if (socket) {
      socket.unref?.();
    }
  }
}

/**
 * List available Copilot sessions.
 */
export async function listCopilotSessions(options?: {
  cliPath?: string;
  cwd?: string;
}): Promise<Array<{ sessionId: string; createdAt?: string }>> {
  const client = await createCopilotClient({
    cliPath: options?.cliPath,
    cwd: options?.cwd,
  });

  try {
    await client.start();
    const sessions = await client.listSessions();
    return sessions.map((s) => ({
      sessionId: s.sessionId,
      createdAt: s.startTime?.toISOString(),
    }));
  } finally {
    try {
      await client.stop();
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Delete a Copilot session.
 */
export async function deleteCopilotSession(
  sessionId: string,
  options?: {
    cliPath?: string;
    cwd?: string;
  },
): Promise<void> {
  const client = await createCopilotClient({
    cliPath: options?.cliPath,
    cwd: options?.cwd,
  });

  try {
    await client.start();
    await client.deleteSession(sessionId);
    log.info("deleted copilot session", { sessionId });
  } finally {
    try {
      await client.stop();
    } catch {
      // Ignore cleanup errors
    }
  }
}
