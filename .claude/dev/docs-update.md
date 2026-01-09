---
description: Review and fix workflow documentation issues
allowed-tools: Task, Read, Write, Edit, Glob, Grep, Bash(scripts/committer:*), Bash(git status:*), Bash(git push:*)
argument-hint: [path]
success-criteria: |
  - Docs reviewed by both sub-agents
  - All HIGH/MEDIUM issues fixed
  - Changes committed and pushed
---

# Documentation Update

Review `.workflow/` and `.claude/` docs, fix issues, and commit.

**Path:** $1 (or all workflow docs if not specified)

## Process

### Step 1: Review

Spawn TWO agents in parallel to review docs:

**Agent 1: claude-code-guide**
```
Review workflow documentation for Claude Code best practices.

SCOPE: Only report Claude Code-specific issues (hooks, slash commands, settings, tools, subagents).
Do NOT comment on Clawdbot CLI commands, test patterns, or codebase structure.

Discover files: Glob for .claude/**/* and .workflow/**/*

Check for:
- Correct Claude Code feature usage (hooks, slash commands, settings)
- Valid tool names in allowed-tools (Bash, Read, Write, Edit, Glob, Grep, Task, etc.)
- Hook configuration accuracy (PreToolUse, PostToolUse, SessionStart, SessionEnd, Stop)
- Slash command syntax (frontmatter: description, allowed-tools, argument-hint)

NOTE: Built-in subagent_types (claude-code-guide, clawdbot-guide, Explore, Plan, general-purpose)
do NOT need definitions in .claude/agents/.

Report issues as: ### [severity] file:line - Description
```

**Agent 2: clawdbot-guide**
```
Review workflow documentation for Clawdbot accuracy.

SCOPE: Only report Clawdbot-specific issues (CLI commands, test patterns, file paths, codebase structure).
Do NOT comment on Claude Code features, hooks, slash command syntax, or tool configurations.

Discover files: Glob for .workflow/**/*

Check for:
- Correct test patterns and helpers
- Valid file paths (src/ structure)
- Accurate CLI commands
- CHANGELOG format matches repo

Report issues as: ### [severity] file:line - Description
```

### Step 2: Fix Issues

**Important:** Only fix issues within each agent's scope. Ignore out-of-scope feedback.

For each HIGH and MEDIUM issue found:
1. Read the file
2. Apply the suggested fix
3. Verify the fix is correct

Skip LOW severity issues unless trivial to fix.

### Step 3: Commit and Push

If fixes were made:
```bash
scripts/committer "docs: fix issues from docs-review" <changed-files>
git push
```

## Report

Summarize:
1. Issues found (by severity)
2. Issues fixed
3. Issues skipped (with reason)
4. Commit SHA (if changes made)
