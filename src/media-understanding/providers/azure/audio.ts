import type { AudioTranscriptionRequest, AudioTranscriptionResult } from "../../types.js";
import { fetchWithTimeout, normalizeBaseUrl, readErrorResponse } from "../shared.js";

export const DEFAULT_AZURE_SPEECH_REGION = "eastus2";

function resolveRegion(region?: string): string {
  const trimmed = region?.trim();
  return trimmed || process.env.AZURE_SPEECH_REGION?.trim() || DEFAULT_AZURE_SPEECH_REGION;
}

type AzureSpeechResponse = {
  RecognitionStatus: string;
  Offset?: number;
  Duration?: number;
  DisplayText?: string;
  NBest?: Array<{
    Confidence?: number;
    Display?: string;
    Lexical?: string;
  }>;
};

export async function transcribeAzureAudio(
  params: AudioTranscriptionRequest,
): Promise<AudioTranscriptionResult> {
  const fetchFn = params.fetchFn ?? fetch;
  const region = resolveRegion(params.baseUrl);
  const language = params.language?.trim() || "zh-CN";

  // Azure Speech REST API endpoint
  const url = new URL(
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1`,
  );
  url.searchParams.set("language", language);

  if (params.query) {
    for (const [key, value] of Object.entries(params.query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }

  const headers = new Headers(params.headers);
  if (!headers.has("Ocp-Apim-Subscription-Key")) {
    headers.set("Ocp-Apim-Subscription-Key", params.apiKey);
  }
  if (!headers.has("Content-Type")) {
    // Azure accepts various audio formats
    const contentType = params.mime ?? "audio/wav";
    headers.set("Content-Type", contentType);
  }
  headers.set("Accept", "application/json");

  const body = new Uint8Array(params.buffer);
  const res = await fetchWithTimeout(
    url.toString(),
    {
      method: "POST",
      headers,
      body,
    },
    params.timeoutMs,
    fetchFn,
  );

  if (!res.ok) {
    const detail = await readErrorResponse(res);
    const suffix = detail ? `: ${detail}` : "";
    throw new Error(`Azure Speech transcription failed (HTTP ${res.status})${suffix}`);
  }

  const payload = (await res.json()) as AzureSpeechResponse;

  if (payload.RecognitionStatus !== "Success") {
    throw new Error(`Azure Speech recognition failed: ${payload.RecognitionStatus}`);
  }

  const transcript = payload.DisplayText?.trim() || payload.NBest?.[0]?.Display?.trim();
  if (!transcript) {
    throw new Error("Azure Speech response missing transcript");
  }

  return { text: transcript, model: `azure-speech-${language}` };
}
