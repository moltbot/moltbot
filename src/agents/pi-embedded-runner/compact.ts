import fs from "node:fs/promises";
// Note: os no longer needed - runtime info removed from system prompt in pi-agent-core 0.50.4

import {
  createAgentSession,
  estimateTokens,
  SessionManager,
  SettingsManager,
} from "@mariozechner/pi-coding-agent";

// Note: resolveHeartbeatPrompt no longer needed - system prompt removed from CreateAgentSessionOptions in pi-agent-core 0.50.4
import type { ReasoningLevel, ThinkLevel } from "../../auto-reply/thinking.js";
// Note: listChannelSupportedActions, resolveChannelMessageToolHints no longer needed - system prompt removed in pi-agent-core 0.50.4
import { resolveChannelCapabilities } from "../../config/channel-capabilities.js";
import type { OpenClawConfig } from "../../config/config.js";
// Note: getMachineDisplayName no longer needed - system prompt removed in pi-agent-core 0.50.4
import { resolveTelegramInlineButtonsScope } from "../../telegram/inline-buttons.js";
// Note: resolveTelegramReactionLevel, resolveSignalReactionLevel no longer needed - system prompt removed in pi-agent-core 0.50.4
import { type enqueueCommand, enqueueCommandInLane } from "../../process/command-queue.js";
import { normalizeMessageChannel } from "../../utils/message-channel.js";
// Note: isSubagentSessionKey no longer needed - system prompt removed in pi-agent-core 0.50.4
// Note: isReasoningTagProvider no longer needed - system prompt removed in pi-agent-core 0.50.4
import { resolveUserPath } from "../../utils.js";
import { resolveOpenClawAgentDir } from "../agent-paths.js";
// Note: resolveSessionAgentIds no longer needed - system prompt removed in pi-agent-core 0.50.4
import { makeBootstrapWarn, resolveBootstrapContextForRun } from "../bootstrap-files.js";
// Note: resolveOpenClawDocsPath no longer needed - system prompt removed in pi-agent-core 0.50.4
import type { ExecElevatedDefaults } from "../bash-tools.js";
import { DEFAULT_MODEL, DEFAULT_PROVIDER } from "../defaults.js";
import { getApiKeyForModel, resolveModelAuthMode } from "../model-auth.js";
import { ensureOpenClawModelsJson } from "../models-config.js";
import {
  ensureSessionHeader,
  validateAnthropicTurns,
  validateGeminiTurns,
} from "../pi-embedded-helpers.js";
import {
  ensurePiCompactionReserveTokens,
  resolveCompactionReserveTokensFloor,
} from "../pi-settings.js";
import { createOpenClawCodingTools } from "../pi-tools.js";
import { resolveSandboxContext } from "../sandbox.js";
import { guardSessionManager } from "../session-tool-result-guard-wrapper.js";
import { resolveTranscriptPolicy } from "../transcript-policy.js";
import { acquireSessionWriteLock } from "../session-write-lock.js";
import {
  applySkillEnvOverrides,
  applySkillEnvOverridesFromSnapshot,
  loadWorkspaceSkillEntries,
  // Note: resolveSkillsPromptForRun no longer needed - system prompt removed in pi-agent-core 0.50.4
  type SkillSnapshot,
} from "../skills.js";
// Note: buildEmbeddedExtensionPaths no longer needed - removed from CreateAgentSessionOptions in pi-agent-core 0.50.4
import {
  logToolSchemasForGoogle,
  sanitizeSessionHistory,
  sanitizeToolsForGoogle,
} from "./google.js";
import { getDmHistoryLimitFromSessionKey, limitHistoryTurns } from "./history.js";
import { resolveGlobalLane, resolveSessionLane } from "./lanes.js";
import { log } from "./logger.js";
import { resolveModel } from "./model.js";
// Note: buildModelAliasLines no longer needed - system prompt removed from CreateAgentSessionOptions in pi-agent-core 0.50.4
// Note: buildEmbeddedSandboxInfo no longer needed - system prompt removed in pi-agent-core 0.50.4
import { prewarmSessionFile, trackSessionManagerAccess } from "./session-manager-cache.js";
// Note: buildEmbeddedSystemPrompt and createSystemPromptOverride no longer needed - systemPrompt removed from CreateAgentSessionOptions in pi-agent-core 0.50.4
import { splitSdkTools } from "./tool-split.js";
import type { EmbeddedPiCompactResult } from "./types.js";
// Note: formatUserTime, resolveUserTimeFormat, resolveUserTimezone no longer needed - system prompt removed in pi-agent-core 0.50.4
import { describeUnknownError, mapThinkingLevel, resolveExecToolDefaults } from "./utils.js";
// Note: buildTtsSystemPromptHint no longer needed - system prompt removed in pi-agent-core 0.50.4

export type CompactEmbeddedPiSessionParams = {
  sessionId: string;
  sessionKey?: string;
  messageChannel?: string;
  messageProvider?: string;
  agentAccountId?: string;
  authProfileId?: string;
  /** Group id for channel-level tool policy resolution. */
  groupId?: string | null;
  /** Group channel label (e.g. #general) for channel-level tool policy resolution. */
  groupChannel?: string | null;
  /** Group space label (e.g. guild/team id) for channel-level tool policy resolution. */
  groupSpace?: string | null;
  /** Parent session key for subagent policy inheritance. */
  spawnedBy?: string | null;
  sessionFile: string;
  workspaceDir: string;
  agentDir?: string;
  config?: OpenClawConfig;
  skillsSnapshot?: SkillSnapshot;
  provider?: string;
  model?: string;
  thinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  bashElevated?: ExecElevatedDefaults;
  customInstructions?: string;
  lane?: string;
  enqueue?: typeof enqueueCommand;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
};

/**
 * Core compaction logic without lane queueing.
 * Use this when already inside a session/global lane to avoid deadlocks.
 */
export async function compactEmbeddedPiSessionDirect(
  params: CompactEmbeddedPiSessionParams,
): Promise<EmbeddedPiCompactResult> {
  const resolvedWorkspace = resolveUserPath(params.workspaceDir);
  const prevCwd = process.cwd();

  const provider = (params.provider ?? DEFAULT_PROVIDER).trim() || DEFAULT_PROVIDER;
  const modelId = (params.model ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const agentDir = params.agentDir ?? resolveOpenClawAgentDir();
  await ensureOpenClawModelsJson(params.config, agentDir);
  const { model, error, authStorage, modelRegistry } = resolveModel(
    provider,
    modelId,
    agentDir,
    params.config,
  );
  if (!model) {
    return {
      ok: false,
      compacted: false,
      reason: error ?? `Unknown model: ${provider}/${modelId}`,
    };
  }
  try {
    const apiKeyInfo = await getApiKeyForModel({
      model,
      cfg: params.config,
      profileId: params.authProfileId,
      agentDir,
    });

    if (!apiKeyInfo.apiKey) {
      if (apiKeyInfo.mode !== "aws-sdk") {
        throw new Error(
          `No API key resolved for provider "${model.provider}" (auth mode: ${apiKeyInfo.mode}).`,
        );
      }
    } else if (model.provider === "github-copilot") {
      const { resolveCopilotApiToken } = await import("../../providers/github-copilot-token.js");
      const copilotToken = await resolveCopilotApiToken({
        githubToken: apiKeyInfo.apiKey,
      });
      authStorage.setRuntimeApiKey(model.provider, copilotToken.token);
    } else {
      authStorage.setRuntimeApiKey(model.provider, apiKeyInfo.apiKey);
    }
  } catch (err) {
    return {
      ok: false,
      compacted: false,
      reason: describeUnknownError(err),
    };
  }

  await fs.mkdir(resolvedWorkspace, { recursive: true });
  const sandboxSessionKey = params.sessionKey?.trim() || params.sessionId;
  const sandbox = await resolveSandboxContext({
    config: params.config,
    sessionKey: sandboxSessionKey,
    workspaceDir: resolvedWorkspace,
  });
  const effectiveWorkspace = sandbox?.enabled
    ? sandbox.workspaceAccess === "rw"
      ? resolvedWorkspace
      : sandbox.workspaceDir
    : resolvedWorkspace;
  await fs.mkdir(effectiveWorkspace, { recursive: true });
  await ensureSessionHeader({
    sessionFile: params.sessionFile,
    sessionId: params.sessionId,
    cwd: effectiveWorkspace,
  });

  let restoreSkillEnv: (() => void) | undefined;
  process.chdir(effectiveWorkspace);
  try {
    const shouldLoadSkillEntries = !params.skillsSnapshot || !params.skillsSnapshot.resolvedSkills;
    const skillEntries = shouldLoadSkillEntries
      ? loadWorkspaceSkillEntries(effectiveWorkspace)
      : [];
    restoreSkillEnv = params.skillsSnapshot
      ? applySkillEnvOverridesFromSnapshot({
          snapshot: params.skillsSnapshot,
          config: params.config,
        })
      : applySkillEnvOverrides({
          skills: skillEntries ?? [],
          config: params.config,
        });
    // Note: Skills prompt no longer passed to createAgentSession in pi-agent-core 0.50.4
    // const skillsPrompt = resolveSkillsPromptForRun({
    //   skillsSnapshot: params.skillsSnapshot,
    //   entries: shouldLoadSkillEntries ? skillEntries : undefined,
    //   config: params.config,
    //   workspaceDir: effectiveWorkspace,
    // });

    const sessionLabel = params.sessionKey ?? params.sessionId;
    // Note: contextFiles no longer passed to createAgentSession in pi-agent-core 0.50.4
    await resolveBootstrapContextForRun({
      workspaceDir: effectiveWorkspace,
      config: params.config,
      sessionKey: params.sessionKey,
      sessionId: params.sessionId,
      warn: makeBootstrapWarn({ sessionLabel, warn: (message) => log.warn(message) }),
    });
    const runAbortController = new AbortController();
    const toolsRaw = createOpenClawCodingTools({
      exec: {
        ...resolveExecToolDefaults(params.config),
        elevated: params.bashElevated,
      },
      sandbox,
      messageProvider: params.messageChannel ?? params.messageProvider,
      agentAccountId: params.agentAccountId,
      sessionKey: params.sessionKey ?? params.sessionId,
      groupId: params.groupId,
      groupChannel: params.groupChannel,
      groupSpace: params.groupSpace,
      spawnedBy: params.spawnedBy,
      agentDir,
      workspaceDir: effectiveWorkspace,
      config: params.config,
      abortSignal: runAbortController.signal,
      modelProvider: model.provider,
      modelId,
      modelAuthMode: resolveModelAuthMode(model.provider, params.config),
    });
    const tools = sanitizeToolsForGoogle({ tools: toolsRaw, provider });
    logToolSchemasForGoogle({ tools, provider });
    // Note: machineName no longer needed - system prompt removed in pi-agent-core 0.50.4
    // const machineName = await getMachineDisplayName();
    const runtimeChannel = normalizeMessageChannel(params.messageChannel ?? params.messageProvider);
    let runtimeCapabilities = runtimeChannel
      ? (resolveChannelCapabilities({
          cfg: params.config,
          channel: runtimeChannel,
          accountId: params.agentAccountId,
        }) ?? [])
      : undefined;
    if (runtimeChannel === "telegram" && params.config) {
      const inlineButtonsScope = resolveTelegramInlineButtonsScope({
        cfg: params.config,
        accountId: params.agentAccountId ?? undefined,
      });
      if (inlineButtonsScope !== "off") {
        if (!runtimeCapabilities) runtimeCapabilities = [];
        if (
          !runtimeCapabilities.some((cap) => String(cap).trim().toLowerCase() === "inlinebuttons")
        ) {
          runtimeCapabilities.push("inlineButtons");
        }
      }
    }
    // Note: The following variables were used for system prompt building, which has been
    // removed from createAgentSession in pi-agent-core 0.50.4. System prompt is now
    // handled internally by the pi-agent-core library.
    // const reactionGuidance = ...
    // const channelActions = ...
    // const messageToolHints = ...
    // const runtimeInfo = ...
    // const sandboxInfo = ...
    // const reasoningTagHint = ...
    // const userTimezone = ...
    // const userTimeFormat = ...
    // const userTime = ...
    // const isDefaultAgent = ...
    // const promptMode = ...
    // const docsPath = ...
    // const ttsHint = ...
    // Note: systemPrompt removed from CreateAgentSessionOptions in pi-agent-core 0.50.4
    // System prompt is now set via different mechanism in pi-agent-core
    // const appendPrompt = buildEmbeddedSystemPrompt({
    //   workspaceDir: effectiveWorkspace,
    //   defaultThinkLevel: params.thinkLevel,
    //   reasoningLevel: params.reasoningLevel ?? "off",
    //   extraSystemPrompt: params.extraSystemPrompt,
    //   ownerNumbers: params.ownerNumbers,
    //   reasoningTagHint,
    //   heartbeatPrompt: isDefaultAgent
    //     ? resolveHeartbeatPrompt(params.config?.agents?.defaults?.heartbeat?.prompt)
    //     : undefined,
    //   skillsPrompt,
    //   docsPath: docsPath ?? undefined,
    //   ttsHint,
    //   promptMode,
    //   runtimeInfo,
    //   reactionGuidance,
    //   messageToolHints,
    //   sandboxInfo,
    //   tools,
    //   modelAliasLines: buildModelAliasLines(params.config),
    //   userTimezone,
    //   userTime,
    //   userTimeFormat,
    //   contextFiles,
    // });
    // const systemPrompt = createSystemPromptOverride(appendPrompt);

    const sessionLock = await acquireSessionWriteLock({
      sessionFile: params.sessionFile,
    });
    try {
      await prewarmSessionFile(params.sessionFile);
      const transcriptPolicy = resolveTranscriptPolicy({
        modelApi: model.api,
        provider,
        modelId,
      });
      const sessionManager = guardSessionManager(SessionManager.open(params.sessionFile), {
        agentId: sessionAgentId,
        sessionKey: params.sessionKey,
        allowSyntheticToolResults: transcriptPolicy.allowSyntheticToolResults,
      });
      trackSessionManagerAccess(params.sessionFile);
      const settingsManager = SettingsManager.create(effectiveWorkspace, agentDir);
      ensurePiCompactionReserveTokens({
        settingsManager,
        minReserveTokens: resolveCompactionReserveTokensFloor(params.config),
      });
      // Note: additionalExtensionPaths removed from CreateAgentSessionOptions in pi-agent-core 0.50.4
      // const additionalExtensionPaths = buildEmbeddedExtensionPaths({
      //   cfg: params.config,
      //   sessionManager,
      //   provider,
      //   modelId,
      //   model,
      // });

      const { builtInTools, customTools } = splitSdkTools({
        tools,
        sandboxEnabled: !!sandbox?.enabled,
      });

      let session: Awaited<ReturnType<typeof createAgentSession>>["session"];
      ({ session } = await createAgentSession({
        cwd: resolvedWorkspace,
        agentDir,
        authStorage,
        modelRegistry,
        model,
        thinkingLevel: mapThinkingLevel(params.thinkLevel),
        tools: builtInTools,
        customTools,
        sessionManager,
        settingsManager,
      }));

      try {
        const prior = await sanitizeSessionHistory({
          messages: session.messages,
          modelApi: model.api,
          modelId,
          provider,
          sessionManager,
          sessionId: params.sessionId,
          policy: transcriptPolicy,
        });
        const validatedGemini = transcriptPolicy.validateGeminiTurns
          ? validateGeminiTurns(prior)
          : prior;
        const validated = transcriptPolicy.validateAnthropicTurns
          ? validateAnthropicTurns(validatedGemini)
          : validatedGemini;
        const limited = limitHistoryTurns(
          validated,
          getDmHistoryLimitFromSessionKey(params.sessionKey, params.config),
        );
        if (limited.length > 0) {
          session.agent.replaceMessages(limited);
        }
        const result = await session.compact(params.customInstructions);
        // Estimate tokens after compaction by summing token estimates for remaining messages
        let tokensAfter: number | undefined;
        try {
          tokensAfter = 0;
          for (const message of session.messages) {
            tokensAfter += estimateTokens(message);
          }
          // Sanity check: tokensAfter should be less than tokensBefore
          if (tokensAfter > result.tokensBefore) {
            tokensAfter = undefined; // Don't trust the estimate
          }
        } catch {
          // If estimation fails, leave tokensAfter undefined
          tokensAfter = undefined;
        }
        return {
          ok: true,
          compacted: true,
          result: {
            summary: result.summary,
            firstKeptEntryId: result.firstKeptEntryId,
            tokensBefore: result.tokensBefore,
            tokensAfter,
            details: result.details,
          },
        };
      } finally {
        sessionManager.flushPendingToolResults?.();
        session.dispose();
      }
    } finally {
      await sessionLock.release();
    }
  } catch (err) {
    return {
      ok: false,
      compacted: false,
      reason: describeUnknownError(err),
    };
  } finally {
    restoreSkillEnv?.();
    process.chdir(prevCwd);
  }
}

/**
 * Compacts a session with lane queueing (session lane + global lane).
 * Use this from outside a lane context. If already inside a lane, use
 * `compactEmbeddedPiSessionDirect` to avoid deadlocks.
 */
export async function compactEmbeddedPiSession(
  params: CompactEmbeddedPiSessionParams,
): Promise<EmbeddedPiCompactResult> {
  const sessionLane = resolveSessionLane(params.sessionKey?.trim() || params.sessionId);
  const globalLane = resolveGlobalLane(params.lane);
  const enqueueGlobal =
    params.enqueue ?? ((task, opts) => enqueueCommandInLane(globalLane, task, opts));
  return enqueueCommandInLane(sessionLane, () =>
    enqueueGlobal(async () => compactEmbeddedPiSessionDirect(params)),
  );
}
