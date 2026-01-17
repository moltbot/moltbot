import { createSubsystemLogger } from "../logging.js";
import { getBuiltinProviders } from "./builtin-providers.js";
import { loadClawdbotPlugins, type PluginLoadOptions } from "./loader.js";
import type { ProviderPlugin } from "./types.js";

const log = createSubsystemLogger("plugins");

export function resolvePluginProviders(params: {
  config?: PluginLoadOptions["config"];
  workspaceDir?: string;
}): ProviderPlugin[] {
  const registry = loadClawdbotPlugins({
    config: params.config,
    workspaceDir: params.workspaceDir,
    logger: {
      info: (msg) => log.info(msg),
      warn: (msg) => log.warn(msg),
      error: (msg) => log.error(msg),
      debug: (msg) => log.debug(msg),
    },
  });

  const pluginProviders = registry.providers.map((entry) => entry.provider);
  const builtins = getBuiltinProviders();
  const byId = new Map<string, ProviderPlugin>();
  for (const provider of [...builtins, ...pluginProviders]) {
    byId.set(provider.id, provider);
  }
  return Array.from(byId.values());
}
