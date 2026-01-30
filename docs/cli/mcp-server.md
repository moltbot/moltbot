# MCP Server

OpenClaw includes a built-in MCP (Model Context Protocol) server that allows external AI agents and tools to interact with OpenClaw programmatically. This enables powerful integrations where other AI systems can delegate tasks to OpenClaw.

## What is MCP?

The [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) is an open standard for connecting AI models to external tools and data sources. MCP servers expose "tools" that AI clients can discover and invoke.

OpenClaw's MCP server exposes an `order_openclaw` tool that allows any MCP-compatible client to send messages to OpenClaw and receive responses.

## Quick Start

### 1. Start the MCP Server

```bash
openclaw mcp-server
```

The server uses stdio transport, meaning it communicates via stdin/stdout. This is the standard approach for local MCP tool servers.

### 2. Configure Your MCP Client

Add OpenClaw to your MCP client's configuration. For example, in Claude Code:

**~/.claude/claude_desktop_config.json** (macOS/Linux) or **%APPDATA%\Claude\claude_desktop_config.json** (Windows):

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

### 3. Use the Tool

Once configured, the MCP client can invoke the `order_openclaw` tool to send messages to OpenClaw.

## CLI Reference

```
openclaw mcp-server [options]

Options:
  -v, --verbose  Enable verbose logging for debugging
  --version      Print MCP server version and exit
  -h, --help     Display help for command
```

### Examples

```bash
# Start MCP server (standard mode)
openclaw mcp-server

# Start with verbose logging (useful for debugging)
openclaw mcp-server --verbose

# Print version
openclaw mcp-server --version
```

## The `order_openclaw` Tool

The MCP server exposes a single tool called `order_openclaw`.

### Tool Definition

```json
{
  "name": "order_openclaw",
  "description": "Send a message to OpenClaw and receive a response. The message will be processed as if typed by a user. Supports sending images, files (PDF, text, markdown, CSV, JSON), audio, video, and archives (ZIP, TAR.GZ) via base64 encoding.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "message": {
        "type": "string",
        "description": "The message to send to OpenClaw"
      },
      "sessionKey": {
        "type": "string",
        "description": "Optional session key for conversation continuity"
      },
      "images": {
        "type": "array",
        "description": "Optional base64-encoded images (max 10, 15MB each)",
        "items": {
          "type": "object",
          "properties": {
            "data": { "type": "string", "description": "Base64-encoded image data" },
            "mimeType": { "type": "string", "description": "MIME type (e.g., 'image/png')" },
            "filename": { "type": "string", "description": "Optional filename" }
          },
          "required": ["data", "mimeType"]
        }
      },
      "files": {
        "type": "array",
        "description": "Optional base64-encoded files (max 5, 15MB each)",
        "items": {
          "type": "object",
          "properties": {
            "data": { "type": "string", "description": "Base64-encoded file data" },
            "mimeType": { "type": "string", "description": "MIME type (e.g., 'application/pdf')" },
            "filename": { "type": "string", "description": "Optional filename" }
          },
          "required": ["data", "mimeType"]
        }
      }
    },
    "required": ["message"]
  }
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `message` | string | Yes | The message to send to OpenClaw. Passed through unmodified. |
| `sessionKey` | string | No | Session identifier for conversation continuity. If not provided, a unique key is generated for each call. |
| `images` | array | No | Base64-encoded images. See [Media Support](#media-support) for details. |
| `files` | array | No | Base64-encoded files. See [Media Support](#media-support) for details. |

### Response Format

The tool returns a standard MCP tool result:

```json
{
  "content": [
    {
      "type": "text",
      "text": "OpenClaw's response here..."
    }
  ],
  "isError": false
}
```

On error:

```json
{
  "content": [
    {
      "type": "text",
      "text": "Error: <error message>"
    }
  ],
  "isError": true
}
```

## Session Management

### Default Behavior (Isolated Sessions)

By default, each call to `order_openclaw` generates a unique session key:

```
mcp-{timestamp}-{random}
```

This ensures that unrelated requests don't share context, preventing accidental information leakage between different conversations or clients.

### Conversation Continuity

To maintain conversation history across multiple calls, provide a consistent `sessionKey`:

```json
// First message
{
  "name": "order_openclaw",
  "arguments": {
    "message": "Remember that my favorite color is blue.",
    "sessionKey": "user-123-conversation"
  }
}

// Later message (same session)
{
  "name": "order_openclaw",
  "arguments": {
    "message": "What's my favorite color?",
    "sessionKey": "user-123-conversation"
  }
}
```

OpenClaw will remember the conversation context and respond appropriately.

### Session Key Best Practices

- Use descriptive, unique keys per logical conversation
- Include user/client identifiers to prevent cross-client leakage
- Consider including timestamps for debugging: `client-123-2024-01-15`

## Media Support

The `order_openclaw` tool supports sending and receiving media files via base64 encoding.

### Sending Media

Attach images or files to your message using base64-encoded data:

```json
{
  "name": "order_openclaw",
  "arguments": {
    "message": "What do you see in this image?",
    "images": [{
      "data": "<base64-encoded-image>",
      "mimeType": "image/png"
    }]
  }
}
```

### Image Attachments

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | string | Yes | Base64-encoded image data |
| `mimeType` | string | Yes | MIME type (see supported types) |
| `filename` | string | No | Optional filename for context |

**Supported MIME types:** `image/jpeg`, `image/png`, `image/gif`, `image/webp`

**Limits:** Max 10 images, 15MB each

### File Attachments

Send files using the `files` array:

```json
{
  "name": "order_openclaw",
  "arguments": {
    "message": "Summarize this document",
    "files": [{
      "data": "<base64-encoded-pdf>",
      "mimeType": "application/pdf",
      "filename": "report.pdf"
    }]
  }
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | string | Yes | Base64-encoded file data |
| `mimeType` | string | Yes | MIME type (see supported types) |
| `filename` | string | No | Optional filename for context |

**Supported file types:**

| Category | MIME Types |
|----------|------------|
| Documents | `application/pdf` |
| Text | `text/plain`, `text/markdown`, `text/html`, `text/csv` |
| Data | `application/json` |
| Audio | `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/mp4`, `audio/aac`, `audio/flac`, `audio/opus` |
| Video | `video/mp4`, `video/webm`, `video/quicktime`, `video/x-msvideo` |
| Archives | `application/zip`, `application/gzip`, `application/x-tar`, `application/x-compressed-tar` |

**Limits:** Max 5 files, 15MB each

**Notes:**
- Archives are treated as opaque blobs (no extraction). The MCP server assumes trusted users only.
- Audio transcription requires a configured transcription provider (local Whisper, Deepgram, OpenAI, etc.). Without a provider, audio is accepted but not transcribed.

### Receiving Media

Responses may include multiple content blocks depending on what OpenClaw returns.

#### Text Content

```json
{ "type": "text", "text": "The response text..." }
```

#### Image Content

```json
{ "type": "image", "data": "<base64>", "mimeType": "image/png" }
```

#### Audio Content

```json
{ "type": "audio", "data": "<base64>", "mimeType": "audio/mpeg" }
```

#### Embedded Resource (documents/files)

```json
{
  "type": "resource",
  "resource": {
    "uri": "attachment://filename.pdf",
    "mimeType": "application/pdf",
    "blob": "<base64>"
  }
}
```

### Size Limits Summary

| Limit | Value |
|-------|-------|
| Max media size (all types) | 15 MB |
| Max images per request | 10 |
| Max files per request | 5 |
| Max response media item | 20 MB |
| Max total response | 50 MB |

### Design: Base64 Only

All media is transferred as base64-encoded data. URL-based transfers are intentionally excluded because:

- **Works offline**: MCP clients may not have network access to OpenClaw's media storage
- **Self-contained**: Base64 provides portable media that works across all MCP clients
- **Secure**: Eliminates authentication and SSRF concerns for media delivery
- **Consistent**: Aligns with MCP SDK's native content block types

## Configuration Examples

### Claude Code

Create or edit `~/.claude/claude_desktop_config.json`:

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

### Claude Code with Verbose Logging

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "openclaw",
      "args": ["mcp-server", "--verbose"]
    }
  }
}
```

### With Custom Path

If OpenClaw is installed in a non-standard location:

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "/usr/local/bin/openclaw",
      "args": ["mcp-server"]
    }
  }
}
```

### Using npx

If you prefer to run via npx:

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "npx",
      "args": ["openclaw", "mcp-server"]
    }
  }
}
```

## Architecture

### High-Level Flow

```
┌─────────────────┐     MCP Protocol      ┌─────────────────┐
│   MCP Client    │ ◄──────────────────► │  OpenClaw MCP   │
│ (Claude Code,   │    (stdio JSON-RPC)   │     Server      │
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

### Transport: stdio-only (By Design)

The MCP server uses stdio transport exclusively. This is an intentional design choice:

- **Process isolation**: Each MCP client spawns its own server process
- **Simple lifecycle**: Server exits when client disconnects
- **Security**: No network exposure—communication is local to the machine
- **No state management**: No need for authentication or session management at the transport level

### Response Aggregation

The MCP server uses infrastructure-level response aggregation to ensure a single, complete response is returned:

1. User's message is passed to OpenClaw **unmodified** (no prompt injection)
2. Intermediate outputs (block replies, tool results) are collected via callbacks
3. Final response is extracted from `getReplyFromConfig`
4. All parts are deduplicated and combined
5. A single unified response is returned to the MCP client

This approach avoids the pitfalls of prompt-based response control (unreliable, quality-degrading) while guaranteeing a coherent response.

## Implementation Reference

Design documentation:
- [MCP Server Design](/design/mcp-server-design) - Core architecture and response aggregation
- [MCP Server Media Design](/design/mcp-server-media-design) - Media handling details

### Source Files

| File | Description |
|------|-------------|
| `src/mcp-server/index.ts` | Module entry point |
| `src/mcp-server/server.ts` | MCP server setup and tool registration |
| `src/mcp-server/types.ts` | Type definitions |
| `src/mcp-server/context.ts` | Synthetic message context builder |
| `src/mcp-server/tools/order-openclaw.ts` | The `order_openclaw` tool implementation |
| `src/mcp-server/media/` | Media processing (inbound/outbound, validation, constants) |
| `src/cli/program/register.mcp.ts` | CLI command registration |

### Tests

| File | Coverage |
|------|----------|
| `src/mcp-server/context.test.ts` | Context builder tests |
| `src/mcp-server/tools/order-openclaw.test.ts` | Tool handler and deduplication tests |
| `src/mcp-server/media/helpers.test.ts` | Media validation and utility tests |
| `src/mcp-server/media/inbound.test.ts` | Inbound media processing tests |
| `src/mcp-server/media/outbound.test.ts` | Outbound media processing tests |

## Troubleshooting

### Server Won't Start

**Check that OpenClaw is properly installed:**
```bash
openclaw --version
```

**Check for configuration issues:**
```bash
openclaw doctor
```

### No Response from Tool

**Enable verbose logging:**
```bash
openclaw mcp-server --verbose
```

This will show request/response details in the server's stderr output.

**Check OpenClaw configuration:**
Ensure you have valid API credentials configured:
```bash
openclaw status
```

### MCP Client Can't Find Server

**Verify the command path:**
```bash
which openclaw
```

Use the full path in your MCP configuration if needed.

**Check MCP client logs:**
Most MCP clients log connection errors. Check your client's logs for details.

### Session Context Not Persisting

**Ensure you're using the same `sessionKey`:**
Without a consistent session key, each call creates a new isolated session.

**Check session storage:**
```bash
openclaw sessions --store file
```

## Security Considerations

### Authorization

MCP calls are treated as authorized (equivalent to local CLI usage). The MCP client (e.g., Claude Code) is responsible for user authentication.

### Process Isolation

The stdio transport ensures:
- No network exposure
- Each client gets its own server process
- Server exits when client disconnects

### Message Handling

- User messages are passed through unmodified (no injection)
- Session keys should be treated as sensitive (they identify conversations)
- Unique session keys prevent cross-client context leakage

## Limitations

### Current Limitations

1. **Synchronous only**: The tool waits for OpenClaw to complete before returning
2. **No streaming**: Responses are aggregated and returned as a single block
3. **Single tool**: Only `order_openclaw` is exposed (individual OpenClaw tools are not exposed)

### Not Supported (By Design)

- HTTP/SSE transport: Would require authentication and state management
- Multiple concurrent clients per server: Each client spawns its own process
- Long-running daemon mode: Use the OpenClaw gateway for that use case

## Related Documentation

- [MCP Protocol Specification](https://modelcontextprotocol.io/)
- [OpenClaw CLI Reference](/cli)
- [OpenClaw Configuration](/gateway/configuration)
- [Sessions](/concepts/sessions)
