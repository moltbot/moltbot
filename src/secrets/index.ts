/**
 * Secrets module - secure storage for user secrets.
 *
 * Key principle: secret VALUES never enter model context.
 * Only secret NAMES are exposed to the agent via system prompt.
 * Values are injected as env vars at exec time.
 */

export { secretsCommand } from "./cli.js";
export {
  formatSecretsForPrompt,
  getAvailableSecretsForPrompt,
  getSecretsEnvVars,
  mergeSecretsIntoEnv,
} from "./env.js";
export {
  getSecret,
  hasSecret,
  listSecrets,
  loadSecretsStore,
  removeSecret,
  resolveSecretsPath,
  saveSecretsStore,
  setSecret,
} from "./store.js";
export type { SecretEntry, SecretMetadata, SecretsConfig, SecretsStore } from "./types.js";
