/**
 * OpenClaw Cursor MCP Plugin
 *
 * This plugin integrates OpenClaw with Cursor IDE through the Model Context Protocol (MCP).
 * It allows Cursor to use OpenClaw as an AI backend and provides tools for managing
 * conversations, sessions, and messaging channels.
 *
 * Usage in Cursor:
 * 1. Add to Cursor's MCP configuration (~/.cursor/mcp.json or Cursor Settings > Features > MCP)
 * 2. Use the openclaw_* tools in Cursor's Composer Agent
 *
 * Configuration example for mcp.json:
 * {
 *   "mcpServers": {
 *     "openclaw": {
 *       "command": "openclaw",
 *       "args": ["mcp", "serve"],
 *       "env": {
 *         "OPENCLAW_GATEWAY_URL": "ws://127.0.0.1:18789",
 *         "OPENCLAW_GATEWAY_TOKEN": "your-token"
 *       }
 *     }
 *   }
 * }
 */

import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";

export type CursorMcpPluginConfig = {
  enabled?: boolean;
  port?: number;
  autoApproveTools?: string[];
};

const cursorMcpPlugin = {
  id: "cursor-mcp",
  name: "Cursor MCP Server",
  description: "MCP server integration for Cursor IDE - enables OpenClaw as an AI agent in Cursor",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    // Register the CLI command for starting the MCP server
    api.registerCli(
      async (ctx) => {
        const mcpCommand = ctx.program
          .command("mcp")
          .description("MCP server for IDE integration");

        mcpCommand
          .command("serve")
          .description("Start the MCP server for Cursor IDE integration")
          .option("--url <url>", "Gateway WebSocket URL", "ws://127.0.0.1:18789")
          .option("--token <token>", "Gateway auth token")
          .option("--password <password>", "Gateway auth password")
          .option("--session <key>", "Default session key", "agent:main:cursor")
          .action(async (opts) => {
            // Dynamic import to avoid loading MCP SDK unless needed
            const { OpenClawMcpServer } = await import("./src/server.js");

            const server = new OpenClawMcpServer({
              gatewayUrl: opts.url,
              gatewayToken: opts.token,
              gatewayPassword: opts.password,
              defaultSessionKey: opts.session,
            });

            process.on("SIGINT", async () => {
              await server.stop();
              process.exit(0);
            });

            process.on("SIGTERM", async () => {
              await server.stop();
              process.exit(0);
            });

            await server.start();
          });

        // Command to set up Cursor models as a provider
        mcpCommand
          .command("setup-models")
          .description("Configure OpenClaw to use Cursor's AI models via Copilot Proxy")
          .option("--url <url>", "Copilot Proxy base URL", "http://localhost:3000/v1")
          .option("--check", "Only check if proxy is running, don't configure")
          .action(async (opts) => {
            const {
              checkCursorProxyHealth,
              CURSOR_AVAILABLE_MODELS,
              CURSOR_SETUP_INSTRUCTIONS,
            } = await import("./src/cursor-models.js");

            console.log("Checking Cursor Copilot Proxy...");
            const health = await checkCursorProxyHealth(opts.url);

            if (!health.ok) {
              console.error(`\n❌ Copilot Proxy not accessible: ${health.error}`);
              console.log(CURSOR_SETUP_INSTRUCTIONS);
              process.exit(1);
            }

            console.log("✓ Copilot Proxy is running");

            if (opts.check) {
              console.log("\nAvailable models:");
              for (const model of CURSOR_AVAILABLE_MODELS) {
                console.log(`  - cursor/${model.id} (${model.name})`);
              }
              return;
            }

            // Show configuration instructions
            console.log("\nTo use Cursor models, add this to your OpenClaw config:\n");
            console.log("```yaml");
            console.log("models:");
            console.log("  providers:");
            console.log("    cursor:");
            console.log(`      baseUrl: "${opts.url}"`);
            console.log('      apiKey: "cursor-proxy"');
            console.log("      api: openai-completions");
            console.log("      authHeader: false");
            console.log("      models:");
            for (const model of CURSOR_AVAILABLE_MODELS.slice(0, 4)) {
              console.log(`        - id: ${model.id}`);
              console.log(`          name: ${model.name}`);
              console.log(`          contextWindow: ${model.contextWindow}`);
            }
            console.log("```");
            console.log("\nOr run: openclaw config set agents.defaults.model cursor/claude-sonnet-4");
            console.log("\nAvailable models:");
            for (const model of CURSOR_AVAILABLE_MODELS) {
              console.log(`  - cursor/${model.id}`);
            }
          });

        mcpCommand
          .command("info")
          .description("Show MCP server configuration information for Cursor")
          .action(() => {
            console.log(`
OpenClaw MCP Server - Cursor IDE Integration

To use OpenClaw in Cursor, add the following to your Cursor MCP configuration:

1. Open Cursor Settings > Features > MCP
2. Click "+ Add New MCP Server"
3. Configure:
   - Name: openclaw
   - Type: stdio
   - Command: openclaw mcp serve

Or manually edit ~/.cursor/mcp.json:

{
  "mcpServers": {
    "openclaw": {
      "command": "openclaw",
      "args": ["mcp", "serve"],
      "env": {
        "OPENCLAW_GATEWAY_URL": "ws://127.0.0.1:18789"
      }
    }
  }
}

Environment Variables:
- OPENCLAW_GATEWAY_URL: Gateway WebSocket URL (default: ws://127.0.0.1:18789)
- OPENCLAW_GATEWAY_TOKEN: Authentication token
- OPENCLAW_GATEWAY_PASSWORD: Authentication password
- OPENCLAW_SESSION_KEY: Default session key (default: agent:main:cursor)

Available Tools:
- openclaw_chat: Chat with the OpenClaw AI agent
- openclaw_list_sessions: List active sessions
- openclaw_get_session: Get session details
- openclaw_clear_session: Clear session history
- openclaw_execute_command: Execute OpenClaw commands
- openclaw_send_message: Send messages through channels
- openclaw_get_status: Get gateway status
- openclaw_list_models: List available models

Available Resources:
- openclaw://status: Gateway status
- openclaw://models: Available models
- openclaw://sessions: Active sessions
- openclaw://config: Configuration (sanitized)

Available Prompts:
- code_review: Review code for issues
- explain_code: Explain how code works
- generate_tests: Generate tests
- refactor_code: Suggest refactoring
- debug_help: Help debug issues
- send_notification: Send notification via channels
`);
          });
      },
      { commands: ["mcp"] },
    );
  },
};

export default cursorMcpPlugin;
