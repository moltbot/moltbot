import fs from "node:fs/promises";

import type { ClawdbotConfig } from "../config/config.js";
import { logVerbose, shouldLogVerbose } from "../globals.js";

import {
  describeVideoViaGemini,
  type VideoDescriptionResult,
} from "./gemini.js";

export type DescribeVideoParams = {
  cfg: ClawdbotConfig;
  mediaPath: string;
  mediaType: string;
  chatType: "direct" | "group";
  chatId: string;
  groupSubject?: string;
};

export function isVideo(mediaType?: string | null): boolean {
  if (!mediaType) return false;
  return mediaType.startsWith("video/");
}

export function isVideoUnderstandingEnabledForChat(
  cfg: ClawdbotConfig,
  chatType: "direct" | "group",
  chatId: string,
  groupSubject?: string,
): boolean {
  const videoCfg = cfg.video?.understanding;
  if (!videoCfg?.enabled) return false;

  if (chatType === "direct") {
    return videoCfg.dmEnabled !== false;
  }

  // Group chat
  if (!videoCfg.groupEnabled) return false;

  const allowList = videoCfg.groupAllowFrom;
  if (!allowList || allowList.length === 0) {
    // groupEnabled but no allowlist means all groups
    return true;
  }

  // Check if group is in allowlist (by JID or subject name)
  for (const entry of allowList) {
    if (entry === "*") return true;
    if (entry === chatId) return true;
    if (groupSubject && entry === groupSubject) return true;
  }

  return false;
}

function resolveApiKey(cfg: ClawdbotConfig, provider: string): string | null {
  // Check skills.entries.<provider>.apiKey
  const skillEntry = cfg.skills?.entries?.[provider];
  if (skillEntry && typeof skillEntry === "object" && "apiKey" in skillEntry) {
    const key = skillEntry.apiKey;
    if (typeof key === "string" && key.length > 0) return key;
  }

  // Fallback to GEMINI_API_KEY env var
  const envKey = process.env.GEMINI_API_KEY?.trim();
  if (envKey) return envKey;

  return null;
}

async function persistDescription(
  videoPath: string,
  description: string,
): Promise<void> {
  const sidecarPath = `${videoPath}.description.txt`;
  try {
    await fs.writeFile(sidecarPath, description, "utf8");
    if (shouldLogVerbose()) {
      logVerbose(`Saved video description sidecar: ${sidecarPath}`);
    }
  } catch (err) {
    logVerbose(`Failed to save video description sidecar: ${String(err)}`);
  }
}

/** Wrap description with context for the bot */
function wrapDescriptionForBot(description: string): string {
  return `[Video]
The user sent you a video. Here's what it shows:

${description}

Respond naturally as if you watched the video yourself.`;
}

export async function describeVideo(
  params: DescribeVideoParams,
): Promise<VideoDescriptionResult | undefined> {
  const { cfg, mediaPath, chatType, chatId, groupSubject } = params;

  const videoCfg = cfg.video?.understanding;
  if (!videoCfg?.enabled) {
    return undefined;
  }

  if (
    !isVideoUnderstandingEnabledForChat(cfg, chatType, chatId, groupSubject)
  ) {
    if (shouldLogVerbose()) {
      logVerbose(`Video understanding skipped for ${chatType} chat ${chatId}`);
    }
    return undefined;
  }

  const provider = videoCfg.provider ?? "gemini";
  const model = videoCfg.model ?? "gemini-3-flash-preview";
  const prompt = videoCfg.prompt;
  const timeoutMs = (videoCfg.timeoutSeconds ?? 120) * 1000;

  const apiKey = resolveApiKey(cfg, provider);
  if (!apiKey) {
    logVerbose(
      `Video understanding skipped: no API key for provider "${provider}"`,
    );
    return undefined;
  }

  if (shouldLogVerbose()) {
    logVerbose(
      `Describing video via ${provider} (model: ${model}): ${mediaPath}`,
    );
  }

  // Currently only gemini is supported; switch preserved for future providers
  const result = await describeVideoViaGemini({
    filePath: mediaPath,
    apiKey,
    model,
    prompt,
    timeoutMs,
  });

  // Persist description if configured
  if (videoCfg.persist !== false && result.text) {
    await persistDescription(mediaPath, result.text);
  }

  // Wrap with bot context
  return {
    ...result,
    text: wrapDescriptionForBot(result.text),
  };
}

export type { VideoDescriptionResult } from "./gemini.js";
