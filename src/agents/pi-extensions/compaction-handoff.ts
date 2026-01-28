import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI, FileOperations } from "@mariozechner/pi-coding-agent";
import { completeSimple } from "@mariozechner/pi-ai";

import { log } from "../pi-embedded-runner/logger.js";

type ModelSnapshotEntry = {
  timestamp: number;
  provider?: string;
  modelApi?: string | null;
  modelId?: string;
};

type CustomEntryLike = { type?: unknown; customType?: unknown; data?: unknown };

const MODEL_SNAPSHOT_CUSTOM_TYPE = "model-snapshot";

function readLastModelSnapshot(entries: Array<CustomEntryLike>): ModelSnapshotEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type !== "custom" || entry?.customType !== MODEL_SNAPSHOT_CUSTOM_TYPE) continue;
    const data = entry?.data as ModelSnapshotEntry | undefined;
    if (data && typeof data === "object") return data;
  }
  return null;
}

const SYSTEM_PROMPT =
  "You are a compaction summarizer. Produce a concise summary for future context." +
  " Do not continue the conversation or answer questions.";
const DEFAULT_INSTRUCTIONS =
  "Summarize the conversation for continuity. Preserve exact file paths, commands, and errors." +
  " Keep it concise.";

function computeFileLists(fileOps: FileOperations): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const modified = new Set([...fileOps.edited, ...fileOps.written]);
  const readFiles = [...fileOps.read].filter((f) => !modified.has(f)).sort();
  const modifiedFiles = [...modified].sort();
  return { readFiles, modifiedFiles };
}

function extractTextFromBlocks(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (!block || typeof block !== "object") return "";
      const rec = block as { type?: unknown; text?: unknown; thinking?: unknown; name?: unknown };
      if (rec.type === "text" && typeof rec.text === "string") return rec.text;
      if (rec.type === "thinking" && typeof rec.thinking === "string") return rec.thinking;
      if (rec.type === "toolCall" && typeof rec.name === "string") return `[tool:${rec.name}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function serializeConversation(messages: AgentMessage[]): string {
  const parts: string[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    switch (msg.role) {
      case "user": {
        const text = extractTextFromBlocks((msg as { content?: unknown }).content);
        if (text) parts.push(`[User]: ${text}`);
        break;
      }
      case "assistant": {
        const text = extractTextFromBlocks((msg as { content?: unknown }).content);
        if (text) parts.push(`[Assistant]: ${text}`);
        break;
      }
      case "toolResult": {
        const text = extractTextFromBlocks((msg as { content?: unknown }).content);
        if (text) parts.push(`[Tool result]: ${text}`);
        break;
      }
      case "bashExecution": {
        const rec = msg as {
          command?: string;
          output?: string;
          exitCode?: number | undefined;
          cancelled?: boolean;
        };
        const command = rec.command ?? "";
        const output = rec.output ?? "";
        const suffix = rec.cancelled ? " (cancelled)" : "";
        const exit = rec.exitCode != null ? ` (exit ${rec.exitCode})` : "";
        parts.push(`[Bash]: ${command}${suffix}${exit}\n${output}`.trim());
        break;
      }
      case "custom":
      case "branchSummary":
      case "compactionSummary": {
        const text = extractTextFromBlocks(
          (msg as { content?: unknown; summary?: string }).content,
        );
        const summary = (msg as { summary?: string }).summary;
        const payload = text || summary || "";
        if (payload) parts.push(`[Context]: ${payload}`);
        break;
      }
      default:
        break;
    }
  }
  return parts.join("\n\n");
}

function summarizeRoleCounts(messages: AgentMessage[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const msg of messages) {
    const role = (msg as { role?: unknown }).role;
    if (typeof role !== "string") continue;
    counts[role] = (counts[role] ?? 0) + 1;
  }
  return counts;
}

async function summarizeMessages(params: {
  messages: AgentMessage[];
  model: NonNullable<import("@mariozechner/pi-coding-agent").ExtensionContext["model"]>;
  apiKey: string;
  signal: AbortSignal;
  reserveTokens: number;
  instructions?: string;
  previousSummary?: string;
  fileOpsText?: string;
}): Promise<string> {
  const base = params.instructions?.trim() || DEFAULT_INSTRUCTIONS;
  const llmText = serializeConversation(params.messages);
  let prompt = `${base}\n\n<conversation>\n${llmText}\n</conversation>`;
  if (params.fileOpsText) {
    prompt += `\n\n${params.fileOpsText}`;
  }

  const maxTokens = Math.max(1, Math.floor(params.reserveTokens * 0.8));
  const response = await completeSimple(
    params.model,
    {
      systemPrompt: SYSTEM_PROMPT,
      messages: [
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: prompt }],
          timestamp: Date.now(),
        },
      ],
    },
    { maxTokens, signal: params.signal, apiKey: params.apiKey },
  );
  if (response.stopReason === "error") {
    throw new Error(`Compaction summarization failed: ${response.errorMessage || "Unknown error"}`);
  }
  return response.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

type CompactionPreparationLike = {
  firstKeptEntryId: string;
  messagesToSummarize: AgentMessage[];
  turnPrefixMessages: AgentMessage[];
  isSplitTurn: boolean;
  tokensBefore: number;
  previousSummary?: string;
  fileOps: FileOperations;
  settings: { reserveTokens: number };
};

function buildSplitTurnMessages(
  messagesToSummarize: AgentMessage[],
  turnPrefixMessages: AgentMessage[],
): AgentMessage[] {
  if (turnPrefixMessages.length === 0) return messagesToSummarize;
  const marker: AgentMessage = {
    role: "custom",
    customType: "split-turn",
    display: false,
    timestamp: Date.now(),
    content: [
      {
        type: "text",
        text: "[Split turn prefix follows; summarize with the rest of the conversation.]",
      },
    ],
  };
  return [...messagesToSummarize, marker, ...turnPrefixMessages];
}

export default function compactionFreeformExtension(api: ExtensionAPI): void {
  api.on("session_before_compact", async (event, ctx) => {
    const { preparation, customInstructions, signal } = event;
    let model = ctx.model;
    if (!model) {
      const snapshot = readLastModelSnapshot(ctx.sessionManager.getEntries() as CustomEntryLike[]);
      if (snapshot?.provider && snapshot?.modelId) {
        model = ctx.modelRegistry.find(snapshot.provider, snapshot.modelId);
      }
    }
    if (!model) {
      log.warn("compaction handoff: missing model");
      return;
    }
    const apiKey = await ctx.modelRegistry.getApiKey(model);
    if (!apiKey) {
      log.warn("compaction handoff: missing api key");
      return;
    }

    const messagesToSummarize = preparation.messagesToSummarize ?? [];
    const turnPrefixMessages = preparation.turnPrefixMessages ?? [];
    const mergedMessages = buildSplitTurnMessages(messagesToSummarize, turnPrefixMessages);
    const messagesForSummary = mergedMessages;
    const roleCounts = summarizeRoleCounts(messagesForSummary);
    const prefixRoleCounts = summarizeRoleCounts(turnPrefixMessages);
    const firstRoles = messagesForSummary
      .slice(0, 6)
      .map((msg: AgentMessage) => msg.role)
      .join(",");
    log.info("compaction handoff: input snapshot", {
      messagesToSummarize: messagesToSummarize.length,
      turnPrefixMessages: turnPrefixMessages.length,
      mergedMessages: mergedMessages.length,
      isSplitTurn: preparation.isSplitTurn,
      roleCounts,
      prefixRoleCounts,
      firstRoles,
    });

    const { readFiles, modifiedFiles } = computeFileLists(preparation.fileOps);
    const previousSummary = preparation.previousSummary;
    const fileOpsText = "";
    const conversationPreview = serializeConversation(messagesForSummary);
    log.debug("compaction handoff: running", {
      messagesToSummarize: messagesToSummarize.length,
      turnPrefixMessages: turnPrefixMessages.length,
      instructionsChars: customInstructions?.length ?? 0,
      conversationChars: conversationPreview.length,
      conversationPreview: conversationPreview.slice(0, 400),
      model: `${model.provider}/${model.id}`,
    });

    try {
      const historySummary = await summarizeMessages({
        messages: messagesForSummary,
        model,
        apiKey,
        signal,
        reserveTokens: preparation.settings.reserveTokens,
        instructions: customInstructions,
        previousSummary,
        fileOpsText,
      });

      return {
        compaction: {
          summary: historySummary,
          firstKeptEntryId: preparation.firstKeptEntryId,
          tokensBefore: preparation.tokensBefore,
          details: { readFiles, modifiedFiles },
        },
      };
    } catch (error) {
      console.warn(
        `Handoff compaction failed; falling back to default compaction: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return;
    }
  });
}
