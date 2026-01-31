/**
 * User secrets for agent tool use.
 *
 * Secrets are stored separately from auth profiles (which are for model providers).
 * These are user-defined secrets that agents can use in commands via env vars.
 *
 * Key principle: secret VALUES never enter model context. Only NAMES are exposed.
 * The agent writes commands using $SECRET_NAME, and the value is injected at exec time.
 */

export type SecretEntry = {
  /** The secret value (never logged, never sent to model). */
  value: string;
  /** Optional description shown to the agent. */
  description?: string;
  /** ISO timestamp when the secret was created. */
  createdAt: string;
  /** ISO timestamp when the secret was last updated. */
  updatedAt: string;
};

export type SecretsStore = {
  version: number;
  /** Map of secret name → secret entry. Names should be UPPER_SNAKE_CASE. */
  secrets: Record<string, SecretEntry>;
};

export type SecretMetadata = {
  name: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
};

/**
 * Config section for secrets (in openclaw.json).
 * Controls which secrets are exposed to the agent as env vars.
 */
export type SecretsConfig = {
  /**
   * List of secret names to expose to the agent.
   * If not set, all secrets are exposed.
   * Use this to limit which secrets a specific agent can access.
   */
  available?: string[];

  /**
   * If true, inject secrets into system prompt as available env vars.
   * Default: true
   */
  injectToPrompt?: boolean;

  /**
   * Prefix for env var names when injecting.
   * E.g., prefix "OPENCLAW_" means GITHUB_TOKEN becomes $OPENCLAW_GITHUB_TOKEN
   * Default: no prefix (secret name used as-is)
   */
  envPrefix?: string;
};

export const SECRETS_STORE_VERSION = 1;
