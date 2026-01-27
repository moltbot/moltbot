/**
 * Centralized API endpoint configuration.
 *
 * All external API base URLs with ENV variable overrides.
 * This enables routing all traffic through a proxy for:
 * - Multi-tenant deployments
 * - Usage metering and billing
 * - Security filtering
 * - Audit logging
 *
 * @example
 * ```bash
 * # Route all Telegram API calls through proxy
 * TELEGRAM_API_BASE=https://proxy.example.com/tg
 *
 * # Route all Discord API calls through proxy
 * DISCORD_API_BASE=https://proxy.example.com/dc
 * ```
 */

const trimSlash = (url: string | undefined): string | undefined =>
  url?.trim().replace(/\/+$/, "") || undefined;

// =============================================================================
// MESSAGING PLATFORMS
// =============================================================================

/**
 * Telegram Bot API base URL.
 * Default: https://api.telegram.org
 *
 * Note: This is used for all outbound Telegram API calls including:
 * - sendMessage, sendVoice, sendPhoto, etc.
 * - getFile (file downloads)
 * - setWebhook, deleteWebhook
 */
export const TELEGRAM_API_BASE =
  trimSlash(process.env.TELEGRAM_API_BASE) ?? "https://api.telegram.org";

/**
 * Discord API base URL.
 * Default: https://discord.com/api/v10
 */
export const DISCORD_API_BASE =
  trimSlash(process.env.DISCORD_API_BASE) ?? "https://discord.com/api/v10";

// =============================================================================
// LLM PROVIDERS
// =============================================================================

/**
 * OpenAI API base URL.
 * Default: https://api.openai.com/v1
 */
export const OPENAI_API_BASE =
  trimSlash(process.env.OPENAI_API_BASE) ?? "https://api.openai.com/v1";

/**
 * Anthropic API base URL.
 * Default: https://api.anthropic.com
 */
export const ANTHROPIC_API_BASE =
  trimSlash(process.env.ANTHROPIC_API_BASE) ?? "https://api.anthropic.com";

/**
 * Google Generative AI (Gemini) API base URL.
 * Default: https://generativelanguage.googleapis.com/v1beta
 */
export const GOOGLE_GENERATIVE_API_BASE =
  trimSlash(process.env.GOOGLE_GENERATIVE_API_BASE) ??
  "https://generativelanguage.googleapis.com/v1beta";

/**
 * Groq API base URL.
 * Default: https://api.groq.com/openai/v1
 */
export const GROQ_API_BASE =
  trimSlash(process.env.GROQ_API_BASE) ?? "https://api.groq.com/openai/v1";

/**
 * Deepgram API base URL.
 * Default: https://api.deepgram.com/v1
 */
export const DEEPGRAM_API_BASE =
  trimSlash(process.env.DEEPGRAM_API_BASE) ?? "https://api.deepgram.com/v1";

// =============================================================================
// TTS PROVIDERS
// =============================================================================

/**
 * OpenAI TTS API base URL.
 * Default: Same as OPENAI_API_BASE
 *
 * Note: Supports custom OpenAI-compatible TTS endpoints (e.g., Kokoro, LocalAI).
 */
export const OPENAI_TTS_BASE = trimSlash(process.env.OPENAI_TTS_BASE_URL) ?? OPENAI_API_BASE;

/**
 * ElevenLabs API base URL.
 * Default: https://api.elevenlabs.io
 */
export const ELEVENLABS_API_BASE =
  trimSlash(process.env.ELEVENLABS_API_BASE) ?? "https://api.elevenlabs.io";
