import type { OpenClawConfig } from "../../config/types.js";
import type { HipocapConfig } from "./types.js";

export function getHipocapConfig(moltbotConfig?: OpenClawConfig): HipocapConfig {
  const config = moltbotConfig?.hipocap;
  return {
    enabled: config?.enabled ?? process.env.HIPOCAP_ENABLED === "true",
    apiKey: config?.apiKey ?? (process.env.HIPOCAP_API_KEY || ""),
    userId: config?.userId ?? (process.env.HIPOCAP_USER_ID || "default-user"),
    serverUrl: config?.serverUrl ?? (process.env.HIPOCAP_SERVER_URL || "http://127.0.0.1:8006"),
    observabilityUrl:
      config?.observabilityUrl ??
      (process.env.HIPOCAP_OBS_BASE_URL ||
        process.env.HIPOCAP_OBSERVABILITY_URL ||
        "http://127.0.0.1:8000"),
    httpPort:
      config?.httpPort ??
      (process.env.HIPOCAP_OBS_HTTP_PORT ? parseInt(process.env.HIPOCAP_OBS_HTTP_PORT) : 8000),
    grpcPort:
      config?.grpcPort ??
      (process.env.HIPOCAP_OBS_GRPC_PORT ? parseInt(process.env.HIPOCAP_OBS_GRPC_PORT) : 8001),
    defaultPolicy: config?.defaultPolicy ?? (process.env.HIPOCAP_DEFAULT_POLICY || "default"),
    defaultShield: config?.defaultShield ?? (process.env.HIPOCAP_DEFAULT_SHIELD || "jailbreak"),
    fastMode: config?.fastMode ?? process.env.HIPOCAP_FAST_MODE !== "false", // Default to true
  };
}

export function validateConfig(config: HipocapConfig): { valid: boolean; error?: string } {
  if (config.enabled) {
    if (!config.apiKey) return { valid: false, error: "HIPOCAP_API_KEY is missing" };
    if (!config.serverUrl) return { valid: false, error: "HIPOCAP_SERVER_URL is missing" };
  }
  return { valid: true };
}
