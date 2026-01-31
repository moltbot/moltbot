import type { ModelDefinitionConfig } from "../config/types.js";

export const FIRMWARE_BASE_URL = "https://app.firmware.ai/api/v1";
export const FIRMWARE_DEFAULT_COST = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
};

export const FIRMWARE_MODEL_CATALOG = [
  // OpenAI models
  {
    id: "gpt-5.2",
    name: "GPT-5.2",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 400_000,
    maxTokens: 128_000,
  },
  {
    id: "gpt-5",
    name: "GPT-5",
    reasoning: true,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 128_000,
  },
  {
    id: "gpt-5-mini",
    name: "GPT-5 Mini",
    reasoning: true,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 128_000,
  },
  {
    id: "gpt-5-nano",
    name: "GPT-5 Nano",
    reasoning: true,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 128_000,
  },
  {
    id: "gpt-4o",
    name: "GPT-4o",
    reasoning: false,
    input: ["text", "image"],
    contextWindow: 128_000,
    maxTokens: 16_384,
  },
  {
    id: "gpt-oss-120b",
    name: "GPT OSS 120B (Cerebras)",
    reasoning: true,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 128_000,
  },
  // Anthropic models
  {
    id: "claude-opus-4-5",
    name: "Claude Opus 4.5",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 200_000,
    maxTokens: 64_000,
  },
  {
    id: "claude-sonnet-4-5",
    name: "Claude Sonnet 4.5",
    reasoning: true,
    input: ["text"],
    contextWindow: 200_000,
    maxTokens: 64_000,
  },
  {
    id: "claude-haiku-4-5",
    name: "Claude Haiku 4.5",
    reasoning: true,
    input: ["text"],
    contextWindow: 200_000,
    maxTokens: 64_000,
  },
  // Google models
  {
    id: "gemini-3-pro-preview",
    name: "Gemini 3 Pro Preview",
    reasoning: true,
    input: ["text"],
    contextWindow: 1_000_000,
    maxTokens: 65_536,
  },
  {
    id: "gemini-3-flash-preview",
    name: "Gemini 3 Flash Preview",
    reasoning: true,
    input: ["text"],
    contextWindow: 1_000_000,
    maxTokens: 65_536,
  },
  {
    id: "gemini-2.5-pro",
    name: "Gemini 2.5 Pro",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_048_576,
    maxTokens: 65_536,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    reasoning: true,
    input: ["text", "image"],
    contextWindow: 1_000_000,
    maxTokens: 65_536,
  },
  // xAI models
  {
    id: "grok-4-fast-reasoning",
    name: "Grok 4 Fast (Reasoning)",
    reasoning: true,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 128_000,
  },
  {
    id: "grok-4-fast-non-reasoning",
    name: "Grok 4 Fast (Non-Reasoning)",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 128_000,
  },
  {
    id: "grok-code-fast-1",
    name: "Grok Code Fast 1",
    reasoning: true,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 128_000,
  },
  // DeepSeek models
  {
    id: "deepseek-reasoner",
    name: "DeepSeek Reasoner",
    reasoning: true,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 65_536,
  },
  {
    id: "deepseek-chat",
    name: "DeepSeek Chat",
    reasoning: false,
    input: ["text"],
    contextWindow: 128_000,
    maxTokens: 128_000,
  },
] as const;

export type FirmwareCatalogEntry = (typeof FIRMWARE_MODEL_CATALOG)[number];

export function buildFirmwareModelDefinition(entry: FirmwareCatalogEntry): ModelDefinitionConfig {
  return {
    id: entry.id,
    name: entry.name,
    reasoning: entry.reasoning,
    input: [...entry.input],
    cost: FIRMWARE_DEFAULT_COST,
    contextWindow: entry.contextWindow,
    maxTokens: entry.maxTokens,
  };
}
