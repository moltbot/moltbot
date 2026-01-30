/**
 * Lightweight title generation endpoint using the embedded Pi agent runtime.
 * Uses runAgent() so auth (including OAuth) is handled properly.
 * No persistent session creation — temp session file is cleaned up after.
 *
 * Route: POST /api/utils/generate-title
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  resolveAgentDir,
  resolveDefaultAgentId,
  resolveAgentWorkspaceDir,
} from "../agents/agent-scope.js";
import { runAgent } from "../agents/runtime-dispatcher.js";
import { loadConfig } from "../config/config.js";
import { authorizeGatewayConnect, type ResolvedGatewayAuth } from "./auth.js";
import {
  readJsonBodyOrError,
  sendJson,
  sendMethodNotAllowed,
  sendUnauthorized,
} from "./http-common.js";
import { getBearerToken } from "./http-utils.js";

type TitleRequest = {
  messages?: Array<{ role?: string; content?: string }>;
};

type TitleResponse = {
  title: string;
  icon: string;
};

const TITLE_MODEL = "claude-haiku-4-5";

export async function handleTitleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { auth: ResolvedGatewayAuth; trustedProxies?: string[] },
): Promise<boolean> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host || "localhost"}`);
  if (url.pathname !== "/api/utils/generate-title") return false;

  if (req.method !== "POST") {
    sendMethodNotAllowed(res);
    return true;
  }

  // Auth — same as other gateway endpoints
  const token = getBearerToken(req);
  const authResult = await authorizeGatewayConnect({
    auth: opts.auth,
    connectAuth: { token, password: token },
    req,
    trustedProxies: opts.trustedProxies,
  });
  if (!authResult.ok) {
    sendUnauthorized(res);
    return true;
  }

  const body = await readJsonBodyOrError(req, res, 64 * 1024);
  if (body === undefined) return true;

  const payload = body as TitleRequest;
  const messages = payload.messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    sendJson(res, 400, { error: { message: "messages required", type: "invalid_request_error" } });
    return true;
  }

  // Extract conversation snippets
  const userMsgs = messages.filter((m) => m.role === "user");
  const asstMsgs = messages.filter((m) => m.role === "assistant");
  const userText = userMsgs
    .slice(-3)
    .map((m) => m.content ?? "")
    .join("\n")
    .slice(0, 500);
  const asstText = asstMsgs
    .slice(-2)
    .map((m) => m.content ?? "")
    .join("\n")
    .slice(0, 300);

  if (!userText.trim()) {
    sendJson(res, 400, { error: { message: "no user messages", type: "invalid_request_error" } });
    return true;
  }

  let tempSessionFile: string | null = null;

  try {
    const cfg = loadConfig();
    const agentId = resolveDefaultAgentId(cfg);
    const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
    const agentDir = resolveAgentDir(cfg, agentId);

    // Temp session file — cleaned up after the call
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-title-"));
    tempSessionFile = path.join(tempDir, "session.jsonl");

    const prompt = [
      "Generate a short title (3-6 words) and a single topic emoji for this conversation.",
      "Reply with ONLY: emoji title",
      "Example: 🔧 Fix Login Page Bug",
      "",
      `User: ${userText}`,
      asstText ? `\nAssistant: ${asstText}` : "",
    ].join("\n");

    const result = await runAgent({
      sessionId: `title-gen-${Date.now()}`,
      sessionKey: "temp:title-generator",
      sessionFile: tempSessionFile,
      workspaceDir,
      agentDir,
      config: cfg,
      prompt,
      model: TITLE_MODEL,
      provider: "anthropic",
      disableTools: true,
      timeoutMs: 15_000,
      runId: `title-gen-${Date.now()}`,
    });

    // Extract text from agent payloads
    const rawText =
      result.payloads
        ?.map((p) => p.text ?? "")
        .join("")
        .trim() ?? "";

    const cleaned = rawText
      .replace(/^["']+|["']+$/g, "")
      .replace(/\*+/g, "")
      .trim();

    if (!cleaned) {
      sendJson(res, 200, { title: "", icon: "" } satisfies TitleResponse);
      return true;
    }

    // Parse "emoji title" format
    const segments = [...new Intl.Segmenter().segment(cleaned)];
    const firstSeg = segments[0]?.segment ?? "";
    const isEmoji = firstSeg && !/^[a-zA-Z0-9]/.test(firstSeg);

    const titleResult: TitleResponse = isEmoji
      ? { title: cleaned.slice(firstSeg.length).trim(), icon: firstSeg }
      : { title: cleaned, icon: "" };

    sendJson(res, 200, titleResult);
  } catch (err) {
    sendJson(res, 500, { error: { message: String(err), type: "api_error" } });
  } finally {
    // Clean up temp session file
    if (tempSessionFile) {
      try {
        await fs.rm(path.dirname(tempSessionFile), { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }
  return true;
}
