import type { OpenClawConfig } from "../config/config.js";
import type { MemoryIndexManager } from "./manager.js";
import type { CogneeMemoryProvider } from "./cognee-provider.js";
import { resolveMemorySearchConfig } from "../agents/memory-search.js";

export type MemorySearchManagerResult = {
  manager: MemoryIndexManager | CogneeMemoryProvider | null;
  error?: string;
};

export async function getMemorySearchManager(params: {
  cfg: OpenClawConfig;
  agentId: string;
}): Promise<MemorySearchManagerResult> {
  try {
    const config = resolveMemorySearchConfig(params.cfg, params.agentId);
    if (!config) {
      return { manager: null, error: "Memory search is disabled" };
    }

    // Route to Cognee provider if configured
    if (config.provider === "cognee") {
      const { createCogneeProvider } = await import("./cognee-provider.js");
      const manager = await createCogneeProvider(
        params.cfg,
        params.agentId,
        config.sources as Array<"memory" | "sessions">,
        config.cognee || {},
      );
      return { manager };
    }

    // Default to SQLite-based memory manager
    const { MemoryIndexManager } = await import("./manager.js");
    const manager = await MemoryIndexManager.get(params);
    return { manager };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { manager: null, error: message };
  }
}
