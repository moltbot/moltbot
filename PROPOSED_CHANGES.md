# Proposed Clawdbot Improvements

## Issue: Hallucination after failed compaction summary

When compaction summarization fails (no API key, error, etc.), the agent receives:
"Summary unavailable due to context limits. Older messages were truncated."

This provides ZERO context, leading to hallucination about non-existent conversations.

## Proposed Fix 1: Better fallback message

In `src/agents/pi-extensions/compaction-safeguard.ts`:

```typescript
const FALLBACK_SUMMARY = [
  "Summary unavailable due to context limits. Older messages were truncated.",
  "",
  "⚠️ IMPORTANT: You have NO context from previous messages.",
  "Before continuing:",
  "1. Read CURRENT_WORK.md if it exists",
  "2. Read memory/YYYY-MM-DD.md for today's context", 
  "3. ASK the user what they were working on if unclear",
  "4. DO NOT assume or hallucinate previous conversation content",
].join("\n");
```

## Proposed Fix 2: Better default memory flush prompt

In `src/auto-reply/reply/memory-flush.ts`:

```typescript
export const DEFAULT_MEMORY_FLUSH_PROMPT = [
  "Pre-compaction memory flush.",
  "MANDATORY: Update CURRENT_WORK.md with the current task and context.",
  "Also store durable memories to memory/YYYY-MM-DD.md.",
  `If nothing to store, reply with ${SILENT_REPLY_TOKEN}.`,
].join(" ");
```

## Why this matters

Without proper context recovery instructions, Claude will:
- Hallucinate about previous conversations
- Continue non-existent tasks
- Confuse users with irrelevant responses

The fix ensures the agent knows to CHECK files and ASK rather than assume.
