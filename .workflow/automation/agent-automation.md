# Multi-Agent Automation Setup

> **Purpose**: Configure AI agents for automated testing and development workflows.
> Combines existing repo capabilities with Claude Code best practices.

## Overview

This guide covers setting up multiple Claude Code agents for:
- Parallel development tasks
- Automated E2E testing
- CI/CD integration
- Real clawdbot instance testing

---

## What Exists (from repo)

### Skills for Agent Orchestration

| Skill | Path | Purpose |
|-------|------|---------|
| `tmux` | `skills/tmux/` | Session management, parallel execution |
| `coding-agent` | `skills/coding-agent/` | Run Claude Code / Pi agents in background |
| `session-logs` | `skills/session-logs/` | Access agent session logs |

### Sandbox System

Full documentation at `docs/multi-agent-sandbox-tools.md`

```json
{
  "routing": {
    "agents": {
      "agent-id": {
        "sandbox": {
          "mode": "all",
          "scope": "agent",
          "workspaceRoot": "/tmp/work-sandboxes"
        }
      }
    }
  }
}
```

### Multi-Agent Safety Rules (from `CLAUDE.md`)

- Do NOT create/apply/drop `git stash` entries
- Do NOT switch branches unless explicitly requested
- Do NOT modify `git worktree` checkouts unless requested
- Each agent should have its own session
- When committing: scope to your changes only

---

## Implemented: Claude Code Configuration

### Project-Level Settings

Settings are implemented in `.claude/settings.json`. Key features:

**Permissions:**
- Allow: `pnpm`, `bun`, safe git commands, `scripts/committer`
- Deny: Destructive operations (`rm -rf /`, `git push --force`, `git stash`, `git checkout`)

**Hooks:**
- `PreToolUse` hook on Bash commands validates commands before execution

See `.claude/settings.json` for full configuration.

### Pre-Bash Hook

The `.claude/hooks/pre-bash.sh` hook validates bash commands:
- Blocks dangerous patterns (force push, stash, branch switching)
- Enforces multi-agent safety rules from CLAUDE.md

### Adding More Hooks

Available hook events:
- `PreToolUse` - Before tool execution (can block)
- `PostToolUse` - After tool execution
- `SessionStart` - When session begins
- `SessionEnd` - When session ends

Example Stop hook for quality gate:

```bash
#!/bin/bash
# .claude/hooks/quality-gate.sh
set -e

# Run lint check
if ! pnpm lint 2>/dev/null; then
  echo '{"continue": false, "reason": "Lint failed"}' >&2
  exit 2
fi

# Run type check
if ! pnpm build 2>/dev/null; then
  echo '{"continue": false, "reason": "Build failed"}' >&2
  exit 2
fi

# Run tests (quick mode)
if ! pnpm test --run --bail 2>/dev/null; then
  echo '{"continue": false, "reason": "Tests failed"}' >&2
  exit 2
fi

exit 0
```

---

## Implemented: Slash Commands

Slash commands are implemented in `.claude/dev/`. These are ready to use:

| Command | File | Purpose |
|---------|------|---------|
| `/gate` | `.claude/dev/gate.md` | Quality gate (lint, build, test) |
| `/test` | `.claude/dev/test.md` | Run tests with coverage/pattern options |
| `/e2e` | `.claude/dev/e2e.md` | End-to-end tests |
| `/commit` | `.claude/dev/commit.md` | Safe commit using scripts/committer |
| `/tdd` | `.claude/dev/tdd.md` | TDD workflow (red/green/refactor phases) |
| `/coverage` | `.claude/dev/coverage.md` | Coverage analysis |

### Usage Examples

```bash
# Run quality gate before committing
/gate

# Run tests with coverage
/test --coverage

# Run specific test file
/test auth

# TDD workflow - write failing tests first
/tdd red "user authentication"

# TDD workflow - implement to pass tests
/tdd green auth

# Safe commit with specific files
/commit "feat: add auth module" src/auth.ts src/auth.test.ts

# Analyze coverage gaps
/coverage src/gateway
```

### Adding New Commands

To add a new slash command:

```bash
# Create new command file
cat > .claude/dev/my-command.md << 'EOF'
---
description: Brief description shown in /help
argument-hint: [arg1] [arg2]
allowed-tools: Bash, Read
---

# My Command

Instructions for what the command does.

Arguments: $ARGUMENTS (or $1, $2 for positional)
EOF
```

---

## Recommended: Subagent Definitions

### Create `.claude/agents/`

```bash
mkdir -p .claude/agents
```

### Test Runner Agent

`.claude/agents/test-runner.md`:

```markdown
---
name: test-runner
description: Run tests and analyze failures. Use when implementing features or fixing bugs. Provides detailed test output analysis.
tools: Bash, Read, Grep
---

# Test Runner Agent

Run tests and analyze results:

1. Run `pnpm test --run` for quick validation
2. If tests fail, read the test file and identify the issue
3. Report:
   - Which tests failed
   - Expected vs actual values
   - Suggested fixes

Do NOT modify code - only analyze and report.
```

### Code Reviewer Agent

`.claude/agents/code-reviewer.md`:

```markdown
---
name: code-reviewer
description: Review code changes for quality, security, and style. Use PROACTIVELY after writing significant code. MUST BE USED before creating PRs.
tools: Read, Grep, Glob
---

# Code Reviewer Agent

Review code changes focusing on:

1. **Security**: Input validation, injection attacks, secrets exposure
2. **Quality**: Error handling, edge cases, type safety
3. **Style**: Follows CLAUDE.md guidelines, <700 LOC files
4. **Tests**: Coverage for new code, edge cases tested

Report findings by severity (critical, high, medium, low).
```

### E2E Test Agent

`.claude/agents/e2e-tester.md`:

```markdown
---
name: e2e-tester
description: Run E2E tests against real clawdbot instances. Use for integration testing before merging. Requires running gateway.
tools: Bash, Read, WebFetch
---

# E2E Test Agent

Run end-to-end tests:

1. Check if gateway is running: `pnpm clawdbot health`
2. Run E2E suite: `pnpm test:e2e`
3. If gateway not running, spawn test instance
4. Report detailed results

Extended timeout: 120 seconds per test.
```

---

## Parallel Agent Workflows

### Pattern 1: Git Worktree Isolation

```bash
# Create isolated workspaces for parallel agents
git worktree add -b feature/auth /tmp/agent-auth main
git worktree add -b feature/tests /tmp/agent-tests main

# Agent 1 works in /tmp/agent-auth
# Agent 2 works in /tmp/agent-tests
# No conflicts, parallel execution
```

### Pattern 2: tmux Session Orchestration

Using the `tmux` skill from `skills/tmux/`:

```bash
SOCKET="${TMPDIR}/clawdbot-tmux-sockets/clawdbot.sock"

# Create sessions for each agent
tmux -S "$SOCKET" new -d -s agent-1 -n main
tmux -S "$SOCKET" new -d -s agent-2 -n main

# Run agents in sessions
tmux -S "$SOCKET" send-keys -t agent-1:main -- 'claude "implement auth"' Enter
tmux -S "$SOCKET" send-keys -t agent-2:main -- 'claude "write tests"' Enter

# Monitor with wait-for-text.sh
skills/tmux/scripts/wait-for-text.sh "$SOCKET" agent-1:main "❯" 300
```

### Pattern 3: Progress File Communication

```bash
# Agent 1 writes progress
cat > claude-progress.txt << 'EOF'
## Agent 1: Auth Implementation
- Status: Complete
- Files: src/auth.ts, src/auth.test.ts
- Tests: 12 passing
EOF
git add claude-progress.txt && git commit -m "progress: auth complete"

# Agent 2 reads and continues
cat claude-progress.txt
# Builds on Agent 1's work
```

---

## CI/CD Integration

### GitHub Actions Workflow

`.github/workflows/agent-tests.yml`:

```yaml
name: Agent E2E Tests

on:
  pull_request:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30

    steps:
      - uses: actions/checkout@v4

      - uses: oven-sh/setup-bun@v2

      - name: Install dependencies
        run: pnpm install

      - name: Start gateway
        run: |
          pnpm clawdbot gateway --port 8080 &
          sleep 10

      - name: Run E2E tests
        run: pnpm test:e2e
        env:
          CLAWDBOT_GATEWAY_PORT: 8080

      - name: Stop gateway
        if: always()
        run: pkill -f "clawdbot gateway" || true
```

### Self-Hosted Runner with Sandbox

For real device testing on Mac mini:

```yaml
jobs:
  e2e-mac:
    runs-on: [self-hosted, macOS, ARM64]
    timeout-minutes: 60

    steps:
      - uses: actions/checkout@v4

      - name: Setup sandbox
        run: |
          scripts/sandbox-setup.sh
          scripts/sandbox-common-setup.sh

      - name: Run in sandbox
        run: |
          docker run --rm \
            -v $PWD:/workspace \
            -w /workspace \
            clawdbot-sandbox-common:bookworm-slim \
            pnpm test:e2e
```

---

## Session Management

### Hooks for Session Lifecycle

`.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/session-start.sh"
          }
        ]
      }
    ],
    "SessionEnd": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": ".claude/hooks/session-end.sh"
          }
        ]
      }
    ]
  }
}
```

### Session Start Hook

`.claude/hooks/session-start.sh`:

```bash
#!/bin/bash
# Log session start
echo "$(date): Session started in $PWD" >> ~/.claude/session.log

# Ensure clean state
git status --porcelain | head -5

# Check dependencies
if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  pnpm install
fi
```

### Session End Hook

`.claude/hooks/session-end.sh`:

```bash
#!/bin/bash
# Log session end
echo "$(date): Session ended in $PWD" >> ~/.claude/session.log

# Report uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "Warning: Uncommitted changes remain"
  git status --short
fi
```

---

## Best Practices Summary

| Practice | Source | Implementation |
|----------|--------|----------------|
| Use `scripts/committer` | Repo (`CLAUDE.md`) | Never raw `git add/commit` |
| Isolated HOME per test | Repo (`test/setup.ts`) | Temp directories |
| Each agent own session | Repo (`CLAUDE.md`) | Separate tmux sessions |
| Don't stash/switch branches | Repo (`CLAUDE.md`) | Multi-agent safety |
| Quality gate before commit | Recommendation | `pnpm lint && build && test` |
| Subagents for specialization | Claude Code best practice | `.claude/agents/` |
| Slash commands for workflows | Claude Code best practice | `.claude/dev/` |
| Hooks for automation | Claude Code best practice | `.claude/settings.json` |
