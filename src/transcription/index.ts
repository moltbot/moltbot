import type { ClawdbotConfig } from "../config/config.js";
import { logVerbose, shouldLogVerbose } from "../globals.js";
import { atomicWriteFile } from "../utils/atomic-write.js";

import { type TranscriptionResult, transcribeViaGroq } from "./groq.js";

export type TranscribeVoiceNoteParams = {
  cfg: ClawdbotConfig;
  mediaPath: string;
  mediaType: string;
  chatType: "direct" | "group";
  chatId: string;
  groupSubject?: string;
};

export function isVoiceNote(mediaType?: string | null): boolean {
  if (!mediaType) return false;
  return mediaType.startsWith("audio/");
}

export function isTranscriptionEnabledForChat(
  cfg: ClawdbotConfig,
  chatType: "direct" | "group",
  chatId: string,
  groupSubject?: string,
): boolean {
  const transcriptionCfg = cfg.voiceNotes?.transcription;
  if (!transcriptionCfg?.enabled) return false;

  if (chatType === "direct") {
    return transcriptionCfg.dmEnabled !== false;
  }

  // Group chat
  if (!transcriptionCfg.groupEnabled) return false;

  const allowList = transcriptionCfg.groupAllowFrom;
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

  // Fallback to GROQ_API_KEY env var for groq provider
  if (provider === "groq") {
    const envKey = process.env.GROQ_API_KEY?.trim();
    if (envKey) return envKey;
  }

  return null;
}

async function persistTranscript(
  audioPath: string,
  transcript: string,
): Promise<void> {
  const sidecarPath = `${audioPath}.transcript.txt`;

  try {
    await atomicWriteFile(sidecarPath, transcript, "utf8");

    if (shouldLogVerbose()) {
      logVerbose(`Saved transcript sidecar: ${sidecarPath}`);
    }
  } catch (err) {
    logVerbose(`Failed to save transcript sidecar: ${String(err)}`);
  }
}

export async function transcribeVoiceNote(
  params: TranscribeVoiceNoteParams,
): Promise<TranscriptionResult | undefined> {
  const { cfg, mediaPath, chatType, chatId, groupSubject } = params;

  const transcriptionCfg = cfg.voiceNotes?.transcription;
  if (!transcriptionCfg?.enabled) {
    return undefined;
  }

  if (!isTranscriptionEnabledForChat(cfg, chatType, chatId, groupSubject)) {
    if (shouldLogVerbose()) {
      logVerbose(
        `Voice note transcription skipped for ${chatType} chat ${chatId}`,
      );
    }
    return undefined;
  }

  const provider = transcriptionCfg.provider ?? "groq";
  const model = transcriptionCfg.model ?? "whisper-large-v3-turbo";
  const language = transcriptionCfg.language;
  const timeoutMs = (transcriptionCfg.timeoutSeconds ?? 60) * 1000;

  const apiKey = resolveApiKey(cfg, provider);
  if (!apiKey) {
    logVerbose(
      `Voice note transcription skipped: no API key for provider "${provider}"`,
    );
    return undefined;
  }

  if (shouldLogVerbose()) {
    logVerbose(
      `Transcribing voice note via ${provider} (model: ${model}): ${mediaPath}`,
    );
  }

  // Currently only groq is supported; switch preserved for future providers
  const result = await transcribeViaGroq({
    filePath: mediaPath,
    apiKey,
    model,
    language,
    timeoutMs,
  });

  // Persist transcript if configured
  if (transcriptionCfg.persist !== false && result.text) {
    await persistTranscript(mediaPath, result.text);
  }

  return result;
}

export type { TranscriptionResult } from "./groq.js";
