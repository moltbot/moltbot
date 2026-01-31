import type { PluginRuntime } from "clawdbot/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setQQRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getQQRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("QQ runtime not initialized");
  }
  return runtime;
}
