import { sanitizeGoogleTurnOrdering } from "./bootstrap.js";

export function isGoogleModelApi(api?: string | null): boolean {
  return (
    api === "google-gemini-cli" || api === "google-generative-ai" || api === "google-antigravity"
  );
}

export function isAntigravityClaude(params: {
  api?: string | null;
  provider?: string | null;
  modelId?: string;
}): boolean {
  const provider = params.provider?.toLowerCase();
  const api = params.api?.toLowerCase();
  if (provider !== "google-antigravity" && api !== "google-antigravity") return false;
  return params.modelId?.toLowerCase().includes("claude") ?? false;
}

export { sanitizeGoogleTurnOrdering };

export function sanitizeToolUseInput(messages: any[]): any[] {
  return messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg;
    if (msg.role !== "assistant" && msg.role !== "toolUse") return msg;
    if (!Array.isArray(msg.content)) return msg;

    return {
      ...msg,
      content: msg.content.map((block: any) => {
        if (!block || typeof block !== "object") return block;
        if (block.type === "toolUse" || block.type === "toolCall") {
          // If input is missing, add empty object
          if (!("input" in block) || block.input === undefined) {
            return { ...block, input: {} };
          }
        }
        return block;
      }),
    };
  });
}
