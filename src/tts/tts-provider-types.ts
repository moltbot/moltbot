/**
 * TTS Provider Plugin Types
 *
 * Types for plugin-registered TTS providers.
 */

export type TtsProviderSynthesizeParams = {
  /** Text to synthesize */
  text: string;
  /** Plugin configuration from openclaw.json */
  config: Record<string, unknown>;
  /** Requested output format */
  outputFormat: "mp3" | "opus" | "wav" | "pcm";
  /** Request timeout in milliseconds */
  timeoutMs: number;
};

export type TtsProviderSynthesizeResult = {
  /** Audio data buffer */
  audio: Buffer;
  /** Actual output format */
  format: string;
  /** Sample rate (required for PCM) */
  sampleRate?: number;
};

export type TtsProviderPlugin = {
  /** Unique provider ID (e.g., "fish-speech") */
  id: string;
  /** Human-readable label */
  label: string;
  /** Synthesize text to audio */
  synthesize: (params: TtsProviderSynthesizeParams) => Promise<TtsProviderSynthesizeResult>;
  /** Supported output formats */
  getSupportedFormats?: () => string[];
  /** Whether this provider requires an API key */
  requiresApiKey?: boolean;
  /** Environment variables to check for API key */
  envVars?: string[];
  /** Check if provider is configured/available */
  isConfigured?: (config: Record<string, unknown>) => boolean;
};
