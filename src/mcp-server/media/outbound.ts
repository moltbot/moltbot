/**
 * MCP Outbound Media Processing
 *
 * Handles media sent from OpenClaw to MCP clients.
 */

import { promises as fs } from "node:fs";

import { detectMime, extensionForMime } from "../../media/mime.js";
import {
  fetchWithGuard,
  DEFAULT_INPUT_MAX_REDIRECTS,
  DEFAULT_INPUT_TIMEOUT_MS,
} from "../../media/input-files.js";

import { MCP_MEDIA_LIMITS, MCP_SDK_HAS_AUDIO_CONTENT } from "./constants.js";
import { estimateBlockSize } from "./helpers.js";
import type { McpContentBlock, McpOutboundMediaResult } from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PROCESSING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process outbound media from ReplyPayload.
 *
 * Converts mediaUrl/mediaUrls to base64-encoded MCP content blocks.
 * All media is embedded as base64 - no URLs returned.
 *
 * Uses fetchWithGuard for SSRF-protected remote fetching.
 *
 * Returns a warning if any media items were omitted due to size limits.
 */
export async function processOutboundMedia(params: {
  mediaUrl?: string;
  mediaUrls?: string[];
}): Promise<McpOutboundMediaResult> {
  const urls: string[] = [];
  if (params.mediaUrl) urls.push(params.mediaUrl);
  if (params.mediaUrls) urls.push(...params.mediaUrls);

  if (urls.length === 0) return { blocks: [] };

  const blocks: McpContentBlock[] = [];
  let totalBytes = 0;
  let omittedCount = 0;
  let omittedReason: "size" | "total" | null = null;

  for (const url of urls) {
    try {
      const block = await fetchAndEncodeMedia(url);
      if (!block) continue;

      // Calculate block size for limit checking
      const blockSize = estimateBlockSize(block);

      // Check per-item limit
      if (blockSize > MCP_MEDIA_LIMITS.outbound.maxBytesPerItem) {
        omittedCount += 1;
        omittedReason = "size";
        continue;
      }

      // Check total limit
      if (totalBytes + blockSize > MCP_MEDIA_LIMITS.outbound.maxTotalBytes) {
        // Count remaining URLs as omitted
        omittedCount += urls.length - urls.indexOf(url);
        omittedReason = "total";
        break;
      }

      totalBytes += blockSize;
      blocks.push(block);
    } catch {
      // Skip failed media fetches - don't fail the whole response
      continue;
    }
  }

  // Generate warning if media was omitted
  let warning: string | undefined;
  if (omittedCount > 0) {
    const itemWord = omittedCount === 1 ? "item" : "items";
    if (omittedReason === "total") {
      warning = `Note: ${omittedCount} media ${itemWord} omitted (response size limit reached).`;
    } else {
      warning = `Note: ${omittedCount} media ${itemWord} omitted (exceeded per-item size limit).`;
    }
  }

  return { blocks, warning };
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDIA FETCHING AND ENCODING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch media from URL or local path and encode as base64 content block.
 *
 * SECURITY: Uses fetchWithGuard (from input-files.ts) instead of fetchRemoteMedia
 * (from fetch.ts) for remote URLs. This is intentional because:
 * - mediaUrl/mediaUrls in ReplyPayload may contain arbitrary URLs from tools/agents
 * - fetchWithGuard includes assertPublicHostname() which blocks requests to:
 *   - Private IP ranges (10.x, 172.16-31.x, 192.168.x)
 *   - Localhost (127.x, ::1)
 *   - Cloud metadata endpoints (169.254.169.254)
 *   - Link-local addresses
 * - fetchRemoteMedia lacks this SSRF protection
 * - This prevents the MCP server from being tricked into fetching internal resources
 */
async function fetchAndEncodeMedia(url: string): Promise<McpContentBlock | null> {
  let buffer: Buffer;
  let mimeType: string;

  // Handle local file paths (file:// or absolute paths)
  if (url.startsWith("file://") || url.startsWith("/")) {
    const filepath = url.startsWith("file://") ? new URL(url).pathname : url;

    try {
      buffer = await fs.readFile(filepath);
      if (buffer.byteLength > MCP_MEDIA_LIMITS.outbound.maxBytesPerItem) {
        return null;
      }
      // detectMime uses magic bytes (buffer) + file extension (filePath) for best accuracy
      mimeType = (await detectMime({ buffer, filePath: filepath })) ?? "application/octet-stream";
    } catch {
      return null;
    }
  }
  // Handle remote URLs - use fetchWithGuard for SSRF protection
  else if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      // fetchWithGuard includes assertPublicHostname() check to prevent SSRF
      const result = await fetchWithGuard({
        url,
        maxBytes: MCP_MEDIA_LIMITS.outbound.maxBytesPerItem,
        timeoutMs: DEFAULT_INPUT_TIMEOUT_MS,
        maxRedirects: DEFAULT_INPUT_MAX_REDIRECTS,
      });
      buffer = result.buffer;
      // detectMime combines: magic bytes (buffer) + Content-Type header (headerMime) + URL path (filePath)
      // This provides the most accurate MIME detection, especially for ambiguous cases
      mimeType =
        (await detectMime({
          buffer,
          headerMime: result.mimeType, // Content-Type from HTTP response
          filePath: url, // URL path for extension-based fallback
        })) ?? "application/octet-stream";
    } catch {
      return null;
    }
  }
  // Unsupported URL scheme
  else {
    return null;
  }

  return encodeMediaToContentBlock(buffer, mimeType);
}

/**
 * Encode a buffer as the appropriate MCP content block type.
 *
 * Uses MCP_SDK_HAS_AUDIO_CONTENT flag to determine whether to use native
 * AudioContent blocks or fall back to EmbeddedResource with blob.
 */
export function encodeMediaToContentBlock(buffer: Buffer, mimeType: string): McpContentBlock {
  const base64Data = buffer.toString("base64");

  // Images -> ImageContent (native MCP support, best rendering)
  if (mimeType.startsWith("image/")) {
    return {
      type: "image",
      data: base64Data,
      mimeType,
    };
  }

  // Audio -> AudioContent if supported, otherwise EmbeddedResource fallback
  if (mimeType.startsWith("audio/")) {
    if (MCP_SDK_HAS_AUDIO_CONTENT) {
      return {
        type: "audio",
        data: base64Data,
        mimeType,
      };
    }
    // Fallback for SDKs without AudioContent support
    const ext = extensionForMime(mimeType) ?? ".bin";
    return {
      type: "resource",
      resource: {
        uri: `attachment://audio${ext}`,
        mimeType,
        blob: base64Data,
      },
    };
  }

  // Video -> EmbeddedResource with blob (no native MCP VideoContent type)
  if (mimeType.startsWith("video/")) {
    const ext = extensionForMime(mimeType) ?? ".bin";
    return {
      type: "resource",
      resource: {
        uri: `attachment://video${ext}`,
        mimeType,
        blob: base64Data,
      },
    };
  }

  // Text documents -> EmbeddedResource with text content
  if (mimeType.startsWith("text/") || mimeType === "application/json") {
    const text = buffer.toString("utf-8");
    const ext = extensionForMime(mimeType) ?? ".txt";
    return {
      type: "resource",
      resource: {
        uri: `attachment://document${ext}`,
        mimeType,
        text,
      },
    };
  }

  // Binary documents (PDF, etc.) -> EmbeddedResource with blob
  const ext = extensionForMime(mimeType) ?? ".bin";
  return {
    type: "resource",
    resource: {
      uri: `attachment://file${ext}`,
      mimeType,
      blob: base64Data,
    },
  };
}
