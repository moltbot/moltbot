import { z } from "zod";

export const HipocapSchema = z
  .object({
    enabled: z.boolean().optional(),
    apiKey: z.string().optional(),
    userId: z.string().optional(),
    serverUrl: z.string().optional(),
    observabilityUrl: z.string().optional(),
    httpPort: z.number().optional(),
    grpcPort: z.number().optional(),
    defaultPolicy: z.string().optional(),
    defaultShield: z.string().optional(),
    fastMode: z.boolean().optional(),
  })
  .strict()
  .optional();
