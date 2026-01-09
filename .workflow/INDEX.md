# Workflow Documentation Index

> **Purpose**: Meta-documentation for AI agents working in `clawdbot-dev`.
> **Main entry point**: `AGENTS.md` (this directory)

## Repo Structure

```
clawdbot-dev (private)  →  clawdbot (public fork)  →  upstream
    dev + testing              PR staging              clawdbot/clawdbot
```

Development happens here. Only PR-ready code goes to the public fork.

## Directory Structure

```
.workflow/
├── AGENTS.md               # Main entry point - workflow guide
├── INDEX.md                # This file
├── TROUBLESHOOTING.md      # Common issues and fixes
├── prompts/                # One-shot prompt templates
│   ├── fix-issue.md        # Template for fixing issues
│   ├── pr-review.md        # Template for reviewing PRs
│   └── new-feature.md      # Template for new features
├── contributing/
│   ├── tdd-workflow.md     # Test-Driven Development practices
│   └── e2e-testing.md      # End-to-end test patterns
└── automation/
    ├── agent-automation.md # Multi-agent coordination
    └── infrastructure.md   # Mac mini + k3s + Tailscale setup

.claude/
├── CLAUDE.md               # Claude Code reads this, points to AGENTS.md
├── settings.json           # Permissions and hooks configuration
├── dev/                    # Slash commands (dev:*)
└── hooks/
    └── pre-bash.sh         # Pre-bash validation hook
```

## Document Guide

| Document | When to Read |
|----------|--------------|
| `AGENTS.md` | **Start here** - complete workflow guide |
| `contributing/tdd-workflow.md` | Writing or reviewing tests |
| `contributing/e2e-testing.md` | Writing E2E tests |
| `automation/agent-automation.md` | Multi-agent setup |
| `automation/infrastructure.md` | Infrastructure config |
| `TROUBLESHOOTING.md` | Something broken |

## Exploration Principle

These docs provide **patterns and workflows**, not inventories. This repo syncs with upstream.

**Explore locally first:**
- `CLAUDE.md` (root) - Project coding standards (from upstream)
- `package.json` - Available commands
- `src/**/*.test.ts` - Test patterns
- `docs/` - Official documentation

## Design Principles

1. **Private dev repo**: `.workflow/` and `.claude/` stay here, not in public fork
2. **AGENTS.md is the entry point**: Contains all context future Claude instances need
3. **Agent-focused**: Guides AI agents on contributing quality code to upstream

## What Goes Where

| Content Type | Location | Notes |
|--------------|----------|-------|
| Upstream code + docs | `src/`, `docs/` | Synced from upstream |
| Claude Code config | `.claude/` | Dev repo only |
| Workflow docs | `.workflow/` | Dev repo only |
| Helper scripts | `scripts/setup-*.sh` | Dev repo only |
| PR-ready code | Push to public fork | For upstream submission |
