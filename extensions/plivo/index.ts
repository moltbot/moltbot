/**
 * Plivo SMS Channel Extension for Clawdbot
 *
 * This extension provides SMS/MMS messaging capabilities via Plivo,
 * enabling universal phone-based access to your AI assistant.
 *
 * Features:
 * - Two-way SMS messaging
 * - MMS media support (images, videos, documents)
 * - Quick command shortcuts (e.g., "cal" -> "show my calendar")
 * - Auto-configuration of Plivo webhooks
 * - Multi-account support
 */

import { plivoPlugin } from "./src/channel.js";
import { setPlivoRuntime } from "./src/runtime.js";

// Plugin definition for Clawdbot
const plugin = {
  id: "plivo",
  name: "Plivo SMS",
  description: "SMS/MMS channel via Plivo - Universal phone access to your AI assistant",

  register(api: {
    runtime: unknown;
    registerChannel: (opts: { plugin: typeof plivoPlugin }) => void;
  }) {
    // Store runtime reference for access in adapters
    setPlivoRuntime(api.runtime);

    // Register the Plivo channel
    api.registerChannel({ plugin: plivoPlugin });
  },
};

export default plugin;

// Re-export types and utilities for external use
export { plivoPlugin } from "./src/channel.js";
export type {
  PlivoConfig,
  PlivoAccountConfig,
  PlivoResolvedAccount,
  QuickCommand,
} from "./src/types.js";
