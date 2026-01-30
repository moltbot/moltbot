// Lazy-load pi-coding-agent model metadata so we can infer context windows when
// the agent reports a model id. This includes custom models.json entries.

import { loadConfig } from "../config/config.js";
// Note: resolveOpenClawAgentDir no longer needed - AuthStorage() doesn't take agentDir in pi-agent-core 0.50.4
import { ensureOpenClawModelsJson } from "./models-config.js";

type ModelEntry = { id: string; contextWindow?: number };

const MODEL_CACHE = new Map<string, number>();
const loadPromise = (async () => {
  try {
    const { AuthStorage, ModelRegistry } = await import("@mariozechner/pi-coding-agent");
    const cfg = loadConfig();
    await ensureOpenClawModelsJson(cfg);
    // Note: agentDir no longer needed - AuthStorage() doesn't take it as parameter in pi-agent-core 0.50.4
    const authStorage = new AuthStorage();
    const modelRegistry = new ModelRegistry(authStorage);
    const models = modelRegistry.getAll() as ModelEntry[];
    for (const m of models) {
      if (!m?.id) continue;
      if (typeof m.contextWindow === "number" && m.contextWindow > 0) {
        MODEL_CACHE.set(m.id, m.contextWindow);
      }
    }
  } catch {
    // If pi-ai isn't available, leave cache empty; lookup will fall back.
  }
})();

export function lookupContextTokens(modelId?: string): number | undefined {
  if (!modelId) return undefined;
  // Best-effort: kick off loading, but don't block.
  void loadPromise;
  return MODEL_CACHE.get(modelId);
}
