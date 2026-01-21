import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { ExtensionAPI, FileOperations } from "@mariozechner/pi-coding-agent";

const FALLBACK_SUMMARY =
  "Summary unavailable due to context limits. Older messages were truncated.";
const MAX_TOOL_FAILURES = 8;
const MAX_TOOL_FAILURE_CHARS = 240;

type ToolFailure = {
  toolCallId: string;
  toolName: string;
  summary: string;
  meta?: string;
};

function normalizeFailureText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function truncateFailureText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, Math.max(0, maxChars - 3))}...`;
}

function formatToolFailureMeta(details: unknown): string | undefined {
  if (!details || typeof details !== "object") return undefined;
  const record = details as Record<string, unknown>;
  const status = typeof record.status === "string" ? record.status : undefined;
  const exitCode =
    typeof record.exitCode === "number" && Number.isFinite(record.exitCode)
      ? record.exitCode
      : undefined;
  const parts: string[] = [];
  if (status) parts.push(`status=${status}`);
  if (exitCode !== undefined) parts.push(`exitCode=${exitCode}`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function extractToolResultText(content: unknown): string {
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const rec = block as { type?: unknown; text?: unknown };
    if (rec.type === "text" && typeof rec.text === "string") {
      parts.push(rec.text);
    }
  }
  return parts.join("\n");
}

function collectToolFailures(messages: AgentMessage[]): ToolFailure[] {
  const failures: ToolFailure[] = [];
  const seen = new Set<string>();

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const role = (message as { role?: unknown }).role;
    if (role !== "toolResult") continue;
    const toolResult = message as {
      toolCallId?: unknown;
      toolName?: unknown;
      content?: unknown;
      details?: unknown;
      isError?: unknown;
    };
    if (toolResult.isError !== true) continue;
    const toolCallId = typeof toolResult.toolCallId === "string" ? toolResult.toolCallId : "";
    if (!toolCallId || seen.has(toolCallId)) continue;
    seen.add(toolCallId);

    const toolName =
      typeof toolResult.toolName === "string" && toolResult.toolName.trim()
        ? toolResult.toolName
        : "tool";
    const rawText = extractToolResultText(toolResult.content);
    const meta = formatToolFailureMeta(toolResult.details);
    const normalized = normalizeFailureText(rawText);
    const summary = truncateFailureText(
      normalized || (meta ? "failed" : "failed (no output)"),
      MAX_TOOL_FAILURE_CHARS,
    );
    failures.push({ toolCallId, toolName, summary, meta });
  }

  return failures;
}

function formatToolFailuresSection(failures: ToolFailure[]): string {
  if (failures.length === 0) return "";
  const lines = failures.slice(0, MAX_TOOL_FAILURES).map((failure) => {
    const meta = failure.meta ? ` (${failure.meta})` : "";
    return `- ${failure.toolName}${meta}: ${failure.summary}`;
  });
  if (failures.length > MAX_TOOL_FAILURES) {
    lines.push(`- ...and ${failures.length - MAX_TOOL_FAILURES} more`);
  }
  return `\n\n## Tool Failures\n${lines.join("\n")}`;
}

function computeFileLists(fileOps: FileOperations): {
  readFiles: string[];
  modifiedFiles: string[];
} {
  const modified = new Set([...fileOps.edited, ...fileOps.written]);
  const readFiles = [...fileOps.read].filter((f) => !modified.has(f)).sort();
  const modifiedFiles = [...modified].sort();
  return { readFiles, modifiedFiles };
}

function formatFileOperations(readFiles: string[], modifiedFiles: string[]): string {
  const sections: string[] = [];
  if (readFiles.length > 0) {
    sections.push(`<read-files>\n${readFiles.join("\n")}\n</read-files>`);
  }
  if (modifiedFiles.length > 0) {
    sections.push(`<modified-files>\n${modifiedFiles.join("\n")}\n</modified-files>`);
  }
  if (sections.length === 0) return "";
  return `\n\n${sections.join("\n\n")}`;
}

export default function compactionSafeguardExtension(api: ExtensionAPI): void {
  api.on("session_before_compact", async (event, _ctx) => {
    const { preparation } = event;
    const { readFiles, modifiedFiles } = computeFileLists(preparation.fileOps);
    const fileOpsSummary = formatFileOperations(readFiles, modifiedFiles);
    const toolFailures = collectToolFailures([
      ...preparation.messagesToSummarize,
      ...preparation.turnPrefixMessages,
    ]);
    const toolFailureSection = formatToolFailuresSection(toolFailures);
    const fallbackSummary = `${FALLBACK_SUMMARY}${toolFailureSection}${fileOpsSummary}`;

    // Skip LLM summarization to prevent context overflow during compaction.
    // Use trailing truncation via context pruning instead.
    console.warn(
      `[compaction-safeguard] Skipping summarization, using trailing truncation fallback.`,
    );
    return {
      compaction: {
        summary: fallbackSummary,
        firstKeptEntryId: preparation.firstKeptEntryId,
        tokensBefore: preparation.tokensBefore,
        details: { readFiles, modifiedFiles },
      },
    };
  });
}

export const __testing = {
  collectToolFailures,
  formatToolFailuresSection,
} as const;
