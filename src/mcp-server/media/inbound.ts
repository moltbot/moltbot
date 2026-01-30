/**
 * MCP Inbound Media Processing
 *
 * Handles media sent from MCP clients to OpenClaw.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";

import { extensionForMime } from "../../media/mime.js";
import {
  extractImageContentFromSource,
  extractFileContentFromSource,
  normalizeMimeType,
} from "../../media/input-files.js";

import { MCP_MEDIA_LIMITS, MCP_IMAGE_LIMITS, MCP_FILE_LIMITS } from "./constants.js";
import {
  validateBase64,
  stripDataUrlPrefix,
  sanitizeFilename,
  resolveMediaPlaceholder,
  formatBytes,
  isArchiveMime,
} from "./helpers.js";
import type {
  McpImageInput,
  McpFileInput,
  McpMediaProcessResult,
  McpExtractedContent,
} from "./types.js";

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PROCESSING FUNCTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process inbound media from MCP request.
 *
 * Uses existing input-files.ts infrastructure for:
 * - Image validation and extraction
 * - File validation, PDF text extraction, and page rendering
 * - Charset detection for text files
 */
export async function processInboundMedia(params: {
  images?: McpImageInput[];
  files?: McpFileInput[];
}): Promise<McpMediaProcessResult> {
  const { images = [], files = [] } = params;

  // If no media, return empty result
  if (images.length === 0 && files.length === 0) {
    return {
      paths: [],
      mimeTypes: [],
      placeholders: [],
      extractedContent: [],
      cleanup: async () => {},
    };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-mcp-"));
  const paths: string[] = [];
  const mimeTypes: string[] = [];
  const placeholders: string[] = [];
  const extractedContent: McpExtractedContent[] = [];

  try {
    // Process images using existing extractImageContentFromSource
    for (let i = 0; i < Math.min(images.length, MCP_MEDIA_LIMITS.image.maxCount); i++) {
      const img = images[i];
      const result = await processInboundImage(img, tempDir, i);
      paths.push(result.path);
      mimeTypes.push(result.mimeType);
      placeholders.push("<media:image>");
    }

    // Process files using existing extractFileContentFromSource
    for (let i = 0; i < Math.min(files.length, MCP_MEDIA_LIMITS.file.maxCount); i++) {
      const file = files[i];
      const result = await processInboundFile(file, tempDir, i);
      paths.push(result.path);
      mimeTypes.push(result.mimeType);
      placeholders.push(result.placeholder);
      if (result.extracted) {
        extractedContent.push(result.extracted);
      }
      // Include rendered PDF page images in MediaPaths so the media
      // understanding pipeline can process them (e.g., for scanned PDFs)
      if (result.additionalPaths) {
        paths.push(...result.additionalPaths);
        mimeTypes.push(...(result.additionalMimeTypes ?? []));
        placeholders.push(...(result.additionalPlaceholders ?? []));
      }
    }

    return {
      paths,
      mimeTypes,
      placeholders,
      extractedContent,
      cleanup: async () => {
        try {
          await fs.rm(tempDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors - OS will eventually clean /tmp
        }
      },
    };
  } catch (error) {
    // Cleanup on error
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// IMAGE PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process inbound image using existing extractImageContentFromSource.
 */
async function processInboundImage(
  input: McpImageInput,
  tempDir: string,
  index: number,
): Promise<{ path: string; mimeType: string }> {
  // Strip data URL prefix if present (validates base64 indicator)
  const base64Data = stripDataUrlPrefix(input.data);

  // Validate base64 before decoding to catch malformed input early
  validateBase64(base64Data);

  // Use existing extraction function - handles validation, size checks
  const imageContent = await extractImageContentFromSource(
    { type: "base64", data: base64Data, mediaType: input.mimeType },
    MCP_IMAGE_LIMITS,
  );

  // Write to temp file for MsgContext.MediaPaths
  const ext = extensionForMime(imageContent.mimeType) ?? ".bin";
  const filename = sanitizeFilename(input.filename) ?? `image-${index}${ext}`;
  const filepath = path.join(tempDir, filename);
  await fs.writeFile(filepath, Buffer.from(imageContent.data, "base64"));

  return { path: filepath, mimeType: imageContent.mimeType };
}

// ═══════════════════════════════════════════════════════════════════════════
// FILE PROCESSING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Result from processing a single inbound file.
 * Includes additional paths/mimeTypes for rendered PDF page images.
 */
type ProcessInboundFileResult = {
  /** Primary file path */
  path: string;
  /** Primary MIME type */
  mimeType: string;
  /** Placeholder for message body */
  placeholder: string;
  /** Extracted content (text, images) */
  extracted?: McpExtractedContent;
  /** Additional paths for rendered PDF images (written to temp files) */
  additionalPaths?: string[];
  /** Additional MIME types for rendered PDF images */
  additionalMimeTypes?: string[];
  /** Additional placeholders for rendered PDF images */
  additionalPlaceholders?: string[];
};

/**
 * Process inbound file using existing extractFileContentFromSource.
 *
 * For PDFs, this extracts text and/or renders pages as images.
 * When PDF pages are rendered as images (text extraction insufficient),
 * those images are written to temp files and included in the result
 * so they can be passed to the media understanding pipeline via MediaPaths.
 *
 * For text files, this handles charset detection.
 */
async function processInboundFile(
  input: McpFileInput,
  tempDir: string,
  index: number,
): Promise<ProcessInboundFileResult> {
  const mimeType = normalizeMimeType(input.mimeType);
  if (!mimeType) {
    throw new Error("File missing MIME type");
  }

  // Strip data URL prefix if present (validates base64 indicator)
  const base64Data = stripDataUrlPrefix(input.data);

  // Validate base64 before decoding to catch malformed input early
  validateBase64(base64Data);

  const ext = extensionForMime(mimeType) ?? ".bin";
  const filename = sanitizeFilename(input.filename) ?? `file-${index}${ext}`;

  // For audio/video types, treat as binary blobs (extractFileContentFromSource doesn't handle these)
  if (mimeType.startsWith("audio/") || mimeType.startsWith("video/")) {
    if (!MCP_FILE_LIMITS.allowedMimes.has(mimeType)) {
      throw new Error(`Unsupported file MIME type: ${mimeType}`);
    }

    const buffer = Buffer.from(base64Data, "base64");
    if (buffer.byteLength > MCP_FILE_LIMITS.maxBytes) {
      throw new Error(
        `File too large: ${formatBytes(buffer.byteLength)} (limit: ${formatBytes(MCP_FILE_LIMITS.maxBytes)})`,
      );
    }

    const filepath = path.join(tempDir, filename);
    await fs.writeFile(filepath, buffer);

    const placeholder = resolveMediaPlaceholder(mimeType);
    return { path: filepath, mimeType, placeholder };
  }

  // For supported extractable types (text, PDF), use existing extraction
  if (MCP_FILE_LIMITS.allowedMimes.has(mimeType) && !isArchiveMime(mimeType)) {
    const extracted = await extractFileContentFromSource({
      source: { type: "base64", data: base64Data, mediaType: input.mimeType, filename },
      limits: MCP_FILE_LIMITS,
    });

    // Write original file to temp for MsgContext.MediaPaths
    const filepath = path.join(tempDir, filename);
    await fs.writeFile(filepath, Buffer.from(base64Data, "base64"));

    const placeholder = resolveMediaPlaceholder(mimeType);
    const result: ProcessInboundFileResult = {
      path: filepath,
      mimeType,
      placeholder,
      extracted: {
        filename: extracted.filename,
        text: extracted.text,
        images: extracted.images,
      },
    };

    // If PDF extraction produced rendered page images, write them to temp files
    // so they can be passed to the media understanding pipeline via MediaPaths.
    // This ensures the model can "see" scanned PDFs or PDFs with minimal text.
    if (extracted.images && extracted.images.length > 0) {
      const additionalPaths: string[] = [];
      const additionalMimeTypes: string[] = [];
      const additionalPlaceholders: string[] = [];

      for (let pageIdx = 0; pageIdx < extracted.images.length; pageIdx++) {
        const img = extracted.images[pageIdx];
        const pageFilename = `${path.basename(filename, ext)}-page-${pageIdx + 1}.png`;
        const pagePath = path.join(tempDir, pageFilename);
        await fs.writeFile(pagePath, Buffer.from(img.data, "base64"));
        additionalPaths.push(pagePath);
        additionalMimeTypes.push(img.mimeType);
        additionalPlaceholders.push("<media:image>");
      }

      result.additionalPaths = additionalPaths;
      result.additionalMimeTypes = additionalMimeTypes;
      result.additionalPlaceholders = additionalPlaceholders;
    }

    return result;
  }

  // For archives and other binary types, just save to temp
  if (!MCP_FILE_LIMITS.allowedMimes.has(mimeType)) {
    throw new Error(`Unsupported file MIME type: ${mimeType}`);
  }

  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.byteLength > MCP_FILE_LIMITS.maxBytes) {
    throw new Error(
      `File too large: ${formatBytes(buffer.byteLength)} (limit: ${formatBytes(MCP_FILE_LIMITS.maxBytes)})`,
    );
  }

  const filepath = path.join(tempDir, filename);
  await fs.writeFile(filepath, buffer);

  const placeholder = resolveMediaPlaceholder(mimeType);
  return { path: filepath, mimeType, placeholder };
}
