import type { PluginRuntime } from "openclaw/plugin-sdk";

let cursorAgentRuntime: PluginRuntime | null = null;

/**
 * Set the runtime environment for Cursor Agent extension.
 */
export function setCursorAgentRuntime(runtime: PluginRuntime): void {
  cursorAgentRuntime = runtime;
}

/**
 * Get the runtime environment.
 */
export function getCursorAgentRuntime(): PluginRuntime {
  if (!cursorAgentRuntime) {
    throw new Error("Cursor Agent runtime not initialized");
  }
  return cursorAgentRuntime;
}
