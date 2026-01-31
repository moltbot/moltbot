#!/usr/bin/env node
/**
 * OpenClaw MCP Server for Cursor IDE Integration
 *
 * This server exposes OpenClaw functionality as an MCP server that can be used
 * within Cursor IDE. It provides tools for chatting with the OpenClaw agent,
 * managing sessions, and executing commands.
 *
 * Transport modes:
 * - stdio (default): For local process-based integration
 * - sse: For HTTP-based SSE integration (set OPENCLAW_MCP_PORT)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { McpGatewayClient } from "./gateway-client.js";
import type { CursorMcpConfig, McpToolResult } from "./types.js";

// Tool input schemas
const ChatSchema = z.object({
  message: z.string().describe("The message to send to the OpenClaw agent"),
  sessionKey: z
    .string()
    .optional()
    .describe("Session key for conversation continuity (e.g., 'agent:main:cursor')"),
  model: z.string().optional().describe("Model to use (e.g., 'anthropic/claude-sonnet-4')"),
});

const SessionKeySchema = z.object({
  sessionKey: z.string().describe("The session key to operate on"),
});

const CommandSchema = z.object({
  command: z.string().describe("The command to execute (e.g., '/status', '/help')"),
});

const SendMessageSchema = z.object({
  target: z.string().describe("Target identifier (phone number, group ID, or channel:target)"),
  message: z.string().describe("Message content to send"),
  channel: z
    .string()
    .optional()
    .describe("Channel to use (whatsapp, telegram, discord, slack, etc.)"),
});

// MCP Server implementation
export class OpenClawMcpServer {
  private server: Server;
  private gatewayClient: McpGatewayClient;
  private config: CursorMcpConfig;

  constructor(config: CursorMcpConfig = {}) {
    this.config = {
      gatewayUrl: process.env.OPENCLAW_GATEWAY_URL ?? config.gatewayUrl ?? "ws://127.0.0.1:18789",
      gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN ?? config.gatewayToken,
      gatewayPassword: process.env.OPENCLAW_GATEWAY_PASSWORD ?? config.gatewayPassword,
      defaultSessionKey: config.defaultSessionKey ?? "agent:main:cursor",
      autoApproveTools: config.autoApproveTools ?? [],
      ...config,
    };

    this.gatewayClient = new McpGatewayClient(this.config);

    this.server = new Server(
      {
        name: "openclaw-mcp",
        version: "2026.1.29",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      },
    );

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.setupToolHandlers();
    this.setupResourceHandlers();
    this.setupPromptHandlers();
  }

  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "openclaw_chat",
          description:
            "Chat with the OpenClaw AI agent. Use this to ask questions, request help with coding, or have a conversation. The agent can help with various tasks including code generation, explanations, and problem-solving.",
          inputSchema: {
            type: "object",
            properties: {
              message: {
                type: "string",
                description: "The message to send to the OpenClaw agent",
              },
              sessionKey: {
                type: "string",
                description:
                  "Session key for conversation continuity (e.g., 'agent:main:cursor'). Different session keys maintain separate conversation contexts.",
              },
              model: {
                type: "string",
                description:
                  "Model to use (e.g., 'anthropic/claude-sonnet-4', 'openai/gpt-4o'). Leave empty to use the default model.",
              },
            },
            required: ["message"],
          },
        },
        {
          name: "openclaw_list_sessions",
          description:
            "List all active OpenClaw chat sessions. Returns information about ongoing conversations including session keys, message counts, and last activity times.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "openclaw_get_session",
          description:
            "Get detailed information about a specific OpenClaw session, including conversation history summary and metadata.",
          inputSchema: {
            type: "object",
            properties: {
              sessionKey: {
                type: "string",
                description: "The session key to get information about",
              },
            },
            required: ["sessionKey"],
          },
        },
        {
          name: "openclaw_clear_session",
          description:
            "Clear a specific OpenClaw session, removing all conversation history. Use this to start fresh with a new context.",
          inputSchema: {
            type: "object",
            properties: {
              sessionKey: {
                type: "string",
                description: "The session key to clear",
              },
            },
            required: ["sessionKey"],
          },
        },
        {
          name: "openclaw_execute_command",
          description:
            "Execute an OpenClaw control command. Available commands include /status, /help, /models, /config, and more.",
          inputSchema: {
            type: "object",
            properties: {
              command: {
                type: "string",
                description:
                  "The command to execute (e.g., '/status', '/help', '/models list')",
              },
            },
            required: ["command"],
          },
        },
        {
          name: "openclaw_send_message",
          description:
            "Send a message through OpenClaw to a specific target on a messaging channel (WhatsApp, Telegram, Discord, Slack, etc.).",
          inputSchema: {
            type: "object",
            properties: {
              target: {
                type: "string",
                description:
                  "Target identifier (phone number for WhatsApp, username/chat ID for Telegram, channel ID for Discord/Slack)",
              },
              message: {
                type: "string",
                description: "Message content to send",
              },
              channel: {
                type: "string",
                description:
                  "Channel to use: whatsapp, telegram, discord, slack, imessage, signal, line, etc.",
              },
            },
            required: ["target", "message"],
          },
        },
        {
          name: "openclaw_get_status",
          description:
            "Get the current status of OpenClaw gateway, including connected channels, active sessions, and health information.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
        {
          name: "openclaw_list_models",
          description:
            "List all available AI models configured in OpenClaw. Shows provider, model ID, and capabilities.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        // Ensure gateway is connected
        if (!this.gatewayClient.isConnected()) {
          try {
            await this.gatewayClient.connect();
          } catch (err) {
            return this.errorResult(`Failed to connect to OpenClaw gateway: ${String(err)}`);
          }
        }

        switch (name) {
          case "openclaw_chat": {
            const parsed = ChatSchema.safeParse(args);
            if (!parsed.success) {
              return this.errorResult(`Invalid arguments: ${parsed.error.message}`);
            }
            const result = await this.gatewayClient.chat({
              message: parsed.data.message,
              sessionKey: parsed.data.sessionKey ?? this.config.defaultSessionKey,
              model: parsed.data.model,
              deliver: false,
            });
            return this.formatChatResult(result);
          }

          case "openclaw_list_sessions": {
            const result = await this.gatewayClient.listSessions();
            return this.formatJsonResult(result);
          }

          case "openclaw_get_session": {
            const parsed = SessionKeySchema.safeParse(args);
            if (!parsed.success) {
              return this.errorResult(`Invalid arguments: ${parsed.error.message}`);
            }
            const result = await this.gatewayClient.getSessionInfo(parsed.data.sessionKey);
            return this.formatJsonResult(result);
          }

          case "openclaw_clear_session": {
            const parsed = SessionKeySchema.safeParse(args);
            if (!parsed.success) {
              return this.errorResult(`Invalid arguments: ${parsed.error.message}`);
            }
            const result = await this.gatewayClient.clearSession(parsed.data.sessionKey);
            return this.formatJsonResult(result);
          }

          case "openclaw_execute_command": {
            const parsed = CommandSchema.safeParse(args);
            if (!parsed.success) {
              return this.errorResult(`Invalid arguments: ${parsed.error.message}`);
            }
            const result = await this.gatewayClient.executeCommand(parsed.data.command);
            return this.formatJsonResult(result);
          }

          case "openclaw_send_message": {
            const parsed = SendMessageSchema.safeParse(args);
            if (!parsed.success) {
              return this.errorResult(`Invalid arguments: ${parsed.error.message}`);
            }
            const target = parsed.data.channel
              ? `${parsed.data.channel}:${parsed.data.target}`
              : parsed.data.target;
            const result = await this.gatewayClient.request("message.send", {
              target,
              text: parsed.data.message,
            });
            return this.formatJsonResult(result);
          }

          case "openclaw_get_status": {
            const [health, channels] = await Promise.all([
              this.gatewayClient.getHealth(),
              this.gatewayClient.getChannelStatus(),
            ]);
            return this.formatJsonResult({ health, channels });
          }

          case "openclaw_list_models": {
            const result = await this.gatewayClient.getModels();
            return this.formatJsonResult(result);
          }

          default:
            return this.errorResult(`Unknown tool: ${name}`);
        }
      } catch (err) {
        return this.errorResult(`Tool execution failed: ${String(err)}`);
      }
    });
  }

  private setupResourceHandlers(): void {
    // List available resources
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => ({
      resources: [
        {
          uri: "openclaw://status",
          name: "OpenClaw Gateway Status",
          description: "Current status of the OpenClaw gateway and connected channels",
          mimeType: "application/json",
        },
        {
          uri: "openclaw://models",
          name: "Available Models",
          description: "List of AI models configured in OpenClaw",
          mimeType: "application/json",
        },
        {
          uri: "openclaw://sessions",
          name: "Active Sessions",
          description: "List of active chat sessions",
          mimeType: "application/json",
        },
        {
          uri: "openclaw://config",
          name: "OpenClaw Configuration",
          description: "Current OpenClaw configuration (sanitized, no secrets)",
          mimeType: "application/json",
        },
      ],
    }));

    // Read resource content
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      try {
        if (!this.gatewayClient.isConnected()) {
          await this.gatewayClient.connect();
        }

        switch (uri) {
          case "openclaw://status": {
            const [health, channels] = await Promise.all([
              this.gatewayClient.getHealth(),
              this.gatewayClient.getChannelStatus(),
            ]);
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify({ health, channels }, null, 2),
                },
              ],
            };
          }

          case "openclaw://models": {
            const models = await this.gatewayClient.getModels();
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(models, null, 2),
                },
              ],
            };
          }

          case "openclaw://sessions": {
            const sessions = await this.gatewayClient.listSessions();
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(sessions, null, 2),
                },
              ],
            };
          }

          case "openclaw://config": {
            const config = await this.gatewayClient.request("config.get", {});
            return {
              contents: [
                {
                  uri,
                  mimeType: "application/json",
                  text: JSON.stringify(config, null, 2),
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown resource: ${uri}`);
        }
      } catch (err) {
        return {
          contents: [
            {
              uri,
              mimeType: "text/plain",
              text: `Error reading resource: ${String(err)}`,
            },
          ],
        };
      }
    });
  }

  private setupPromptHandlers(): void {
    // List available prompts
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => ({
      prompts: [
        {
          name: "code_review",
          description: "Ask OpenClaw to review code for issues, improvements, and best practices",
          arguments: [
            {
              name: "code",
              description: "The code to review",
              required: true,
            },
            {
              name: "language",
              description: "Programming language (optional, will be auto-detected)",
              required: false,
            },
          ],
        },
        {
          name: "explain_code",
          description: "Ask OpenClaw to explain how code works",
          arguments: [
            {
              name: "code",
              description: "The code to explain",
              required: true,
            },
          ],
        },
        {
          name: "generate_tests",
          description: "Ask OpenClaw to generate tests for code",
          arguments: [
            {
              name: "code",
              description: "The code to generate tests for",
              required: true,
            },
            {
              name: "framework",
              description: "Testing framework to use (e.g., jest, pytest, vitest)",
              required: false,
            },
          ],
        },
        {
          name: "refactor_code",
          description: "Ask OpenClaw to suggest refactoring improvements",
          arguments: [
            {
              name: "code",
              description: "The code to refactor",
              required: true,
            },
            {
              name: "goal",
              description: "Refactoring goal (e.g., 'improve readability', 'optimize performance')",
              required: false,
            },
          ],
        },
        {
          name: "debug_help",
          description: "Ask OpenClaw to help debug an issue",
          arguments: [
            {
              name: "code",
              description: "The code with the issue",
              required: true,
            },
            {
              name: "error",
              description: "Error message or description of the problem",
              required: true,
            },
          ],
        },
        {
          name: "send_notification",
          description: "Send a notification message through OpenClaw channels",
          arguments: [
            {
              name: "message",
              description: "The notification message to send",
              required: true,
            },
            {
              name: "channel",
              description: "Channel to use (whatsapp, telegram, discord, slack)",
              required: false,
            },
          ],
        },
      ],
    }));

    // Get prompt content
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      switch (name) {
        case "code_review": {
          const code = args?.code ?? "";
          const language = args?.language ?? "";
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Please review the following${language ? ` ${language}` : ""} code for:
- Bugs and potential issues
- Code quality and readability
- Performance considerations
- Security concerns
- Best practices and improvements

Code to review:
\`\`\`${language}
${code}
\`\`\``,
                },
              },
            ],
          };
        }

        case "explain_code": {
          const code = args?.code ?? "";
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Please explain how the following code works, step by step:

\`\`\`
${code}
\`\`\`

Include:
- What the code does overall
- Key components and their purposes
- Control flow and logic
- Any important patterns or techniques used`,
                },
              },
            ],
          };
        }

        case "generate_tests": {
          const code = args?.code ?? "";
          const framework = args?.framework ?? "";
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Please generate comprehensive tests for the following code${framework ? ` using ${framework}` : ""}:

\`\`\`
${code}
\`\`\`

Include:
- Unit tests for individual functions/methods
- Edge cases and boundary conditions
- Error handling scenarios
- Mock/stub setup where needed`,
                },
              },
            ],
          };
        }

        case "refactor_code": {
          const code = args?.code ?? "";
          const goal = args?.goal ?? "improve code quality";
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Please refactor the following code to ${goal}:

\`\`\`
${code}
\`\`\`

Provide:
- The refactored code
- Explanation of changes made
- Benefits of the refactoring`,
                },
              },
            ],
          };
        }

        case "debug_help": {
          const code = args?.code ?? "";
          const error = args?.error ?? "";
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `I'm encountering an issue with this code:

\`\`\`
${code}
\`\`\`

Error/Problem:
${error}

Please help me:
1. Identify the root cause
2. Explain why this is happening
3. Provide a fix with explanation`,
                },
              },
            ],
          };
        }

        case "send_notification": {
          const message = args?.message ?? "";
          const channel = args?.channel ?? "default";
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Please send this notification through OpenClaw${channel !== "default" ? ` via ${channel}` : ""}:

"${message}"

Use the openclaw_send_message tool if a specific target is configured, or inform me that I need to specify a target.`,
                },
              },
            ],
          };
        }

        default:
          return {
            messages: [
              {
                role: "user",
                content: {
                  type: "text",
                  text: `Unknown prompt: ${name}`,
                },
              },
            ],
          };
      }
    });
  }

  private formatChatResult(result: unknown): McpToolResult {
    if (!result || typeof result !== "object") {
      return {
        content: [{ type: "text", text: "No response from OpenClaw agent" }],
      };
    }

    const response = result as { payloads?: Array<{ text?: string }>; error?: string };

    if (response.error) {
      return this.errorResult(response.error);
    }

    const payloads = response.payloads;
    if (!Array.isArray(payloads) || payloads.length === 0) {
      return {
        content: [{ type: "text", text: "No response from OpenClaw agent" }],
      };
    }

    const text = payloads
      .map((p) => (typeof p.text === "string" ? p.text : ""))
      .filter(Boolean)
      .join("\n\n");

    return {
      content: [{ type: "text", text: text || "No response from OpenClaw agent" }],
    };
  }

  private formatJsonResult(result: unknown): McpToolResult {
    return {
      content: [
        {
          type: "text",
          text: typeof result === "string" ? result : JSON.stringify(result, null, 2),
        },
      ],
    };
  }

  private errorResult(message: string): McpToolResult {
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }

  async start(): Promise<void> {
    // Connect to gateway
    try {
      await this.gatewayClient.connect();
      console.error("[openclaw-mcp] Connected to OpenClaw gateway");
    } catch (err) {
      console.error(`[openclaw-mcp] Warning: Could not connect to gateway: ${String(err)}`);
      console.error("[openclaw-mcp] Will attempt to connect when tools are called");
    }

    // Start stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[openclaw-mcp] MCP server started on stdio transport");
  }

  async stop(): Promise<void> {
    this.gatewayClient.disconnect();
    await this.server.close();
  }
}

// Main entry point for standalone execution
async function main() {
  const config: CursorMcpConfig = {
    gatewayUrl: process.env.OPENCLAW_GATEWAY_URL,
    gatewayToken: process.env.OPENCLAW_GATEWAY_TOKEN,
    gatewayPassword: process.env.OPENCLAW_GATEWAY_PASSWORD,
    defaultSessionKey: process.env.OPENCLAW_SESSION_KEY ?? "agent:main:cursor",
  };

  const server = new OpenClawMcpServer(config);

  process.on("SIGINT", async () => {
    console.error("[openclaw-mcp] Shutting down...");
    await server.stop();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    console.error("[openclaw-mcp] Shutting down...");
    await server.stop();
    process.exit(0);
  });

  await server.start();
}

// Run if this is the main module
const isMain =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("server.ts") ||
    process.argv[1].endsWith("server.js") ||
    process.argv[1].includes("cursor-mcp"));

if (isMain) {
  main().catch((err) => {
    console.error(`[openclaw-mcp] Fatal error: ${String(err)}`);
    process.exit(1);
  });
}

export { main };
