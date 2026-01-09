---
description: Review workflow docs for quality issues
allowed-tools: Task, Read, Glob, Grep, Bash(git diff:*), Bash(git log:*)
argument-hint: [--full] [path]
success-criteria: |
  - Pre-screening passed (or --full flag used)
  - Both sub-agent reviews completed
  - Issues validated before reporting
  - Only HIGH-SIGNAL issues reported
  - "DOCS READY" if no validated issues
---

# Documentation Review

Review `.workflow/` and `.claude/` docs with validation and filtering.

**Arguments:**
- `--full` - Skip pre-screening, review all files
- `[path]` - Specific path to review (default: all workflow docs)

---

## Step 1: Pre-Screening (Skip with --full)

If `--full` is NOT specified, spawn a fast screening agent first:

```
subagent_type: Explore
model: haiku

Quick check if docs review is needed:

1. Run: git diff --name-only HEAD~5 -- .workflow/ .claude/
2. Run: git log --oneline -5 -- .workflow/ .claude/

If NO changes to .workflow/ or .claude/ in recent commits:
  → Return: "SKIP: No doc changes detected. Use --full to force review."

If changes found:
  → Return: "PROCEED: Found changes in: <list files>"
```

If screening returns "SKIP", stop here and report that result.
If `--full` flag provided, skip directly to Step 2.

---

## Step 2: Parallel Review

Spawn TWO agents in parallel (single message with multiple Task calls):

### Agent 1: Claude Code Guide (model: sonnet)

```
subagent_type: claude-code-guide
model: sonnet

Review workflow documentation for Claude Code best practices.

SCOPE: Only report Claude Code-specific issues.
- IN SCOPE: hooks, slash commands, settings.json, tools, subagent_types
- OUT OF SCOPE: Clawdbot CLI, test patterns, codebase structure

Discover files:
- Glob for .claude/**/*.md, .claude/**/*.json, .claude/**/*.sh
- Glob for .workflow/**/*.md

Check for:
- Valid tool names in allowed-tools (Bash, Read, Write, Edit, Glob, Grep, Task, WebFetch, WebSearch, TodoWrite, NotebookEdit, etc.)
- Hook event accuracy (PreToolUse, PostToolUse, SessionStart, SessionEnd, Stop, Notification)
- Slash command frontmatter (description, allowed-tools, argument-hint, success-criteria)
- Correct subagent_type usage

KNOWN BUILT-INS (do NOT flag as missing):
- subagent_types: claude-code-guide, clawdbot-guide, Explore, Plan, general-purpose
- These do NOT need .claude/agents/ definitions

HIGH-SIGNAL ONLY - Report issues that are:
- Definitely wrong (broken references, invalid syntax)
- Would cause failures (missing required fields, wrong tool names)

DO NOT REPORT:
- Style preferences or formatting opinions
- Theoretical issues without concrete evidence
- Things that "could be improved" but work fine
- Duplicate issues (one report per unique problem)

Output format (YAML):
```yaml
issues:
  - severity: HIGH|MEDIUM|LOW
    confidence: HIGH|MEDIUM
    file: path/to/file.md
    line: 42
    category: invalid_tool|wrong_path|bad_syntax|missing_field
    description: "Concise description"
    evidence: "The exact text that's wrong"
    fix: "Suggested correction"
```

If no issues: Return `issues: []`
```

### Agent 2: Clawdbot Guide (model: sonnet)

```
subagent_type: clawdbot-guide
model: sonnet

Review workflow documentation for Clawdbot accuracy.

SCOPE: Only report Clawdbot-specific issues.
- IN SCOPE: CLI commands, test patterns, file paths, src/ structure, package.json scripts
- OUT OF SCOPE: Claude Code features, hooks, slash command syntax, tool names

Discover files:
- Glob for .workflow/**/*.md

Check for:
- File paths that actually exist (src/, docs/, scripts/)
- CLI commands match package.json scripts
- Test patterns match actual test files
- CHANGELOG format matches repo conventions

HIGH-SIGNAL ONLY - Report issues that are:
- Definitely wrong (paths that don't exist, commands that fail)
- Would mislead users (incorrect instructions)

DO NOT REPORT:
- Style preferences or formatting opinions
- Theoretical issues without concrete evidence
- Things that "could be improved" but work fine
- Duplicate issues (one report per unique problem)

Output format (YAML):
```yaml
issues:
  - severity: HIGH|MEDIUM|LOW
    confidence: HIGH|MEDIUM
    file: path/to/file.md
    line: 42
    category: wrong_path|invalid_command|outdated_info
    description: "Concise description"
    evidence: "The exact text that's wrong"
    fix: "Suggested correction"
```

If no issues: Return `issues: []`
```

---

## Step 3: Validate Issues

For each HIGH or MEDIUM severity issue with MEDIUM confidence, spawn a validation agent:

```
subagent_type: Explore
model: haiku

Validate this reported issue:

File: <file>
Line: <line>
Claim: <description>
Evidence: <evidence>

1. Read the file at the specified line
2. Verify the claim is accurate
3. Check if the suggested fix is correct

Return ONE of:
- VALIDATED: Issue is real and fix is correct
- INVALID: Issue is false positive because <reason>
- MODIFIED: Issue is real but fix should be <corrected fix>
```

Filter out any issues marked INVALID.

---

## Step 4: Final Report

Combine validated findings:

```markdown
## Documentation Review Summary

**Mode:** [full review | incremental (last 5 commits)]
**Files scanned:** N

### Critical Issues (must fix)
| File | Line | Issue | Confidence | Fix |
|------|------|-------|------------|-----|
(HIGH severity, validated issues only)

### Warnings (should fix)
| File | Line | Issue | Confidence | Fix |
|------|------|-------|------------|-----|
(MEDIUM severity, validated issues only)

### Notes (optional)
(LOW severity issues, if any)

---
**Result:** DOCS NEED FIXES | DOCS READY FOR USE
```

If no validated issues found, output:
```
## Documentation Review Summary

**Mode:** [full review | incremental]
**Files scanned:** N

No issues found.

---
**DOCS READY FOR USE**
```
