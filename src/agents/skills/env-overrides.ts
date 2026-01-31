import type { OpenClawConfig } from "../../config/config.js";
import {
  ensureAuthProfileStore,
  listProfilesForProvider,
  type AuthProfileStore,
} from "../auth-profiles.js";
import { resolveSkillConfig } from "./config.js";
import { resolveSkillKey } from "./frontmatter.js";
import type { SkillEntry, SkillSnapshot } from "./types.js";

/**
 * Maps environment variable names to their corresponding provider IDs.
 * Used to resolve API keys from auth profiles when env vars are not set.
 */
const ENV_VAR_TO_PROVIDER: Record<string, string> = {
  OPENAI_API_KEY: "openai",
  ANTHROPIC_API_KEY: "anthropic",
  GEMINI_API_KEY: "google",
  GROQ_API_KEY: "groq",
  DEEPGRAM_API_KEY: "deepgram",
  CEREBRAS_API_KEY: "cerebras",
  XAI_API_KEY: "xai",
  OPENROUTER_API_KEY: "openrouter",
  MINIMAX_API_KEY: "minimax",
  MISTRAL_API_KEY: "mistral",
  BRAVE_API_KEY: "brave",
};

/**
 * Synchronously resolve an API key from auth profiles for a given env var.
 * Only works for api_key type credentials (not OAuth which requires async refresh).
 */
function resolveEnvFromAuthProfileSync(
  envKey: string,
  store: AuthProfileStore,
): string | undefined {
  const provider = ENV_VAR_TO_PROVIDER[envKey];
  if (!provider) {
    return undefined;
  }
  const profileIds = listProfilesForProvider(store, provider);
  for (const profileId of profileIds) {
    const cred = store.profiles[profileId];
    if (cred?.type === "api_key" && cred.key) {
      return cred.key;
    }
    // For token credentials, use the token as the API key
    if (cred?.type === "token" && cred.token) {
      return cred.token;
    }
  }
  return undefined;
}

export function applySkillEnvOverrides(params: {
  skills: SkillEntry[];
  config?: OpenClawConfig;
  agentDir?: string;
}) {
  const { skills, config, agentDir } = params;
  const updates: Array<{ key: string; prev: string | undefined }> = [];

  // Load auth profile store once for all skills
  let authStore: AuthProfileStore | undefined;
  try {
    authStore = agentDir
      ? ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false })
      : undefined;
  } catch {
    // Auth store not available
  }

  for (const entry of skills) {
    const skillKey = resolveSkillKey(entry.skill, entry);
    const skillConfig = resolveSkillConfig(config, skillKey);

    // Check skill-specific env config
    if (skillConfig?.env) {
      for (const [envKey, envValue] of Object.entries(skillConfig.env)) {
        if (!envValue || process.env[envKey]) {
          continue;
        }
        updates.push({ key: envKey, prev: process.env[envKey] });
        process.env[envKey] = envValue;
      }
    }

    // Check skill-specific apiKey config
    const primaryEnv = entry.metadata?.primaryEnv;
    if (primaryEnv && skillConfig?.apiKey && !process.env[primaryEnv]) {
      updates.push({ key: primaryEnv, prev: process.env[primaryEnv] });
      process.env[primaryEnv] = skillConfig.apiKey;
    }

    // Check auth profiles for required env vars that aren't set
    const requiredEnv = entry.metadata?.requires?.env ?? [];
    if (authStore) {
      for (const envKey of requiredEnv) {
        if (process.env[envKey]) {
          continue;
        }
        const apiKey = resolveEnvFromAuthProfileSync(envKey, authStore);
        if (apiKey) {
          updates.push({ key: envKey, prev: process.env[envKey] });
          process.env[envKey] = apiKey;
        }
      }
    }
  }

  return () => {
    for (const update of updates) {
      if (update.prev === undefined) {
        delete process.env[update.key];
      } else {
        process.env[update.key] = update.prev;
      }
    }
  };
}

export function applySkillEnvOverridesFromSnapshot(params: {
  snapshot?: SkillSnapshot;
  config?: OpenClawConfig;
  agentDir?: string;
}) {
  const { snapshot, config, agentDir } = params;
  if (!snapshot) {
    return () => {};
  }
  const updates: Array<{ key: string; prev: string | undefined }> = [];

  // Load auth profile store once for all skills
  let authStore: AuthProfileStore | undefined;
  try {
    authStore = agentDir
      ? ensureAuthProfileStore(agentDir, { allowKeychainPrompt: false })
      : undefined;
  } catch {
    // Auth store not available
  }

  for (const skill of snapshot.skills) {
    const skillConfig = resolveSkillConfig(config, skill.name);

    // Check skill-specific env config
    if (skillConfig?.env) {
      for (const [envKey, envValue] of Object.entries(skillConfig.env)) {
        if (!envValue || process.env[envKey]) {
          continue;
        }
        updates.push({ key: envKey, prev: process.env[envKey] });
        process.env[envKey] = envValue;
      }
    }

    // Check skill-specific apiKey config
    if (skill.primaryEnv && skillConfig?.apiKey && !process.env[skill.primaryEnv]) {
      updates.push({
        key: skill.primaryEnv,
        prev: process.env[skill.primaryEnv],
      });
      process.env[skill.primaryEnv] = skillConfig.apiKey;
    }

    // Check auth profiles for primaryEnv if not set
    if (skill.primaryEnv && !process.env[skill.primaryEnv] && authStore) {
      const apiKey = resolveEnvFromAuthProfileSync(skill.primaryEnv, authStore);
      if (apiKey) {
        updates.push({
          key: skill.primaryEnv,
          prev: process.env[skill.primaryEnv],
        });
        process.env[skill.primaryEnv] = apiKey;
      }
    }
  }

  return () => {
    for (const update of updates) {
      if (update.prev === undefined) {
        delete process.env[update.key];
      } else {
        process.env[update.key] = update.prev;
      }
    }
  };
}
