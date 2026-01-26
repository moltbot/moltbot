# Clawdbot Initial Exploration

This document summarizes the technical exploration of the Clawdbot codebase conducted on January 26, 2026. The goal is to help team members quickly understand the repository architecture and key design decisions.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Entry Points & CLI](#2-entry-points--cli)
3. [Agent Loop Architecture](#3-agent-loop-architecture)
4. [System Prompt Structure](#4-system-prompt-structure)
5. [Messages Array & LLM API Calls](#5-messages-array--llm-api-calls)
6. [Context Management](#6-context-management)
7. [Channel Integrations](#7-channel-integrations)
8. [Hooks System (Email/Gmail)](#8-hooks-system-emailgmail)
9. [Configuration](#9-configuration)
10. [External Dependencies](#10-external-dependencies)
11. [Porting Considerations](#11-porting-considerations)

---

## 1. Project Overview

**Clawdbot** is a multi-channel AI agent gateway that connects LLM-powered agents to messaging platforms (WhatsApp, Telegram, Discord, Slack, Signal, etc.).

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| CLI | `src/cli/`, `src/commands/` | Command-line interface |
| Agent Runner | `src/agents/` | Agent loop, tools, session management |
| Gateway | `src/gateway/` | HTTP server, channel management |
| Channels | `src/telegram/`, `src/discord/`, `extensions/*` | Messaging platform integrations |
| Config | `src/config/` | Configuration schema and loading |

### Tech Stack

- **Language**: TypeScript (ESM)
- **Runtime**: Node.js 22+
- **Package Manager**: pnpm (Bun also supported)
- **Agent Libraries**: `@mariozechner/pi-agent-core`, `pi-coding-agent`, `pi-ai`
- **CLI Framework**: Commander.js

---

## 2. Entry Points & CLI

### Main Entry Point

```
src/entry.ts → src/cli/run-main.ts → src/cli/program.ts
```

The CLI binary is defined in `package.json`:
```json
{
  "bin": {
    "clawdbot": "dist/entry.js"
  }
}
```

### Entry Flow

1. `src/entry.ts` - Sets process title, handles respawning for experimental warnings
2. `src/cli/run-main.ts` - Loads dotenv, normalizes env, builds the CLI program
3. `src/cli/program/build-program.ts` - Constructs Commander.js program with subcommands

### Key Commands

```bash
clawdbot gateway run      # Start the gateway server
clawdbot agent            # Run agent directly
clawdbot config get       # View configuration
clawdbot status           # Show status
```

---

## 3. Agent Loop Architecture

### Is it a ReAct Agent?

**No.** Clawdbot uses a **native tool-calling loop**, not the ReAct (Reasoning + Acting) pattern.

| Aspect | ReAct Pattern | Clawdbot (Native Tool Calling) |
|--------|---------------|-------------------------------|
| Format | Text parsing: `Thought:`, `Action:`, `Observation:` | Structured JSON tool calls from API |
| Reasoning | Explicit in output | Implicit (or via thinking tokens) |
| Reliability | Requires careful prompt engineering | Native API support, more reliable |

### The Agent Loop

```
User Message
    │
    ▼
session.prompt(userMessage)
    │
    ▼
┌─────────────────────────────────┐
│        LLM API Call             │
│   (streaming via pi-ai)         │
└─────────────┬───────────────────┘
              │
    ┌─────────┴─────────┐
    │                   │
    ▼                   ▼
Text Only          Tool Calls
(Done!)                 │
                        ▼
              Execute Tools (bash, read, edit, etc.)
                        │
                        ▼
              Feed Results to LLM
                        │
                        ▼
              Loop until no tool calls
```

### Key Files

| File | Purpose |
|------|---------|
| `src/agents/pi-embedded-runner/run.ts` | Main entry for agent runs |
| `src/agents/pi-embedded-runner/run/attempt.ts` | Single attempt execution |
| `src/agents/pi-embedded-subscribe.ts` | Event subscription for streaming |

### Code Flow

```typescript
// src/agents/pi-embedded-runner/run/attempt.ts (line 778-780)
await activeSession.prompt(effectivePrompt, { images });
```

The `session.prompt()` call is delegated to `@mariozechner/pi-coding-agent`, which uses `pi-ai`'s `streamSimple` for actual LLM API calls.

---

## 4. System Prompt Structure

The system prompt is **Clawdbot-owned** and rebuilt for each agent run.

### Structure

```
You are a personal assistant running inside Clawdbot.

## Tooling
- read: Read file contents
- write: Create or overwrite files
- edit: Make precise edits to files
- exec: Run shell commands
...

## Skills (if available)
<available_skills>
  <skill>
    <name>gog</name>
    <description>Google Workspace CLI</description>
    <location>~/.clawdbot/skills/gog/SKILL.md</location>
  </skill>
</available_skills>

## Workspace
Your working directory is: /path/to/workspace

## Current Date & Time
Time zone: America/New_York

# Project Context

## AGENTS.md
[contents of your AGENTS.md file]

## SOUL.md
[contents - persona/tone]

## Runtime
Runtime: host=MacBook | os=Darwin | model=anthropic/claude-sonnet | thinking=off
```

### Injected Bootstrap Files

These files are auto-loaded from the workspace:

- `AGENTS.md` / `CLAUDE.md` - Project instructions
- `SOUL.md` - Persona/tone
- `TOOLS.md` - Custom tool guidance
- `IDENTITY.md`, `USER.md`, `HEARTBEAT.md`

Large files are truncated at `agents.defaults.bootstrapMaxChars` (default: 20,000 chars).

### Key File

`src/agents/system-prompt.ts` - Builds the system prompt with all sections.

---

## 5. Messages Array & LLM API Calls

### Separation of Concerns

The system prompt and messages array are **passed separately** to the LLM API:

```typescript
{
  // System prompt - SEPARATE field
  system: "You are a personal assistant...",
  
  // Messages array - SEPARATE field  
  messages: [
    { role: "user", content: "Fix the bug" },
    { role: "assistant", tool_calls: [...] },
    { role: "tool", content: "file contents" },
    { role: "assistant", content: "Done!" }
  ],
  
  // Tools - SEPARATE field
  tools: [
    { name: "read", parameters: {...} },
    { name: "edit", parameters: {...} }
  ]
}
```

### Provider-Specific Formats

| Provider | System Prompt Field | Messages Field |
|----------|---------------------|----------------|
| Anthropic | `system` | `messages` |
| OpenAI | First message with `role: "system"` | `messages` |
| Google | `systemInstruction` | `contents` |

### Call Chain

```
Clawdbot
    │
    ▼
session.prompt()  (@mariozechner/pi-coding-agent)
    │
    ▼
agent.run()  (@mariozechner/pi-agent-core)
    │
    ▼
streamSimple()  (@mariozechner/pi-ai)
    │
    ▼
HTTP Request to LLM Provider API
```

---

## 6. Context Management

When the messages array grows too large, Clawdbot has multiple mechanisms to manage context.

### 6.1 Manual Compaction (`/compact`)

User-triggered summarization:

```bash
/compact                    # Summarize old messages
/compact keep recent work   # Custom instructions
```

**How it works:**
1. Takes older conversation history
2. Asks LLM to summarize into a compact entry
3. Keeps recent messages intact
4. Persists summary to session transcript

**File:** `src/agents/pi-embedded-runner/compact.ts`

### 6.2 Auto-Compaction on Context Overflow

When context window fills mid-run:

```typescript
if (isContextOverflowError(errorText)) {
  const compactResult = await compactEmbeddedPiSessionDirect({...});
  if (compactResult.compacted) {
    continue;  // Retry with compacted history
  }
}
```

### 6.3 History Turn Limiting (DM Sessions)

Limits history to last N user turns:

```typescript
// src/agents/pi-embedded-runner/history.ts
function limitHistoryTurns(messages, limit) {
  // Keeps last N user turns + associated assistant responses
}
```

Configuration:
```yaml
channels:
  telegram:
    dmHistoryLimit: 20
    dms:
      "123456789":
        historyLimit: 50  # Per-user override
```

### 6.4 Context Pruning (In-Memory Only)

Removes old tool results **without** rewriting the transcript:

```typescript
// src/agents/pi-extensions/context-pruning.ts
// Only affects in-memory context for current request
```

### User Commands

| Command | Purpose |
|---------|---------|
| `/status` | Shows context usage |
| `/context list` | Detailed breakdown |
| `/compact` | Manual compaction |

---

## 7. Channel Integrations

Channels are loaded as **plugins** from `extensions/`.

### Architecture

```
Gateway Server (src/gateway/)
    │
    ▼
Channel Manager (src/gateway/server-channels.ts)
    │
    ├── WhatsApp (extensions/whatsapp/)
    ├── Telegram (extensions/telegram/)
    ├── Discord (src/discord/)
    ├── Slack (src/slack/)
    ├── Signal (src/signal/)
    └── ... more channels
```

### Plugin Structure

```typescript
// extensions/telegram/index.ts
const plugin = {
  id: "telegram",
  name: "Telegram",
  register(api: ClawdbotPluginApi) {
    api.registerChannel({ plugin: telegramPlugin });
  },
};
```

### Channel Manager Responsibilities

1. **Starts** each channel plugin when gateway boots
2. **Routes** incoming messages to the agent
3. **Sends** agent responses back through the channel

---

## 8. Hooks System (Email/Gmail)

**Important:** Email (Gmail) is NOT a channel - it's a **webhook-based hook**.

### Architecture

```
Gmail API
    │
    ▼
Google Cloud Pub/Sub
    │
    ▼
gog binary (external tool)
  └── `gog gmail watch serve`
    │
    ▼
HTTP POST to /hooks/gmail
    │
    ▼
Clawdbot Hook Handler
    │
    ▼
Agent (one-way trigger, no reply)
```

### Key Difference from Channels

| Aspect | Channels (WhatsApp, Telegram) | Hooks (Gmail) |
|--------|------------------------------|---------------|
| Direction | Bidirectional | One-way trigger |
| Integration | Native SDK | External tool + webhook |
| Response | Auto-reply to sender | No automatic reply |

### gog Tool

`gog` is an **external CLI** by Peter Steinberger for Google Workspace:

```bash
# Install
brew install steipete/tap/gogcli

# Setup (one-time)
gog auth credentials /path/to/client_secret.json
gog auth add you@gmail.com --services gmail,calendar,drive

# Gmail watch (used by Clawdbot)
gog gmail watch start --account you@gmail.com --topic my-topic
gog gmail watch serve --hook-url http://localhost/hooks/gmail
```

Clawdbot **delegates** Gmail credential management to gog - it only reads gog's credential file to get the GCP project ID.

### Hook Mapping

```typescript
// src/gateway/hooks-mapping.ts
const hookPresetMappings = {
  gmail: [{
    id: "gmail",
    match: { path: "gmail" },
    action: "agent",
    sessionKey: "hook:gmail:{{messages[0].id}}",
    messageTemplate: "New email from {{messages[0].from}}\nSubject: {{messages[0].subject}}"
  }]
};
```

---

## 9. Configuration

### Location

```
~/.clawdbot/clawdbot.json
```

JSON5 format (comments and trailing commas allowed).

### Example Configuration

```json5
{
  agents: {
    defaults: {
      workspace: "~/clawd",
      bootstrapMaxChars: 20000,
      userTimezone: "America/New_York",
      contextPruning: { mode: "off" }
    }
  },
  
  channels: {
    telegram: {
      token: "BOT_TOKEN",
      allowFrom: ["+15555550123"],
      dmHistoryLimit: 20
    }
  },
  
  hooks: {
    enabled: true,
    gmail: {
      account: "you@gmail.com",
      topic: "projects/your-project/topics/gmail-watch"
    }
  }
}
```

### CLI Commands

```bash
clawdbot config get                           # View config
clawdbot config set agents.defaults.workspace ~/projects  # Set value
clawdbot doctor --fix                         # Diagnose/repair
```

### Validation

Clawdbot **strictly validates** config on startup. Invalid configs prevent the gateway from starting.

---

## 10. External Dependencies

### Pi-Agent Libraries (Mario Zechner)

| Package | Purpose |
|---------|---------|
| `@mariozechner/pi-ai` | Unified LLM API, streaming, multi-provider |
| `@mariozechner/pi-agent-core` | Agent loop, tool execution |
| `@mariozechner/pi-coding-agent` | Session management, compaction |
| `@mariozechner/pi-tui` | Terminal UI |

**Note:** These are **TypeScript/Node.js only** - no Python version exists.

### Pi-Agent Philosophy

From Mario Zechner's blog:

> "If I don't need it, it won't be built."

Key design choices:
- **Minimal system prompt** (~1000 tokens)
- **4 core tools**: read, write, edit, bash
- **No MCP support** - "use CLI tools with READMEs instead"
- **No sub-agents** - "spawn yourself via bash"
- **No plan mode** - "write to a PLAN.md file"
- **YOLO by default** - no permission prompts

---

## 11. Porting Considerations

### Porting to Python/LangGraph

**Core agent loop difficulty: Easy**

The loop is simple and could be implemented in ~40 lines with LangGraph:

```python
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode

graph = StateGraph(AgentState)
graph.add_node("agent", call_model)
graph.add_node("tools", ToolNode(tools))
graph.add_conditional_edges("agent", should_continue)
graph.add_edge("tools", "agent")
agent = graph.compile()
```

### Difficulty Breakdown

| Component | Difficulty | Notes |
|-----------|------------|-------|
| Basic loop | Easy | LangGraph has this built-in |
| Streaming | Easy | LangGraph supports streaming |
| Session persistence | Medium | Custom branching model |
| Multi-provider failover | Medium | Auth rotation, rate limits |
| Context compaction | Medium | Summarization logic |
| WhatsApp integration | Hard | Baileys is Node.js only |
| Channel integrations | Hard | Multiple platforms |
| Multi-account support | Hard | Per-channel complexity |

### Python Alternatives to Pi-Agent

| Framework | Notes |
|-----------|-------|
| LangGraph | Graph-based, more abstraction |
| PydanticAI | Lightweight, type-safe |
| Anthropic SDK | Direct API with tool support |
| Roll your own | ~200 lines for basics |

### Key Insight

> The value in Clawdbot is the **integrations and production infrastructure**, not the agent loop itself. The loop is trivial; everything around it is complex.

---

## Summary

Clawdbot is a well-architected multi-channel AI gateway with:

1. **Clean separation**: CLI → Gateway → Channels → Agent
2. **Plugin system**: Channels loaded as extensions
3. **Delegated LLM calls**: Via pi-ai library
4. **Flexible context management**: Compaction, pruning, history limits
5. **Webhook hooks**: For non-chat integrations (Gmail)
6. **User-controlled config**: JSON5 at `~/.clawdbot/clawdbot.json`

The core agent loop is simple (tool-calling loop), but the production value comes from the channel integrations, session management, and operational features.

---

*Document created: January 26, 2026*
*Based on exploration of clawdbot repository*
