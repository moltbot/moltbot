import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { cursorAgentPlugin } from "./src/plugin.js";
import { setCursorAgentRuntime } from "./src/runtime.js";

export { monitorCursorAgentProvider } from "./src/monitor.js";

const plugin = {
  id: "cursor-agent",
  name: "Cursor Agent",
  description: "Cursor Agent integration for OpenClaw",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setCursorAgentRuntime(api.runtime);
    api.registerChannel({ plugin: cursorAgentPlugin as any });
  },
};

export default plugin;
