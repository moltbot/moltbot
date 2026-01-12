#!/usr/bin/env npx tsx
import express, { type Request, type Response } from "express";
import { execSync } from "child_process";

const PORT = 18792;
const app = express();
app.use(express.json());

// Health check
app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, provider: "googlechat" });
});

// Google Chat webhook
app.post("/webhook/googlechat", async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const chat = event.chat || {};

    // Detect event type from payload structure
    const isAddedToSpace = !!chat.addedToSpacePayload;
    const isMessage = !!chat.messagePayload;

    const eventType = isAddedToSpace ? "ADDED_TO_SPACE" : isMessage ? "MESSAGE" : "UNKNOWN";
    console.log(`[googlechat] Received event: ${eventType}`);

    if (isAddedToSpace) {
      const user = chat.user?.displayName || "there";
      res.json({
        hostAppDataAction: {
          chatDataAction: {
            createMessageAction: {
              message: {
                text: `Hello ${user}! I'm Clawdbot, your AI assistant. Send me a message and I'll respond!`,
              },
            },
          },
        },
      });
      return;
    }

    if (isMessage) {
      const msg = chat.messagePayload.message;
      const senderName = msg?.sender?.displayName || "Unknown";
      const text = msg?.argumentText || msg?.text || "";
      const spaceId = msg?.space?.name?.replace("spaces/", "") || "default";

      console.log(`[googlechat] Message from ${senderName}: ${text}`);

      let responseText: string;
      try {
        // Use clawdbot CLI to get AI response
        // Escape the text for shell
        const escapedText = text.replace(/'/g, "'\\''");
        const sessionId = `googlechat:${spaceId}`;
        const result = execSync(
          `clawdbot agent --message '${escapedText}' --session-id '${sessionId}' --local 2>&1`,
          {
            timeout: 25000,  // 25 second timeout (Google Chat times out at ~30s)
            encoding: 'utf-8',
            maxBuffer: 1024 * 1024,
          }
        );
        responseText = result.trim() || "I processed your message but have no response.";
        console.log(`[googlechat] AI Response: ${responseText.slice(0, 100)}...`);
      } catch (err: any) {
        console.error(`[googlechat] CLI error:`, err.message);
        if (err.killed) {
          responseText = "Sorry, the request timed out. Please try a simpler question.";
        } else {
          responseText = "Sorry, I encountered an error processing your message.";
        }
      }

      res.json({
        hostAppDataAction: {
          chatDataAction: {
            createMessageAction: {
              message: {
                text: responseText,
              },
            },
          },
        },
      });
      return;
    }

    res.json({});
  } catch (error) {
    console.error("[googlechat] Error:", error);
    res.status(500).json({ error: "Internal error" });
  }
});

app.listen(PORT, () => {
  console.log(`[googlechat] Webhook server running on port ${PORT}`);
  console.log(`[googlechat] Local: http://localhost:${PORT}/webhook/googlechat`);
  console.log(`[googlechat] Use ngrok URL + /webhook/googlechat for Google Chat config`);
});
