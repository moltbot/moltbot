# Claude Code Planning Plugin

AI-to-AI orchestration for Claude Code sessions.

## Overview

This plugin provides tools for agents to:
- **Load and cache project context** - Understand project structure, conventions, and preferences
- **Start Claude Code sessions** - Spawn enriched Claude Code sessions with full context

## Phase 1 (Current)

Core plugin functionality without Telegram integration.

## Installation

```bash
# From npm (once published)
clawdbot plugins install @clawdbot/claude-code-planning

# Local development
clawdbot plugins install ./extensions/claude-code-planning -l
```

## Configuration

Add to your Clawdbot config:

```json5
{
  plugins: {
    entries: {
      "claude-code-planning": {
        enabled: true,
        config: {
          // Where to store cached project contexts
          projectsBase: "~/clawd/projects",

          // Directories to search for projects
          projectDirs: [
            "~/Documents/agent",
            "~/Projects",
            "~/code"
          ],

          // Days before context is considered stale
          stalenessDays: 7,

          // Default permission mode for sessions
          permissionMode: "default", // or "acceptEdits" or "bypassPermissions"

          // Default model (optional)
          model: "sonnet",

          // Explicit project aliases
          projects: {
            "myproject": "~/custom/path/myproject"
          }
        }
      }
    }
  }
}
```

## Tools

### project_context

Load, explore, or update project context.

**Actions:**
- `load` - Load cached context (explores if missing/stale)
- `explore` - Force re-exploration
- `update` - Add preferences or session summaries
- `list` - List all projects with cached context
- `format` - Format context as markdown

**Example:**
```typescript
{
  action: "load",
  project: "myproject"
}
```

### claude_code_start

Start a Claude Code session with enriched context.

**Parameters:**
- `project` - Project name or path (required)
- `prompt` - The enriched prompt for Claude Code (required)
- `originalTask` - Original user task before enrichment
- `worktree` - Git worktree name (e.g., "@experimental")
- `resumeToken` - Resume existing session
- `permissionMode` - Override default permission mode
- `model` - Override default model

**Example:**
```typescript
{
  project: "myproject",
  prompt: "Implement the user authentication feature using JWT tokens. Follow the existing patterns in src/auth/.",
  originalTask: "add auth",
  planningDecisions: ["Use JWT for tokens", "Store in httpOnly cookies"]
}
```

## Workflow

1. Agent receives user request
2. Agent uses `project_context` to load/explore project
3. Agent analyzes task and formulates enriched prompt
4. Agent uses `claude_code_start` to spawn session
5. Session runs in background

## Project Context

Context is stored in YAML format at:
```
~/clawd/projects/<project-name>/context.yaml
```

**Context Schema:**
```yaml
name: myproject
path: /path/to/project
lastExplored: 2026-01-24T04:30:00Z
type: React + TypeScript
packageManager: pnpm
testFramework: vitest
buildTool: vite
structure:
  src/: Source code
  src/components/: React components
conventions:
  - "Uses TypeScript strict mode"
  - "Uses Tailwind CSS"
claudeMd: |
  # Project Guidelines
  ...
preferences:
  - "Prefer pnpm over npm"
recentSessions:
  - date: 2026-01-23
    task: "Add dark mode"
    outcome: completed
```

## Phase 2: Telegram Bubble Integration

### Overview

Phase 2 adds Telegram bubble support for session status visualization. The core bubble-service has been significantly improved with race condition fixes that must inform our integration approach.

### Core Bubble-Service Improvements (Reference)

The main branch now includes critical improvements in `src/agents/claude-code/bubble-service.ts`:

#### 1. Two-Layer Race Protection

**Problem:** Stale "working" status could overwrite "completed/cancelled" due to buffered events arriving after session exit.

**Solution:** Protection at two levels:

```
Session Layer (session.ts):
├── finalStateNotified flag on ClaudeCodeSessionData
├── Blocks redundant onStateChange callbacks after session ends
└── Logs: "Ignoring redundant end-state callback"

Bubble Layer (bubble-service.ts):
├── finalized flag on PendingUpdate
├── Checked before any updateSessionBubble processing
├── Clears pending timers when session ends
└── Logs: "Session already finalized - ignoring update"
```

#### 2. Persistent Bubble Registry

**Problem:** Gateway restarts left bubbles stuck in "working" state forever.

**Solution:** File-based persistence at `~/.clawdbot/bubble-registry.json`:

```typescript
interface BubbleRegistryEntry {
  sessionId: string;
  resumeToken: string;
  chatId: string;
  messageId: string;
  threadId?: number;
  accountId?: string;
  projectName: string;
  workingDir: string;
  createdAt: number;
}
```

Key functions:
- `addToBubbleRegistry()` - Called on bubble creation
- `removeFromBubbleRegistry()` - Called on normal bubble completion
- `loadBubbleRegistry()` / `saveBubbleRegistry()` - File I/O

#### 3. Recovery on Gateway Restart

**Problem:** After crash/restart, bubbles had no mechanism to reflect actual session state.

**Solution:** `recoverOrphanedBubbles()` called from `gateway-daemon.ts` startup:

1. Loads bubble registry
2. For each entry, checks if session is still active
3. If active: re-registers bubble in `activeBubbles` map
4. If ended: parses session file, updates bubble to final state

#### 4. Auto-Delete Stale Bubbles

**Problem:** Telegram messages >48h old cannot be edited, causing error spam.

**Solution:** Graceful handling of edit failures:

```typescript
try {
  await editMessageTelegram(...);
} catch (err) {
  if (err.message.includes("can't be edited")) {
    await deleteMessageTelegram(...); // Clean up stale bubble
  }
}
```

### Phase 2 Architecture Decision

**Recommended: Option A - Import Core Bubble-Service Directly**

The plugin should import and use the core bubble-service rather than implementing its own:

```typescript
// extensions/claude-code-planning/src/telegram-integration.ts
import {
  createSessionBubble,
  updateSessionBubble,
  completeSessionBubble,
  recoverOrphanedBubbles,
} from "../../../src/agents/claude-code/bubble-service.js";
```

#### Tradeoff Analysis

| Approach | Pros | Cons |
|----------|------|------|
| **A: Import core** | DRY, inherits all fixes, single source of truth | Plugin depends on core internals, version coupling |
| **B: Copy to plugin** | Independence, can modify freely | Duplicated code, must manually sync fixes |
| **C: Minimal subset** | Lightweight, targeted | Misses edge case handling, likely reintroduces bugs |

**Decision Rationale:**

1. The race condition fixes are subtle and hard to get right
2. The recovery mechanism requires gateway integration (already in core)
3. The Telegram API integration (send/edit/delete) is already in core
4. Plugin is in same repo, so version coupling is acceptable

### Phase 2 Implementation Tasks

1. **Expose bubble-service from core** (if not already exported)
   - Ensure functions are exported from package entry point
   - Or use relative imports (monorepo benefit)

2. **Wire session callbacks to bubble-service**
   - `onStateChange` → `updateSessionBubble()`
   - Session end → `completeSessionBubble()`

3. **Handle plugin lifecycle**
   - Plugin enable → register for bubble updates
   - Plugin disable → clean up any plugin-specific state

4. **Configuration**
   - Add `telegram.enabled` config option
   - Add `telegram.chatId` for target chat
   - Add `telegram.threadId` for topic-based chats

### Key Integration Points

```typescript
// In claude_code_start tool handler
const result = await startSession({
  project,
  prompt,
  workingDir,
  onStateChange: async (state) => {
    // Core bubble-service handles:
    // - Rate limiting (1.5s debounce)
    // - Content comparison (skip if unchanged)
    // - Race condition protection (finalized flag)
    await updateSessionBubble({ sessionId, state });
  },
});

// Create initial bubble
await createSessionBubble({
  sessionId: result.sessionId,
  chatId: config.telegram.chatId,
  threadId: config.telegram.threadId,
  resumeToken: result.resumeToken,
  state: initialState,
  workingDir,
});
```

### Files to Modify (Phase 2)

```
extensions/claude-code-planning/
├── src/
│   ├── tools/
│   │   └── claude-code-start.ts  # Add bubble creation
│   ├── telegram-integration.ts   # New: bubble wiring
│   └── config.ts                 # Add telegram config
└── package.json                  # No new deps (uses core)

src/agents/claude-code/
└── bubble-service.ts             # May need to export more
```

### Testing Strategy

1. **Unit tests** for config validation
2. **Integration tests** with mock Telegram API
3. **Manual testing** with real Telegram chat
4. **Race condition testing** - rapid start/stop cycles

### Non-Goals for Phase 2

- Slack/Discord support (future phase)
- Semantic search integration
- Session analytics
- Multi-tenant support

## Future (Phase 3+)

- Slack/Discord progress updates
- Advanced context (semantic search)
- Session analytics
- Multi-tenant bubble routing

## License

MIT
