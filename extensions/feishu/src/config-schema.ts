import { z } from "zod";
import { DmPolicySchema, GroupPolicySchema, requireOpenAllowFrom } from "clawdbot/plugin-sdk";

const StringListSchema = z.array(z.union([z.string(), z.number()])).optional();

export const FeishuDmSchema = z
  .object({
    enabled: z.boolean().optional(),
    policy: DmPolicySchema.optional().default("pairing"),
    allowFrom: StringListSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    requireOpenAllowFrom({
      policy: value.policy,
      allowFrom: value.allowFrom,
      ctx,
      path: ["allowFrom"],
      message:
        'channels.feishu.dm.policy="open" requires channels.feishu.dm.allowFrom to include "*"',
    });
  });

export const FeishuGroupSchema = z
  .object({
    enabled: z.boolean().optional(),
    allow: z.boolean().optional(),
    requireMention: z.boolean().optional(),
    users: StringListSchema,
    systemPrompt: z.string().optional(),
  })
  .strict();

export const FeishuAccountSchema = z
  .object({
    name: z.string().optional(),
    enabled: z.boolean().optional(),
    appId: z.string().optional(),
    appSecret: z.string().optional(),
    verificationToken: z.string().optional(),
    encryptKey: z.string().optional(),
    webhookPath: z.string().optional(),
    webhookUrl: z.string().optional(),
    requireMention: z.boolean().optional(),
    groupPolicy: GroupPolicySchema.optional().default("allowlist"),
    groupAllowFrom: StringListSchema,
    groups: z.record(z.string(), FeishuGroupSchema.optional()).optional(),
    dm: FeishuDmSchema.optional(),
    textChunkLimit: z.number().int().positive().optional(),
    chunkMode: z.enum(["length", "newline"]).optional(),
    blockStreaming: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const appId = value.appId?.trim();
    const appSecret = value.appSecret?.trim();
    if (appId && !appSecret) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "appSecret is required when appId is set",
        path: ["appSecret"],
      });
    }
    if (appSecret && !appId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "appId is required when appSecret is set",
        path: ["appId"],
      });
    }
    const verificationToken = value.verificationToken?.trim();
    const encryptKey = value.encryptKey?.trim();
    if ((appId || appSecret) && !verificationToken && !encryptKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "verificationToken or encryptKey is required for webhook validation",
        path: ["verificationToken"],
      });
    }
  });

export const FeishuConfigSchema = FeishuAccountSchema.extend({
  accounts: z.record(z.string(), FeishuAccountSchema.optional()).optional(),
  defaultAccount: z.string().optional(),
});
