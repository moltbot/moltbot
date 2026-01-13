import fs from "node:fs/promises";
import path from "node:path";

export type GeminiDescribeOptions = {
  filePath: string;
  apiKey: string;
  model?: string;
  prompt?: string;
  timeoutMs?: number;
};

export type VideoDescriptionResult = {
  text: string;
  provider: "gemini";
  model: string;
};

const GEMINI_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-3-flash-preview";
const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes for video processing

const DEFAULT_PROMPT = `You are analyzing a video sent in a chat conversation. Provide a detailed but concise description (2-4 sentences) that captures:
- The main action or subject of the video
- Key visual elements (people, objects, setting)
- Any notable movement, changes, or events
- Mood or context if apparent

Be specific and descriptive so someone who hasn't seen the video understands what it shows.`;

function guessMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".mp4":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".avi":
      return "video/x-msvideo";
    case ".mkv":
      return "video/x-matroska";
    case ".3gp":
      return "video/3gpp";
    default:
      return "video/mp4";
  }
}

export async function describeVideoViaGemini(
  options: GeminiDescribeOptions,
): Promise<VideoDescriptionResult> {
  const {
    filePath,
    apiKey,
    model = DEFAULT_MODEL,
    prompt = DEFAULT_PROMPT,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options;

  const buffer = await fs.readFile(filePath);
  const base64Data = buffer.toString("base64");
  const mimeType = guessMime(filePath);

  const endpoint = `${GEMINI_ENDPOINT}/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mimeType, data: base64Data } },
          { text: prompt },
        ],
      },
    ],
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const responseText = await res.text();

    if (!res.ok) {
      const errorPreview = responseText.slice(0, 500);
      throw new Error(`Gemini API error (HTTP ${res.status}): ${errorPreview}`);
    }

    const json = JSON.parse(responseText) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };

    const description = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

    return {
      text: description.trim(),
      provider: "gemini",
      model,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
