# MCP Server Media Support Design

## Overview

The OpenClaw MCP server supports bidirectional media exchange using **base64 encoding exclusively**. This enables MCP clients (like Claude Code) to send images, documents, audio, and video files to OpenClaw and receive media in responses.

## Design Decisions

### Base64 Only (No URLs)

All media transfers use base64 encoding. URL-based transfers are intentionally excluded because:
- MCP clients may not have network access to OpenClaw's media storage
- Base64 provides self-contained, portable media that works across all MCP clients
- Eliminates authentication/SSRF concerns for media delivery
- Aligns with MCP SDK's native content block types (ImageContent, EmbeddedResource)

### Trusted User Model

The MCP server assumes all users are fully trusted. Archive files (.zip, .tar.gz) are supported without extraction safeguards since only authorized users should have access to this interface.

## Architecture

```
┌─────────────────┐                              ┌─────────────────┐
│   MCP Client    │         MCP Protocol         │  OpenClaw MCP   │
│ (Claude Code,   │ ◄────────────────────────►   │     Server      │
│  other agents)  │      (stdio JSON-RPC)        │                 │
└─────────────────┘                              └────────┬────────┘
        │                                                 │
        │ Inbound:                                        │
        │ - message (text)                                │
        │ - images[] (base64)           ───────────────►  │
        │ - files[] (base64)                              │
        │                                        ┌────────┴────────┐
        │                                        │ Inbound Media   │
        │                                        │ Processing      │
        │                                        └────────┬────────┘
        │                                                 │
        │                                                 ▼
        │                                        ┌─────────────────┐
        │                                        │ getReplyFromConfig│
        │                                        └────────┬────────┘
        │                                                 │
        │                                        ┌────────┴────────┐
        │                                        │ Outbound Media  │
        │                                        │ Processing      │
        │                                        └────────┬────────┘
        │                                                 │
        │ Outbound:                                       │
        │ - text content blocks        ◄───────────────   │
        │ - image content blocks (base64)                 │
        │ - resource blocks (base64 blob)                 │
└─────────────────────────────────────────────────────────┘
```

### Inbound Media Processing

1. Decode and validate base64 data
2. Check MIME type against allowlist
3. Enforce size limits (15MB per item)
4. Save to temporary directory
5. Build `MsgContext` with media paths and placeholders
6. Extract text content from PDFs
7. Clean up temp files after response

### Outbound Media Processing

1. Collect media URLs from response callbacks (`onBlockReply`, `onToolResult`)
2. Fetch media from local paths or URLs (with SSRF protection)
3. Encode to base64
4. Build appropriate MCP content blocks by MIME type
5. Enforce response size limits (20MB per item, 50MB total)

## Supported Media Types

| Category | MIME Types | Notes |
|----------|------------|-------|
| Images | `image/jpeg`, `image/png`, `image/gif`, `image/webp` | Returned as `ImageContent` |
| Documents | `application/pdf`, `text/plain`, `text/markdown`, `text/html`, `text/csv`, `application/json` | PDFs get text extraction |
| Audio | `audio/mpeg`, `audio/wav`, `audio/ogg`, `audio/mp4`, `audio/aac`, `audio/flac`, `audio/opus` | Returned as `EmbeddedResource` |
| Video | `video/mp4`, `video/webm`, `video/quicktime`, `video/x-msvideo` | Returned as `EmbeddedResource` |
| Archives | `application/zip`, `application/gzip`, `application/x-tar`, `application/x-compressed-tar` | Opaque blobs, no extraction |

## Size Limits

| Limit | Value |
|-------|-------|
| Max inbound media size | 15 MB per item |
| Max inbound images | 10 |
| Max inbound files | 5 |
| Max outbound media item | 20 MB |
| Max outbound total | 50 MB |

## Content Block Types

The MCP SDK supports these content types for tool responses:

- **TextContent**: Plain text responses
- **ImageContent**: Base64-encoded images with MIME type
- **EmbeddedResource**: For documents, audio, video with `uri`, `mimeType`, and `blob` or `text` fields

Note: The MCP SDK's `AudioContent` type is not reliably supported across clients, so audio is returned as `EmbeddedResource` with blob.

## Source Files

| File | Description |
|------|-------------|
| `src/mcp-server/media/constants.ts` | Size limits, MIME type sets, SDK feature flags |
| `src/mcp-server/media/types.ts` | Type definitions |
| `src/mcp-server/media/helpers.ts` | Validation and utility functions |
| `src/mcp-server/media/inbound.ts` | Inbound media processing (base64 to temp files) |
| `src/mcp-server/media/outbound.ts` | Outbound media processing (URLs to base64 blocks) |
| `src/mcp-server/tools/order-openclaw.ts` | Tool schema and handler integration |
| `src/mcp-server/context.ts` | Synthetic message context with media fields |

## Related Documentation

- [MCP Server User Documentation](/cli/mcp-server) - Usage guide with examples
- [MCP Server Design](/design/mcp-server-design) - Core MCP server architecture
