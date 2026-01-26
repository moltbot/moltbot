import { z } from "zod";
import { isSafeExecutableValue } from "../infra/exec-safety.js";

export const HexColorSchema = z.string().regex(/^#?[0-9a-fA-F]{6}$/, "expected hex color (RRGGBB)");

export const ExecutableTokenSchema = z
  .string()
  .refine(isSafeExecutableValue, "expected safe executable name or path");

export const GroupPolicySchema = z.enum(["open", "disabled", "allowlist"]);

export const DmPolicySchema = z.enum(["pairing", "allowlist", "open", "disabled"]);

export const ReplyToModeSchema = z.union([z.literal("off"), z.literal("first"), z.literal("all")]);

export const MSTeamsReplyStyleSchema = z.enum(["thread", "top-level"]);

export const MarkdownTableModeSchema = z.enum(["off", "bullets", "code"]);

export const MarkdownConfigSchema = z
  .object({
    tables: MarkdownTableModeSchema.optional(),
  })
  .strict()
  .optional();

export const BlockStreamingCoalesceSchema = z
  .object({
    minChars: z.number().int().positive().optional(),
    maxChars: z.number().int().positive().optional(),
    idleMs: z.number().int().nonnegative().optional(),
  })
  .strict();

export const BlockStreamingChunkSchema = z
  .object({
    minChars: z.number().int().positive().optional(),
    maxChars: z.number().int().positive().optional(),
    breakPreference: z
      .union([z.literal("paragraph"), z.literal("newline"), z.literal("sentence")])
      .optional(),
  })
  .strict();

export const RetryConfigSchema = z
  .object({
    attempts: z.number().int().min(1).optional(),
    minDelayMs: z.number().int().min(0).optional(),
    maxDelayMs: z.number().int().min(0).optional(),
    jitter: z.number().min(0).max(1).optional(),
  })
  .strict()
  .optional();

export const ToolPolicySchema = z
  .object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  })
  .strict()
  .optional();

export const TtsProviderSchema = z.enum(["elevenlabs", "openai"]);
export const TtsModeSchema = z.enum(["final", "all"]);
export const TtsConfigSchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: TtsModeSchema.optional(),
    provider: TtsProviderSchema.optional(),
    summaryModel: z.string().optional(),
    modelOverrides: z
      .object({
        enabled: z.boolean().optional(),
        allowText: z.boolean().optional(),
        allowProvider: z.boolean().optional(),
        allowVoice: z.boolean().optional(),
        allowModelId: z.boolean().optional(),
        allowVoiceSettings: z.boolean().optional(),
        allowNormalization: z.boolean().optional(),
        allowSeed: z.boolean().optional(),
      })
      .strict()
      .optional(),
    elevenlabs: z
      .object({
        apiKey: z.string().optional(),
        baseUrl: z.string().optional(),
        voiceId: z.string().optional(),
        modelId: z.string().optional(),
        seed: z.number().int().min(0).max(4294967295).optional(),
        applyTextNormalization: z.enum(["auto", "on", "off"]).optional(),
        languageCode: z.string().optional(),
        voiceSettings: z
          .object({
            stability: z.number().min(0).max(1).optional(),
            similarityBoost: z.number().min(0).max(1).optional(),
            style: z.number().min(0).max(1).optional(),
            useSpeakerBoost: z.boolean().optional(),
            speed: z.number().min(0.5).max(2).optional(),
          })
          .strict()
          .optional(),
      })
      .strict()
      .optional(),
    openai: z
      .object({
        apiKey: z.string().optional(),
        model: z.string().optional(),
        voice: z.string().optional(),
      })
      .strict()
      .optional(),
    prefsPath: z.string().optional(),
    maxTextLength: z.number().int().min(1).optional(),
    timeoutMs: z.number().int().min(1000).max(120000).optional(),
  })
  .strict()
  .optional();

export const ValyuConfigSchema = z
  .object({
    apiKey: z.string().optional(),
    baseUrl: z.string().optional(),
    maxResults: z.number().int().positive().optional(),
    searchType: z.union([z.literal("all"), z.literal("web"), z.literal("proprietary")]).optional(),
    deepSearch: z.boolean().optional(),
  })
  .strict()
  .optional();

export const NativeCommandsSettingSchema = z.union([z.boolean(), z.literal("auto")]);

export const ProviderCommandsSchema = z
  .object({
    native: NativeCommandsSettingSchema.optional(),
    nativeSkills: NativeCommandsSettingSchema.optional(),
  })
  .strict()
  .optional();
