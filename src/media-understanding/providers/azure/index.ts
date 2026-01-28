import type { MediaUnderstandingProvider } from "../../types.js";
import { transcribeAzureAudio } from "./audio.js";

export function buildAzureProvider(): MediaUnderstandingProvider {
  return {
    id: "azure",
    transcribeAudio: transcribeAzureAudio,
  };
}
