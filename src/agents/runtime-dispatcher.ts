import type { RunEmbeddedPiAgentParams } from "./pi-embedded-runner/run/params.js";
import { runEmbeddedPiAgent } from "./pi-embedded-runner/run.js";
import type { EmbeddedPiRunResult } from "./pi-embedded-runner/types.js";

/**
 * Thin dispatcher for agent runs. Currently delegates to the Pi agent
 * runtime. Exists as a stable import target so callers (e.g. title-http)
 * don't couple directly to the Pi runner internals.
 */
export async function runAgent(params: RunEmbeddedPiAgentParams): Promise<EmbeddedPiRunResult> {
  return runEmbeddedPiAgent(params);
}
