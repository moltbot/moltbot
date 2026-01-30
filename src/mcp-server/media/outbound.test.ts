import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock input-files.js for fetchWithGuard
vi.mock("../../media/input-files.js", async () => {
  const actual = await vi.importActual<typeof import("../../media/input-files.js")>(
    "../../media/input-files.js",
  );
  return {
    ...actual,
    fetchWithGuard: vi.fn(),
  };
});

// Mock mime.js for detectMime
vi.mock("../../media/mime.js", async () => {
  const actual = await vi.importActual<typeof import("../../media/mime.js")>("../../media/mime.js");
  return {
    ...actual,
    detectMime: vi.fn(),
  };
});

import { fetchWithGuard } from "../../media/input-files.js";
import { detectMime } from "../../media/mime.js";
import { processOutboundMedia, encodeMediaToContentBlock } from "./outbound.js";
import { MCP_MEDIA_LIMITS } from "./constants.js";

describe("processOutboundMedia", () => {
  const mockedFetchWithGuard = vi.mocked(fetchWithGuard);
  const mockedDetectMime = vi.mocked(detectMime);
  let tempDir: string;

  beforeEach(async () => {
    mockedFetchWithGuard.mockReset();
    mockedDetectMime.mockReset();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-outbound-test-"));
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("empty inputs", () => {
    it("returns empty blocks when no media provided", async () => {
      const result = await processOutboundMedia({});
      expect(result.blocks).toEqual([]);
      expect(result.warning).toBeUndefined();
    });

    it("returns empty blocks when empty arrays provided", async () => {
      const result = await processOutboundMedia({ mediaUrls: [] });
      expect(result.blocks).toEqual([]);
    });
  });

  describe("local file processing", () => {
    it("processes local file path", async () => {
      const filePath = path.join(tempDir, "test.png");
      await fs.writeFile(filePath, Buffer.from("fake-png-data"));

      mockedDetectMime.mockResolvedValue("image/png");

      const result = await processOutboundMedia({ mediaUrl: filePath });

      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]).toMatchObject({
        type: "image",
        mimeType: "image/png",
      });
      expect((result.blocks[0] as { data: string }).data).toBe(
        Buffer.from("fake-png-data").toString("base64"),
      );
    });

    it("processes file:// URL", async () => {
      const filePath = path.join(tempDir, "doc.pdf");
      await fs.writeFile(filePath, Buffer.from("fake-pdf-data"));

      mockedDetectMime.mockResolvedValue("application/pdf");

      const result = await processOutboundMedia({ mediaUrl: `file://${filePath}` });

      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]).toMatchObject({
        type: "resource",
        resource: {
          mimeType: "application/pdf",
        },
      });
    });

    it("skips non-existent local files", async () => {
      const result = await processOutboundMedia({
        mediaUrl: "/nonexistent/path/to/file.png",
      });

      expect(result.blocks).toEqual([]);
    });

    it("skips local files exceeding size limit", async () => {
      const filePath = path.join(tempDir, "large.bin");
      // Create file larger than per-item limit (20MB)
      await fs.writeFile(filePath, Buffer.alloc(MCP_MEDIA_LIMITS.outbound.maxBytesPerItem + 1));

      const result = await processOutboundMedia({ mediaUrl: filePath });

      expect(result.blocks).toEqual([]);
    });

    it("uses fallback MIME type when detection fails", async () => {
      const filePath = path.join(tempDir, "unknown");
      await fs.writeFile(filePath, Buffer.from("unknown-data"));

      mockedDetectMime.mockResolvedValue(undefined);

      const result = await processOutboundMedia({ mediaUrl: filePath });

      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]).toMatchObject({
        type: "resource",
        resource: {
          mimeType: "application/octet-stream",
        },
      });
    });
  });

  describe("remote URL processing", () => {
    it("fetches and encodes remote image", async () => {
      const imageBuffer = Buffer.from("remote-image-data");
      mockedFetchWithGuard.mockResolvedValue({
        buffer: imageBuffer,
        mimeType: "image/jpeg",
      });
      mockedDetectMime.mockResolvedValue("image/jpeg");

      const result = await processOutboundMedia({
        mediaUrl: "https://example.com/photo.jpg",
      });

      expect(mockedFetchWithGuard).toHaveBeenCalledWith({
        url: "https://example.com/photo.jpg",
        maxBytes: MCP_MEDIA_LIMITS.outbound.maxBytesPerItem,
        timeoutMs: expect.any(Number),
        maxRedirects: expect.any(Number),
      });

      expect(result.blocks).toHaveLength(1);
      expect(result.blocks[0]).toMatchObject({
        type: "image",
        mimeType: "image/jpeg",
      });
    });

    it("fetches and encodes remote audio", async () => {
      const audioBuffer = Buffer.from("remote-audio-data");
      mockedFetchWithGuard.mockResolvedValue({
        buffer: audioBuffer,
        mimeType: "audio/mpeg",
      });
      mockedDetectMime.mockResolvedValue("audio/mpeg");

      const result = await processOutboundMedia({
        mediaUrl: "https://example.com/song.mp3",
      });

      expect(result.blocks).toHaveLength(1);
      // Audio falls back to resource since MCP_SDK_HAS_AUDIO_CONTENT is false
      expect(result.blocks[0]).toMatchObject({
        type: "resource",
        resource: {
          mimeType: "audio/mpeg",
        },
      });
    });

    it("handles multiple remote URLs", async () => {
      mockedFetchWithGuard
        .mockResolvedValueOnce({
          buffer: Buffer.from("image1"),
          mimeType: "image/png",
        })
        .mockResolvedValueOnce({
          buffer: Buffer.from("image2"),
          mimeType: "image/gif",
        });
      mockedDetectMime.mockResolvedValueOnce("image/png").mockResolvedValueOnce("image/gif");

      const result = await processOutboundMedia({
        mediaUrls: ["https://example.com/img1.png", "https://example.com/img2.gif"],
      });

      expect(result.blocks).toHaveLength(2);
      expect(result.blocks[0]).toMatchObject({ type: "image", mimeType: "image/png" });
      expect(result.blocks[1]).toMatchObject({ type: "image", mimeType: "image/gif" });
    });

    it("combines mediaUrl and mediaUrls", async () => {
      mockedFetchWithGuard
        .mockResolvedValueOnce({
          buffer: Buffer.from("main"),
          mimeType: "image/png",
        })
        .mockResolvedValueOnce({
          buffer: Buffer.from("extra"),
          mimeType: "image/jpeg",
        });
      mockedDetectMime.mockResolvedValueOnce("image/png").mockResolvedValueOnce("image/jpeg");

      const result = await processOutboundMedia({
        mediaUrl: "https://example.com/main.png",
        mediaUrls: ["https://example.com/extra.jpg"],
      });

      expect(result.blocks).toHaveLength(2);
    });

    it("skips failed remote fetches without failing", async () => {
      mockedFetchWithGuard.mockRejectedValueOnce(new Error("Network error")).mockResolvedValueOnce({
        buffer: Buffer.from("success"),
        mimeType: "image/png",
      });
      mockedDetectMime.mockResolvedValue("image/png");

      const result = await processOutboundMedia({
        mediaUrls: ["https://example.com/failed.png", "https://example.com/success.png"],
      });

      expect(result.blocks).toHaveLength(1);
      expect(result.warning).toBeUndefined();
    });

    it("returns null for unsupported URL schemes", async () => {
      const result = await processOutboundMedia({
        mediaUrl: "ftp://example.com/file.txt",
      });

      expect(result.blocks).toEqual([]);
    });
  });

  describe("size limits", () => {
    it("omits items exceeding per-item size limit with warning", async () => {
      // Create a large buffer that exceeds the per-item limit
      const largeBuffer = Buffer.alloc(MCP_MEDIA_LIMITS.outbound.maxBytesPerItem + 1);
      mockedFetchWithGuard.mockResolvedValue({
        buffer: largeBuffer,
        mimeType: "image/png",
      });
      mockedDetectMime.mockResolvedValue("image/png");

      const result = await processOutboundMedia({
        mediaUrl: "https://example.com/huge.png",
      });

      expect(result.blocks).toEqual([]);
      expect(result.warning).toContain("1 media item omitted");
      expect(result.warning).toContain("per-item size limit");
    });

    it("stops when total size limit is exceeded with warning", async () => {
      // Use 15MB per item - under per-item limit but adds up to exceed total limit (50MB)
      // After 3 items we have 45MB; 4th would push to 60MB, exceeding 50MB total
      const mediumBuffer = Buffer.alloc(15 * 1024 * 1024); // 15MB each
      mockedFetchWithGuard.mockResolvedValue({
        buffer: mediumBuffer,
        mimeType: "image/png",
      });
      mockedDetectMime.mockResolvedValue("image/png");

      const result = await processOutboundMedia({
        mediaUrls: [
          "https://example.com/img1.png",
          "https://example.com/img2.png",
          "https://example.com/img3.png",
          "https://example.com/img4.png",
        ],
      });

      // Should include 3 items (45MB) and stop before 4th (would exceed 50MB total)
      expect(result.blocks.length).toBe(3);
      expect(result.warning).toContain("media item");
      expect(result.warning).toContain("omitted");
      expect(result.warning).toContain("response size limit");
    });

    it("reports correct count for multiple omitted items", async () => {
      const largeBuffer = Buffer.alloc(MCP_MEDIA_LIMITS.outbound.maxBytesPerItem + 1);
      mockedFetchWithGuard.mockResolvedValue({
        buffer: largeBuffer,
        mimeType: "image/png",
      });
      mockedDetectMime.mockResolvedValue("image/png");

      const result = await processOutboundMedia({
        mediaUrls: [
          "https://example.com/huge1.png",
          "https://example.com/huge2.png",
          "https://example.com/huge3.png",
        ],
      });

      expect(result.blocks).toEqual([]);
      expect(result.warning).toContain("3 media items omitted");
    });
  });
});

describe("encodeMediaToContentBlock", () => {
  describe("image encoding", () => {
    it("encodes PNG as ImageContent", () => {
      const buffer = Buffer.from("png-data");
      const block = encodeMediaToContentBlock(buffer, "image/png");

      expect(block).toEqual({
        type: "image",
        data: buffer.toString("base64"),
        mimeType: "image/png",
      });
    });

    it("encodes JPEG as ImageContent", () => {
      const buffer = Buffer.from("jpeg-data");
      const block = encodeMediaToContentBlock(buffer, "image/jpeg");

      expect(block).toEqual({
        type: "image",
        data: buffer.toString("base64"),
        mimeType: "image/jpeg",
      });
    });

    it("encodes GIF as ImageContent", () => {
      const buffer = Buffer.from("gif-data");
      const block = encodeMediaToContentBlock(buffer, "image/gif");

      expect(block).toEqual({
        type: "image",
        data: buffer.toString("base64"),
        mimeType: "image/gif",
      });
    });

    it("encodes WebP as ImageContent", () => {
      const buffer = Buffer.from("webp-data");
      const block = encodeMediaToContentBlock(buffer, "image/webp");

      expect(block).toEqual({
        type: "image",
        data: buffer.toString("base64"),
        mimeType: "image/webp",
      });
    });
  });

  describe("audio encoding", () => {
    // Note: MCP_SDK_HAS_AUDIO_CONTENT is false, so audio uses resource fallback
    it("encodes MP3 as EmbeddedResource fallback", () => {
      const buffer = Buffer.from("mp3-data");
      const block = encodeMediaToContentBlock(buffer, "audio/mpeg");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          uri: "attachment://audio.mp3",
          mimeType: "audio/mpeg",
          blob: buffer.toString("base64"),
        },
      });
    });

    it("encodes WAV as EmbeddedResource fallback", () => {
      const buffer = Buffer.from("wav-data");
      const block = encodeMediaToContentBlock(buffer, "audio/wav");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          uri: expect.stringMatching(/^attachment:\/\/audio\.(wav|bin)$/),
          mimeType: "audio/wav",
        },
      });
    });

    it("encodes OGG as EmbeddedResource fallback", () => {
      const buffer = Buffer.from("ogg-data");
      const block = encodeMediaToContentBlock(buffer, "audio/ogg");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          mimeType: "audio/ogg",
          blob: buffer.toString("base64"),
        },
      });
    });
  });

  describe("video encoding", () => {
    it("encodes MP4 as EmbeddedResource", () => {
      const buffer = Buffer.from("mp4-data");
      const block = encodeMediaToContentBlock(buffer, "video/mp4");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          uri: "attachment://video.mp4",
          mimeType: "video/mp4",
          blob: buffer.toString("base64"),
        },
      });
    });

    it("encodes WebM as EmbeddedResource", () => {
      const buffer = Buffer.from("webm-data");
      const block = encodeMediaToContentBlock(buffer, "video/webm");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          uri: "attachment://video.webm",
          mimeType: "video/webm",
          blob: buffer.toString("base64"),
        },
      });
    });

    it("encodes QuickTime as EmbeddedResource", () => {
      const buffer = Buffer.from("mov-data");
      const block = encodeMediaToContentBlock(buffer, "video/quicktime");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          mimeType: "video/quicktime",
          blob: buffer.toString("base64"),
        },
      });
    });
  });

  describe("text document encoding", () => {
    it("encodes plain text as EmbeddedResource with text content", () => {
      const buffer = Buffer.from("Hello, World!");
      const block = encodeMediaToContentBlock(buffer, "text/plain");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          uri: "attachment://document.txt",
          mimeType: "text/plain",
          text: "Hello, World!",
        },
      });
      // Should use text, not blob
      expect((block as { resource: { blob?: string } }).resource.blob).toBeUndefined();
    });

    it("encodes JSON as EmbeddedResource with text content", () => {
      const buffer = Buffer.from('{"key": "value"}');
      const block = encodeMediaToContentBlock(buffer, "application/json");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          uri: "attachment://document.json",
          mimeType: "application/json",
          text: '{"key": "value"}',
        },
      });
    });

    it("encodes HTML as EmbeddedResource with text content", () => {
      const buffer = Buffer.from("<html><body>Hello</body></html>");
      const block = encodeMediaToContentBlock(buffer, "text/html");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          uri: expect.stringMatching(/^attachment:\/\/document\.(html|htm|txt)$/),
          mimeType: "text/html",
          text: "<html><body>Hello</body></html>",
        },
      });
    });

    it("encodes markdown as EmbeddedResource with text content", () => {
      const buffer = Buffer.from("# Heading\n\nParagraph");
      const block = encodeMediaToContentBlock(buffer, "text/markdown");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          mimeType: "text/markdown",
          text: "# Heading\n\nParagraph",
        },
      });
    });
  });

  describe("binary document encoding", () => {
    it("encodes PDF as EmbeddedResource with blob", () => {
      const buffer = Buffer.from("pdf-binary-data");
      const block = encodeMediaToContentBlock(buffer, "application/pdf");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          uri: "attachment://file.pdf",
          mimeType: "application/pdf",
          blob: buffer.toString("base64"),
        },
      });
      // Should use blob, not text
      expect((block as { resource: { text?: string } }).resource.text).toBeUndefined();
    });

    it("encodes ZIP as EmbeddedResource with blob", () => {
      const buffer = Buffer.from("zip-binary-data");
      const block = encodeMediaToContentBlock(buffer, "application/zip");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          uri: "attachment://file.zip",
          mimeType: "application/zip",
          blob: buffer.toString("base64"),
        },
      });
    });

    it("encodes octet-stream as EmbeddedResource with blob", () => {
      const buffer = Buffer.from("binary-data");
      const block = encodeMediaToContentBlock(buffer, "application/octet-stream");

      expect(block).toMatchObject({
        type: "resource",
        resource: {
          uri: "attachment://file.bin",
          mimeType: "application/octet-stream",
          blob: buffer.toString("base64"),
        },
      });
    });
  });
});
