/**
 * Configuration for user secrets.
 *
 * Secrets are stored separately in ~/.openclaw/secrets.json.
 * This config controls which secrets are exposed to agents and how.
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
