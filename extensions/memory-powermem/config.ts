/**
 * PowerMem memory plugin configuration.
 * Validates baseUrl, optional apiKey, and user/agent mapping.
 */

function assertAllowedKeys(
  value: Record<string, unknown>,
  allowed: string[],
  label: string,
) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length === 0) return;
  throw new Error(`${label} has unknown keys: ${unknown.join(", ")}`);
}

function resolveEnvVars(value: string): string {
  return value.replace(/\$\{([^}]+)\}/g, (_, envVar) => {
    const envValue = process.env[envVar];
    if (!envValue) {
      throw new Error(`Environment variable ${envVar} is not set`);
    }
    return envValue;
  });
}

export type PowerMemConfig = {
  baseUrl: string;
  apiKey?: string;
  userId?: string;
  agentId?: string;
  autoCapture: boolean;
  autoRecall: boolean;
  inferOnAdd: boolean;
};

const ALLOWED_KEYS = [
  "baseUrl",
  "apiKey",
  "userId",
  "agentId",
  "autoCapture",
  "autoRecall",
  "inferOnAdd",
] as const;

export const powerMemConfigSchema = {
  parse(value: unknown): PowerMemConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("memory-powermem config required");
    }
    const cfg = value as Record<string, unknown>;
    assertAllowedKeys(cfg, [...ALLOWED_KEYS], "memory-powermem config");

    const baseUrlRaw = cfg.baseUrl;
    if (typeof baseUrlRaw !== "string" || !baseUrlRaw.trim()) {
      throw new Error("memory-powermem baseUrl is required");
    }
    const baseUrl = resolveEnvVars(baseUrlRaw.trim()).replace(/\/+$/, "");

    const apiKeyRaw = cfg.apiKey;
    const apiKey =
      typeof apiKeyRaw === "string" && apiKeyRaw.trim()
        ? resolveEnvVars(apiKeyRaw.trim())
        : undefined;

    return {
      baseUrl,
      apiKey,
      userId:
        typeof cfg.userId === "string" && cfg.userId.trim()
          ? cfg.userId.trim()
          : undefined,
      agentId:
        typeof cfg.agentId === "string" && cfg.agentId.trim()
          ? cfg.agentId.trim()
          : undefined,
      autoCapture: cfg.autoCapture !== false,
      autoRecall: cfg.autoRecall !== false,
      inferOnAdd: cfg.inferOnAdd !== false,
    };
  },
};

/** Default user/agent IDs when not configured (single-tenant style). */
export const DEFAULT_USER_ID = "moltbot-user";
export const DEFAULT_AGENT_ID = "moltbot-agent";

export function resolveUserId(cfg: PowerMemConfig): string {
  return cfg.userId ?? DEFAULT_USER_ID;
}

export function resolveAgentId(cfg: PowerMemConfig): string {
  return cfg.agentId ?? DEFAULT_AGENT_ID;
}
