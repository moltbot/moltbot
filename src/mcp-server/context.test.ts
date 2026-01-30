import { describe, expect, it } from "vitest";
import { buildSyntheticContext } from "./context.js";

describe("buildSyntheticContext", () => {
  it("should generate valid MsgContext with all required fields", () => {
    const ctx = buildSyntheticContext({
      body: "Hello, OpenClaw!",
      sessionKey: "test-session-123",
      senderId: "mcp-client",
    });

    // Core message content
    expect(ctx.Body).toBe("Hello, OpenClaw!");
    expect(ctx.RawBody).toBe("Hello, OpenClaw!");
    expect(ctx.CommandBody).toBe("Hello, OpenClaw!");
    expect(ctx.BodyForCommands).toBe("Hello, OpenClaw!");
    expect(ctx.BodyForAgent).toBe("Hello, OpenClaw!");

    // Session/routing
    expect(ctx.SessionKey).toBe("test-session-123");

    // Provider identification
    expect(ctx.Provider).toBe("mcp");
    expect(ctx.Surface).toBe("mcp");
    expect(ctx.AccountId).toBe("mcp");

    // Sender info
    expect(ctx.From).toBe("mcp-client");
    expect(ctx.SenderId).toBe("mcp-client");
    expect(ctx.SenderUsername).toBe("mcp-client");
    expect(ctx.SenderName).toBe("MCP Client"); // default

    // Message metadata
    expect(ctx.MessageSid).toMatch(/^mcp-\d+-[a-z0-9]+$/);

    // Flags
    expect(ctx.WasMentioned).toBe(true);
    expect(ctx.CommandAuthorized).toBe(true);
    expect(ctx.CommandSource).toBe("native");

    // Media (empty for text-only)
    expect(ctx.MediaUrl).toBeUndefined();
    expect(ctx.MediaUrls).toEqual([]);
    expect(ctx.MediaPath).toBeUndefined();
    expect(ctx.MediaPaths).toEqual([]);

    // Threading
    expect(ctx.ReplyToId).toBeUndefined();
    expect(ctx.MessageThreadId).toBeUndefined();
  });

  it("should use custom senderName when provided", () => {
    const ctx = buildSyntheticContext({
      body: "Test message",
      sessionKey: "session-1",
      senderId: "user-123",
      senderName: "Custom Sender Name",
    });

    expect(ctx.SenderName).toBe("Custom Sender Name");
  });

  it("should generate unique MessageSid for each call", () => {
    const ctx1 = buildSyntheticContext({
      body: "msg1",
      sessionKey: "session-1",
      senderId: "client",
    });
    const ctx2 = buildSyntheticContext({
      body: "msg2",
      sessionKey: "session-1",
      senderId: "client",
    });

    expect(ctx1.MessageSid).not.toBe(ctx2.MessageSid);
  });

  it("should NOT set OriginatingChannel (intentional omission)", () => {
    const ctx = buildSyntheticContext({
      body: "Test",
      sessionKey: "session-1",
      senderId: "client",
    });

    // OriginatingChannel is intentionally omitted because MCP returns
    // responses in-band rather than routing to external channels
    expect(ctx.OriginatingChannel).toBeUndefined();
  });

  it("should set Provider, Surface, and AccountId to 'mcp'", () => {
    const ctx = buildSyntheticContext({
      body: "Test",
      sessionKey: "session-1",
      senderId: "client",
    });

    expect(ctx.Provider).toBe("mcp");
    expect(ctx.Surface).toBe("mcp");
    expect(ctx.AccountId).toBe("mcp");
  });

  it("should set From to the senderId parameter", () => {
    const ctx = buildSyntheticContext({
      body: "Test",
      sessionKey: "session-1",
      senderId: "custom-sender-id-456",
    });

    expect(ctx.From).toBe("custom-sender-id-456");
  });

  describe("media support", () => {
    it("should populate MediaPaths from mediaPaths parameter", () => {
      const ctx = buildSyntheticContext({
        body: "Check this image",
        sessionKey: "session-1",
        senderId: "client",
        mediaPaths: ["/tmp/image.png", "/tmp/doc.pdf"],
        mediaMimeTypes: ["image/png", "application/pdf"],
        mediaPlaceholders: ["<media:image>", "<media:document>"],
      });

      expect(ctx.MediaPaths).toEqual(["/tmp/image.png", "/tmp/doc.pdf"]);
      expect(ctx.MediaPath).toBe("/tmp/image.png");
    });

    it("should populate MediaUrls as file:// URLs from mediaPaths", () => {
      const ctx = buildSyntheticContext({
        body: "Check this",
        sessionKey: "session-1",
        senderId: "client",
        mediaPaths: ["/tmp/image.png"],
        mediaMimeTypes: ["image/png"],
      });

      expect(ctx.MediaUrls).toEqual(["file:///tmp/image.png"]);
      expect(ctx.MediaUrl).toBe("file:///tmp/image.png");
    });

    it("should populate MediaTypes from mediaMimeTypes parameter", () => {
      const ctx = buildSyntheticContext({
        body: "Check this",
        sessionKey: "session-1",
        senderId: "client",
        mediaPaths: ["/tmp/image.png", "/tmp/doc.pdf"],
        mediaMimeTypes: ["image/png", "application/pdf"],
      });

      expect(ctx.MediaTypes).toEqual(["image/png", "application/pdf"]);
      expect(ctx.MediaType).toBe("image/png");
    });

    it("should prepend media placeholders to Body", () => {
      const ctx = buildSyntheticContext({
        body: "What's in this image?",
        sessionKey: "session-1",
        senderId: "client",
        mediaPlaceholders: ["<media:image>"],
      });

      expect(ctx.Body).toBe("<media:image> What's in this image?");
      expect(ctx.RawBody).toBe("<media:image> What's in this image?");
    });

    it("should preserve original text in CommandBody", () => {
      const ctx = buildSyntheticContext({
        body: "/help command",
        sessionKey: "session-1",
        senderId: "client",
        mediaPlaceholders: ["<media:image>"],
      });

      expect(ctx.CommandBody).toBe("/help command");
      expect(ctx.BodyForCommands).toBe("/help command");
    });

    it("should append extracted content to BodyForAgent", () => {
      const ctx = buildSyntheticContext({
        body: "Summarize this",
        sessionKey: "session-1",
        senderId: "client",
        mediaPlaceholders: ["<media:document>"],
        extractedContent: [
          {
            filename: "report.pdf",
            text: "This is the extracted PDF content.",
          },
        ],
      });

      expect(ctx.BodyForAgent).toContain("--- Extracted content from report.pdf ---");
      expect(ctx.BodyForAgent).toContain("This is the extracted PDF content.");
      expect(ctx.BodyForAgent).toContain("--- End extracted content ---");
    });

    it("should handle multiple extracted contents", () => {
      const ctx = buildSyntheticContext({
        body: "Compare these",
        sessionKey: "session-1",
        senderId: "client",
        extractedContent: [
          { filename: "doc1.pdf", text: "Content from doc1" },
          { filename: "doc2.pdf", text: "Content from doc2" },
        ],
      });

      expect(ctx.BodyForAgent).toContain("--- Extracted content from doc1.pdf ---");
      expect(ctx.BodyForAgent).toContain("--- Extracted content from doc2.pdf ---");
    });

    it("should skip extracted content with empty text", () => {
      const ctx = buildSyntheticContext({
        body: "Check this",
        sessionKey: "session-1",
        senderId: "client",
        extractedContent: [
          { filename: "empty.pdf", text: "" },
          { filename: "whitespace.pdf", text: "   " },
        ],
      });

      expect(ctx.BodyForAgent).not.toContain("--- Extracted content from empty.pdf ---");
      expect(ctx.BodyForAgent).not.toContain("--- Extracted content from whitespace.pdf ---");
    });

    it("should handle empty media arrays", () => {
      const ctx = buildSyntheticContext({
        body: "No media",
        sessionKey: "session-1",
        senderId: "client",
        mediaPaths: [],
        mediaMimeTypes: [],
        mediaPlaceholders: [],
      });

      expect(ctx.MediaPaths).toEqual([]);
      expect(ctx.MediaUrls).toEqual([]);
      expect(ctx.Body).toBe("No media");
    });
  });
});
