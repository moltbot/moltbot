import type { MoltbotPluginApi } from "clawdbot/plugin-sdk";
import { emptyPluginConfigSchema } from "clawdbot/plugin-sdk";
import { setGlobalDispatcher, ProxyAgent } from "undici";

// --- FORCE PROXY FOR GEMINI (If Env Var Set) ---
try {
  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  if (proxyUrl) {
    console.log(`[Feishu Plugin] Detected proxy env var, setting global proxy to: ${proxyUrl}`);
    const dispatcher = new ProxyAgent(proxyUrl);
    setGlobalDispatcher(dispatcher);
  }
} catch (err) {
  console.error(`[Feishu Plugin] Failed to set proxy: ${err}`);
}
// ------------------------------

import { feishuPlugin } from "./src/channel.js";
import { setFeishuRuntime } from "./src/runtime.js";
import { registerFeishuWebhook } from "./src/monitor.js";

const plugin = {
  id: "feishu",
  name: "Feishu (Lark)",
  description: "Feishu/Lark messaging integration",
  configSchema: emptyPluginConfigSchema(),
  register(api: MoltbotPluginApi) {
    setFeishuRuntime(api.runtime);
    api.registerChannel({ plugin: feishuPlugin });
    registerFeishuWebhook(api);
  },
};

export default plugin;
