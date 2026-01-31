import { buildChannelConfigSchema } from "openclaw/plugin-sdk";
import { z } from "zod";

/**
 * Account configuration schema for Cursor Agent.
 */
export const CursorAgentAccountSchema = z.object({
  /** Whether this account is enabled */
  enabled: z.boolean().optional().default(true),
  /** Cursor API key from dashboard */
  apiKey: z.string().min(1, "API key is required"),
  /** Default GitHub repository URL */
  repository: z
    .string()
    .url()
    .refine((url) => url.includes("github.com"), {
      message: "Must be a GitHub repository URL",
    })
    .optional(),
  /** Default branch (e.g., "main") */
  branch: z.string().optional().default("main"),
  /** Webhook URL for receiving agent status updates */
  webhookUrl: z.string().url().optional(),
  /** Webhook secret for signature verification (8-256 chars) */
  webhookSecret: z.string().min(8).max(256).optional(),
  /** Default AI model to use */
  defaultModel: z.string().optional(),
  /** Default instructions prefix */
  defaultInstructions: z.string().optional(),
});

/**
 * Configuration schema for Cursor Agent channel.
 */
export const CursorAgentConfigSchema = z.object({
  accounts: z.record(z.string(), CursorAgentAccountSchema).optional(),
});

export type CursorAgentConfig = z.infer<typeof CursorAgentConfigSchema>;
export type CursorAgentAccountConfigSchema = z.infer<typeof CursorAgentAccountSchema>;

export const cursorAgentConfigSchema = buildChannelConfigSchema(CursorAgentConfigSchema);
