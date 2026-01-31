/**
 * Secret environment injection.
 *
 * Provides secrets as environment variables for command execution.
 * The key security property: values are injected into the subprocess env,
 * but never appear in the command string or model context.
 */

import type { OpenClawConfig } from "../config/types.js";
import { listSecrets, loadSecretsStore } from "./store.js";
import type { SecretMetadata, SecretsConfig } from "./types.js";

/**
 * Get environment variables for secrets based on config.
 *
 * @param config - OpenClaw config (for secrets.available filtering)
 * @returns Record of env var name → secret value
 */
export function getSecretsEnvVars(config?: OpenClawConfig): Record<string, string> {
  const secretsConfig = config?.secrets as SecretsConfig | undefined;
  const store = loadSecretsStore();
  const prefix = secretsConfig?.envPrefix ?? "";
  const available = secretsConfig?.available;

  const envVars: Record<string, string> = {};

  for (const [name, entry] of Object.entries(store.secrets)) {
    // If available list is specified, only include those secrets
    if (available && !available.includes(name)) {
      continue;
    }
    const envName = `${prefix}${name}`;
    envVars[envName] = entry.value;
  }

  return envVars;
}

/**
 * Get list of available secret names for system prompt injection.
 *
 * @param config - OpenClaw config (for secrets.available filtering)
 * @returns Array of secret metadata (names + descriptions, NO values)
 */
export function getAvailableSecretsForPrompt(config?: OpenClawConfig): SecretMetadata[] {
  const secretsConfig = config?.secrets as SecretsConfig | undefined;

  // If prompt injection is disabled, return empty
  if (secretsConfig?.injectToPrompt === false) {
    return [];
  }

  const available = secretsConfig?.available;
  const prefix = secretsConfig?.envPrefix ?? "";
  const allSecrets = listSecrets();

  return allSecrets
    .filter((s) => !available || available.includes(s.name))
    .map((s) => ({
      ...s,
      name: `${prefix}${s.name}`, // Include prefix in the name shown to agent
    }));
}

/**
 * Format secrets for system prompt injection.
 *
 * @param config - OpenClaw config
 * @returns Formatted string for system prompt, or empty string if no secrets
 */
export function formatSecretsForPrompt(config?: OpenClawConfig): string {
  const secrets = getAvailableSecretsForPrompt(config);

  if (secrets.length === 0) {
    return "";
  }

  const lines = [
    "## Available Secret Environment Variables",
    "",
    "The following secrets are available as environment variables for use in commands.",
    "Use them directly (e.g., `$GITHUB_TOKEN`). Never echo, print, or log their values.",
    "",
  ];

  for (const secret of secrets) {
    if (secret.description) {
      lines.push(`- \`$${secret.name}\` — ${secret.description}`);
    } else {
      lines.push(`- \`$${secret.name}\``);
    }
  }

  lines.push("");

  return lines.join("\n");
}

/**
 * Merge secrets into an existing env object for subprocess execution.
 *
 * @param baseEnv - Base environment (e.g., process.env)
 * @param config - OpenClaw config
 * @returns Merged environment with secrets injected
 */
export function mergeSecretsIntoEnv(
  baseEnv: Record<string, string | undefined>,
  config?: OpenClawConfig,
): Record<string, string | undefined> {
  const secretsEnv = getSecretsEnvVars(config);
  return {
    ...baseEnv,
    ...secretsEnv,
  };
}
