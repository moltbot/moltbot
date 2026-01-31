/**
 * Fish-Speech TTS Provider
 *
 * Implements the TTS provider interface for Fish-Speech.
 * https://github.com/fishaudio/fish-speech
 * https://docs.fish.audio/
 */

import type { TtsProviderPlugin } from "openclaw/plugins";

export type FishSpeechConfig = {
  /** Base URL for Fish-Speech API (default: http://localhost:8080) */
  baseUrl?: string;
  /** API key for Fish Audio cloud (optional for self-hosted) */
  apiKey?: string;
  /** Model to use (e.g., "speech-1.6", "s1", or custom model ID) */
  model?: string;
  /** Reference ID for voice cloning (model ID from Fish Audio library) */
  referenceId?: string;
  /** Sampling temperature (0.0-1.0, default: 0.7) */
  temperature?: number;
  /** Speech speed multiplier (default: 1.0) */
  speed?: number;
  /** Volume multiplier (default: 1.0) */
  volume?: number;
  /** Chunk length for text segmentation (100-300, default: 200) */
  chunkLength?: number;
  /** Enable text normalization (default: true) */
  normalize?: boolean;
};

const DEFAULT_BASE_URL = "http://localhost:8080";
const DEFAULT_MODEL = "speech-1.6";
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_SPEED = 1.0;
const DEFAULT_VOLUME = 1.0;
const DEFAULT_CHUNK_LENGTH = 200;

const FORMAT_MAP: Record<string, string> = {
  mp3: "mp3",
  opus: "opus",
  wav: "wav",
  pcm: "pcm",
};

function resolveConfig(pluginConfig: Record<string, unknown>): FishSpeechConfig {
  const cfg = (pluginConfig.fishSpeech ?? pluginConfig) as FishSpeechConfig;
  return {
    baseUrl: cfg.baseUrl?.toString().replace(/\/+$/, "") || DEFAULT_BASE_URL,
    apiKey:
      cfg.apiKey?.toString() || process.env.FISH_AUDIO_API_KEY || process.env.FISH_SPEECH_API_KEY,
    model: cfg.model?.toString() || DEFAULT_MODEL,
    referenceId: cfg.referenceId?.toString(),
    temperature: typeof cfg.temperature === "number" ? cfg.temperature : DEFAULT_TEMPERATURE,
    speed: typeof cfg.speed === "number" ? cfg.speed : DEFAULT_SPEED,
    volume: typeof cfg.volume === "number" ? cfg.volume : DEFAULT_VOLUME,
    chunkLength: typeof cfg.chunkLength === "number" ? cfg.chunkLength : DEFAULT_CHUNK_LENGTH,
    normalize: cfg.normalize !== false,
  };
}

type SynthesizeParams = {
  text: string;
  config: Record<string, unknown>;
  outputFormat: "mp3" | "opus" | "wav" | "pcm";
  timeoutMs: number;
};

type SynthesizeResult = {
  audio: Buffer;
  format: string;
  sampleRate?: number;
};

async function synthesizeFishSpeech(params: SynthesizeParams): Promise<SynthesizeResult> {
  const config = resolveConfig(params.config);
  const baseUrl = (config.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const format = FORMAT_MAP[params.outputFormat] || "mp3";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    const endpoint = `${baseUrl}/v1/tts`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add auth header for cloud API
    if (config.apiKey) {
      headers["Authorization"] = `Bearer ${config.apiKey}`;
    }

    // Add model header (required by Fish Audio API)
    if (config.model) {
      headers["model"] = config.model;
    }

    const body: Record<string, unknown> = {
      text: params.text,
      format,
      temperature: config.temperature,
      speed: config.speed,
      volume: config.volume,
      chunk_length: config.chunkLength,
      normalize: config.normalize,
    };

    // Voice cloning via reference ID
    if (config.referenceId) {
      body.reference_id = config.referenceId;
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      let errorMessage = `Fish-Speech API error (${response.status})`;
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = `Fish-Speech: ${errorJson.message}`;
        } else if (errorJson.detail) {
          errorMessage = `Fish-Speech: ${errorJson.detail}`;
        }
      } catch {
        if (errorText.length < 200) {
          errorMessage = `Fish-Speech: ${errorText}`;
        }
      }
      throw new Error(errorMessage);
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Determine sample rate based on format
    let sampleRate: number | undefined;
    if (format === "pcm") {
      sampleRate = 24000; // Fish-Speech default
    }

    return {
      audio: audioBuffer,
      format,
      sampleRate,
    };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fish-Speech TTS provider plugin.
 */
export const fishSpeechProvider: TtsProviderPlugin = {
  id: "fish-speech",
  label: "Fish-Speech",

  async synthesize(params: SynthesizeParams): Promise<SynthesizeResult> {
    return synthesizeFishSpeech(params);
  },

  getSupportedFormats(): string[] {
    return ["mp3", "opus", "wav", "pcm"];
  },

  requiresApiKey: false, // Optional for self-hosted

  envVars: ["FISH_AUDIO_API_KEY", "FISH_SPEECH_API_KEY"],

  isConfigured(config: Record<string, unknown>): boolean {
    const cfg = resolveConfig(config);
    // Configured if we have a base URL (even without API key for self-hosted)
    return Boolean(cfg.baseUrl);
  },
};

export default fishSpeechProvider;
