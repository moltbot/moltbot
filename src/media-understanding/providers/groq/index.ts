import { GROQ_API_BASE } from "../../../config/api-endpoints.js";
import type { MediaUnderstandingProvider } from "../../types.js";
import { transcribeOpenAiCompatibleAudio } from "../openai/audio.js";

const DEFAULT_GROQ_AUDIO_BASE_URL = GROQ_API_BASE;

export const groqProvider: MediaUnderstandingProvider = {
  id: "groq",
  capabilities: ["audio"],
  transcribeAudio: (req) =>
    transcribeOpenAiCompatibleAudio({
      ...req,
      baseUrl: req.baseUrl ?? DEFAULT_GROQ_AUDIO_BASE_URL,
    }),
};
