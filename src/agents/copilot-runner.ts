/**
 * Copilot CLI Runner - runs agent prompts through the GitHub Copilot SDK.
 *
 * This module provides a runner that uses the `@github/copilot-sdk` to execute
 * agent prompts through the Copilot CLI, similar to how `cli-runner.ts` handles
 * Claude CLI and Codex CLI backends.
 */
import type { ImageContent } from "@mariozechner/pi-ai";

import type { MoltbotConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";
import { resolveUserPath } from "../utils.js";
import { resolveSessionAgentIds } from "./agent-scope.js";
import { makeBootstrapWarn, resolveBootstrapContextForRun } from "./bootstrap-files.js";
import { resolveCliBackendConfig } from "./cli-backends.js";
import { normalizeCliModel, buildSystemPrompt } from "./cli-runner/helpers.js";
import { runCopilotAgent, checkCopilotAvailable } from "./copilot-sdk.js";
import { resolveMoltbotDocsPath } from "./docs-path.js";
import { resolveHeartbeatPrompt } from "../auto-reply/heartbeat.js";
import type { ThinkLevel } from "../auto-reply/thinking.js";
import type { EmbeddedPiRunResult } from "./pi-embedded-runner.js";

const log = createSubsystemLogger("agent/copilot-cli");

/**
 * Check if the Copilot CLI backend is available.
 */
export function isCopilotCliAvailable(options?: { cliPath?: string }): boolean {
  const status = checkCopilotAvailable({ cliPath: options?.cliPath });
  return status.available && status.authenticated;
}

/**
 * Run an agent prompt through the Copilot CLI using the SDK.
 *
 * This function is designed to match the signature of `runCliAgent` for
 * compatibility with the existing CLI backend infrastructure.
 */
export async function runCopilotCliAgent(params: {
  sessionId: string;
  sessionKey?: string;
  sessionFile: string;
  workspaceDir: string;
  config?: MoltbotConfig;
  prompt: string;
  provider?: string;
  model?: string;
  thinkLevel?: ThinkLevel;
  timeoutMs: number;
  runId: string;
  extraSystemPrompt?: string;
  streamParams?: import("../commands/agent/types.js").AgentStreamParams;
  ownerNumbers?: string[];
  cliSessionId?: string;
  images?: ImageContent[];
}): Promise<EmbeddedPiRunResult> {
  const started = Date.now();
  const resolvedWorkspace = resolveUserPath(params.workspaceDir);
  const workspaceDir = resolvedWorkspace;
  const provider = params.provider ?? "copilot-cli";

  const backendResolved = resolveCliBackendConfig(provider, params.config);
  if (!backendResolved) {
    throw new Error(`Unknown CLI backend: ${provider}`);
  }
  const backend = backendResolved.config;
  const modelId = (params.model ?? "gpt-4.1").trim() || "gpt-4.1";
  const normalizedModel = normalizeCliModel(modelId, backend);
  const modelDisplay = `${provider}/${modelId}`;

  // Build system prompt with context
  const extraSystemPrompt = [
    params.extraSystemPrompt?.trim(),
    "Tools are disabled in this session. Do not call tools.",
  ]
    .filter(Boolean)
    .join("\n");

  const sessionLabel = params.sessionKey ?? params.sessionId;
  const { contextFiles } = await resolveBootstrapContextForRun({
    workspaceDir,
    config: params.config,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    warn: makeBootstrapWarn({ sessionLabel, warn: (message) => log.warn(message) }),
  });

  const { defaultAgentId, sessionAgentId } = resolveSessionAgentIds({
    sessionKey: params.sessionKey,
    config: params.config,
  });

  const heartbeatPrompt =
    sessionAgentId === defaultAgentId
      ? resolveHeartbeatPrompt(params.config?.agents?.defaults?.heartbeat?.prompt)
      : undefined;

  const docsPath = await resolveMoltbotDocsPath({
    workspaceDir,
    argv1: process.argv[1],
    cwd: process.cwd(),
    moduleUrl: import.meta.url,
  });

  const systemPrompt = buildSystemPrompt({
    workspaceDir,
    config: params.config,
    defaultThinkLevel: params.thinkLevel,
    extraSystemPrompt,
    ownerNumbers: params.ownerNumbers,
    heartbeatPrompt,
    docsPath: docsPath ?? undefined,
    tools: [],
    contextFiles,
    modelDisplay,
    agentId: sessionAgentId,
  });

  log.info(`copilot-cli exec: model=${normalizedModel} promptChars=${params.prompt.length}`);

  try {
    const result = await runCopilotAgent({
      prompt: params.prompt,
      model: normalizedModel,
      cliPath: backend.command,
      cwd: workspaceDir,
      systemPrompt,
      timeoutMs: params.timeoutMs,
      sessionId: params.cliSessionId,
    });

    const text = result.text?.trim();
    const payloads = text ? [{ text }] : undefined;

    // When resuming a session, the SDK's sessionId should be authoritative.
    // For new sessions, fall back to params.sessionId if SDK doesn't return one.
    const resolvedSessionId = params.cliSessionId
      ? result.sessionId // Resuming: use SDK's session ID
      : (result.sessionId ?? params.sessionId ?? ""); // New: SDK or fallback

    return {
      payloads,
      meta: {
        durationMs: Date.now() - started,
        agentMeta: {
          sessionId: resolvedSessionId,
          provider,
          model: modelId,
        },
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("copilot-cli run failed", { error: message });
    throw err;
  }
}
