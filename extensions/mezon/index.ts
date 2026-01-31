import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

import { mezonPlugin } from "./src/channel.js";
import { setMezonRuntime } from "./src/runtime.js";

const plugin = {
  id: "mezon",
  name: "Mezon",
  description: "Mezon channel plugin",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setMezonRuntime(api.runtime);
    api.registerChannel({ plugin: mezonPlugin });
  },
};

export default plugin;
