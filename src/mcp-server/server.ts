import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ListToolsRequestSchema, CallToolRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { orderOpenClawTool } from "./tools/order-openclaw.js";
import type { McpServerOptions } from "./types.js";
import type { RuntimeEnv } from "../runtime.js";
import { createRequire } from "module";

// Read version from package.json dynamically
const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version: string };
const SERVER_VERSION = pkg.version;

export async function createMcpServer(runtime: RuntimeEnv, opts: McpServerOptions) {
  const server = new Server(
    {
      name: "openclaw-mcp-server",
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [orderOpenClawTool.definition],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "order_openclaw") {
      const args = request.params.arguments as Parameters<typeof orderOpenClawTool.handler>[0];

      if (opts.verbose) {
        runtime.log(
          `[MCP] Request: message="${args.message.slice(0, 100)}${args.message.length > 100 ? "..." : ""}", sessionKey=${args.sessionKey ?? "(auto)"}`,
        );
      }

      const result = await orderOpenClawTool.handler(args);

      if (opts.verbose) {
        const firstBlock = result.content[0];
        const responsePreview =
          firstBlock?.type === "text"
            ? firstBlock.text.slice(0, 100)
            : `[${firstBlock?.type ?? "empty"}]`;
        runtime.log(
          `[MCP] Response: ${result.isError ? "ERROR" : "OK"}, ${responsePreview}${responsePreview.length >= 100 ? "..." : ""}`,
        );
      }

      return result;
    }
    throw new Error(`Unknown tool: ${request.params.name}`);
  });

  return server;
}

export async function startMcpServer(opts: McpServerOptions, runtime: RuntimeEnv) {
  const server = await createMcpServer(runtime, opts);

  // stdio transport - MCP uses stdin/stdout for communication.
  // This is intentionally stdio-only: MCP's design for local tool servers
  // uses stdio as the standard transport, which provides process isolation
  // and simple lifecycle management (server exits when client disconnects).
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Graceful shutdown on SIGINT/SIGTERM
  const shutdown = async () => {
    if (opts.verbose) {
      runtime.log("MCP server shutting down...");
    }
    await server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  if (opts.verbose) {
    runtime.log("MCP server started (stdio transport)");
  }
}
