/**
 * MCP Media Types
 *
 * Type definitions for MCP media processing.
 */

import type { InputImageContent } from "../../media/input-files.js";

// ═══════════════════════════════════════════════════════════════════════════
// INPUT TYPES (MCP Client → OpenClaw)
// ═══════════════════════════════════════════════════════════════════════════

/** Base64-encoded image input from MCP client */
export type McpImageInput = {
  data: string; // base64 (no data: prefix)
  mimeType: string; // e.g., "image/png"
  filename?: string;
};

/** Base64-encoded file input from MCP client */
export type McpFileInput = {
  data: string; // base64
  mimeType: string; // e.g., "application/pdf", "text/markdown"
  filename?: string;
};

// ═══════════════════════════════════════════════════════════════════════════
// PROCESSING RESULT TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** Result of processing inbound media */
export type McpMediaProcessResult = {
  /** Local file paths for MsgContext.MediaPaths */
  paths: string[];
  /** MIME types for MsgContext.MediaTypes */
  mimeTypes: string[];
  /** Placeholder text for message body */
  placeholders: string[];
  /** Extracted content from files (PDF text, rendered images) */
  extractedContent: McpExtractedContent[];
  /** Cleanup function for temp files */
  cleanup: () => Promise<void>;
};

/** Extracted content from a file (e.g., PDF text or rendered pages) */
export type McpExtractedContent = {
  filename: string;
  text?: string;
  images?: InputImageContent[];
};

// ═══════════════════════════════════════════════════════════════════════════
// OUTPUT TYPES (OpenClaw → MCP Client)
// ═══════════════════════════════════════════════════════════════════════════

/** MCP response content block types */
export type McpContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; data: string; mimeType: string }
  | { type: "audio"; data: string; mimeType: string }
  | {
      type: "resource";
      resource: { uri: string; mimeType?: string; text?: string; blob?: string };
    };

/** Result of outbound media processing */
export type McpOutboundMediaResult = {
  /** Content blocks for the response */
  blocks: McpContentBlock[];
  /** Warning message if any media was omitted */
  warning?: string;
};
