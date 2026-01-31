/**
 * Fish-Speech TTS Plugin for OpenClaw
 *
 * Adds Fish-Speech as a TTS provider with support for:
 * - Self-hosted Fish-Speech servers
 * - Fish Audio cloud API
 * - Voice cloning via reference audio
 *
 * @see https://github.com/fishaudio/fish-speech
 * @see https://docs.fish.audio/
 */

import type {
  OpenClawPluginDefinition,
  OpenClawPluginApi,
  OpenClawPluginConfigSchema,
} from "openclaw/plugins";
import { fishSpeechProvider } from "./fish-speech-provider.js";

const jsonSchema = {
  type: "object",
  properties: {
    baseUrl: {
      type: "string",
      description: "Base URL for Fish-Speech API",
      default: "http://localhost:8080",
    },
    apiKey: {
      type: "string",
      description: "API key for Fish Audio cloud (optional for self-hosted)",
    },
    model: {
      type: "string",
      description: 'Model to use (e.g., "speech-1.6", "s1")',
      default: "speech-1.6",
    },
    referenceId: {
      type: "string",
      description: "Reference ID for voice cloning (model ID from Fish Audio)",
    },
    temperature: {
      type: "number",
      minimum: 0,
      maximum: 1,
      default: 0.7,
      description: "Sampling temperature (0.0-1.0)",
    },
    speed: {
      type: "number",
      minimum: 0.5,
      maximum: 2.0,
      default: 1.0,
      description: "Speech speed multiplier",
    },
  },
  additionalProperties: false,
};

const configSchema: OpenClawPluginConfigSchema = {
  jsonSchema,
  uiHints: {
    baseUrl: {
      label: "Fish-Speech API URL",
      help: "Base URL for self-hosted Fish-Speech server or https://api.fish.audio for cloud",
      placeholder: "http://192.168.1.4:8080",
    },
    apiKey: {
      label: "API Key",
      help: "Fish Audio cloud API key. Not required for self-hosted servers.",
      sensitive: true,
      placeholder: "fish_...",
    },
    model: {
      label: "Model",
      help: 'TTS model to use. "speech-1.6" or "s1" for Fish Audio cloud.',
      placeholder: "speech-1.6",
    },
    referenceId: {
      label: "Voice Reference ID",
      help: "Model ID from Fish Audio library for voice cloning.",
      advanced: true,
    },
    temperature: {
      label: "Temperature",
      help: "Controls randomness. Lower = more consistent.",
      advanced: true,
    },
    speed: {
      label: "Speed",
      help: "Speech speed multiplier (0.5x to 2.0x)",
    },
  },
};

export const plugin: OpenClawPluginDefinition = {
  id: "fish-speech",
  name: "Fish-Speech TTS",
  description: "Fish-Speech text-to-speech provider with voice cloning support",
  version: "1.0.0",

  configSchema,

  async activate(api: OpenClawPluginApi): Promise<void> {
    const { logger, pluginConfig } = api;

    logger.info("Activating Fish-Speech TTS provider");

    // Register the TTS provider
    api.registerTtsProvider(fishSpeechProvider);
    logger.info("Fish-Speech TTS provider registered");

    // Log configuration
    const config = pluginConfig as Record<string, unknown> | undefined;
    if (config?.baseUrl) {
      logger.info(`Fish-Speech configured with base URL: ${config.baseUrl}`);
    } else {
      logger.info("Fish-Speech using default base URL: http://localhost:8080");
    }
  },
};

export default plugin;

// Re-export for direct usage
export { fishSpeechProvider } from "./fish-speech-provider.js";
export type { FishSpeechConfig } from "./fish-speech-provider.js";
