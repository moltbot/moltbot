# MCP Server Design

## Overview

The OpenClaw MCP server exposes an `order_openclaw` tool that allows external MCP clients (e.g., Claude Code) to send messages to OpenClaw and receive responses synchronously.

## Requirements

1. Expose an `order_openclaw` endpoint/tool via MCP protocol
2. Accept messages from the caller **unmodified** (no prompt injection)
3. Collect all responses (partial, block, final) via infrastructure-level aggregation
4. Return a single combined response to the caller

## Architecture

```
┌─────────────────┐     MCP Protocol      ┌─────────────────┐
│   MCP Client    │ ◄──────────────────► │  OpenClaw MCP   │
│ (Claude Code,   │    (stdio/HTTP)       │     Server      │
│  other agents)  │                       │                 │
└─────────────────┘                       └────────┬────────┘
                                                   │
                                                   │ Internal call
                                                   ▼
                                          ┌─────────────────┐
                                          │ getReplyFromConfig │
                                          │ (auto-reply system) │
                                          └─────────────────┘
```

### Integration Point

The MCP server integrates with OpenClaw's existing auto-reply system via `getReplyFromConfig()` in `src/auto-reply/reply/get-reply.ts`.

### Source Files

- `src/mcp-server/` - MCP server module
- `src/mcp-server/server.ts` - Server setup and tool registration
- `src/mcp-server/tools/order-openclaw.ts` - Tool implementation with response aggregation
- `src/mcp-server/context.ts` - Synthetic MsgContext builder
- `src/cli/program/register.mcp.ts` - CLI command registration

## Key Design Decisions

### 1. Infrastructure-Level Response Aggregation

Instead of modifying the user's message with a prefix (unreliable, vulnerable to prompt injection), we guarantee a single MCP response through **infrastructure-level aggregation**:

- User's message is passed to OpenClaw **unmodified**
- `GetReplyOptions` callbacks collect intermediate outputs during agent execution
- Final `ReplyPayload` is extracted from `getReplyFromConfig` return value
- All parts are deduplicated and combined into a single response

This avoids prompt injection risks, quality degradation, and mixing meta-instructions with user content.

### 2. Channel and Routing

MCP is a **synchronous request-response protocol**—responses are returned in-band, not routed to external messaging channels. `OriginatingChannel` is intentionally **omitted** from the synthetic context.

### 3. Session Handling

- **Default behavior:** Each call without explicit `sessionKey` generates a unique key to prevent context leakage
- **Conversation continuity:** Pass the same `sessionKey` across calls to maintain history
- Sessions persist via the existing session store mechanism (file-based)

### 4. Transport: stdio-only

This is an intentional design choice:
- **MCP standard**: stdio is the canonical transport for local MCP tool servers
- **Process isolation**: Each MCP client spawns its own server process
- **Simple lifecycle**: Server exits when client disconnects
- **Security**: No network exposure

## Usage

```bash
# Start MCP server (stdio transport)
openclaw mcp-server

# Start with verbose logging
openclaw mcp-server --verbose
```

### Claude Code Configuration

Add to `~/.config/claude-code/mcp.json`:

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "openclaw",
      "args": ["mcp-server"]
    }
  }
}
```

## Related Documentation

- [MCP Server Media Support Design](/design/mcp-server-media-design) - Media handling (images, documents, audio, video)
- [MCP Server User Documentation](/cli/mcp-server) - Usage guide with examples

## References

- [MCP SDK Documentation](https://github.com/modelcontextprotocol/sdk)
- Auto-reply system: `src/auto-reply/reply/get-reply.ts`
- Agent runner: `src/auto-reply/reply/agent-runner-execution.ts`
- Message context types: `src/auto-reply/templating.ts`
