---
description: Show all available commands and help resources
---

# Clawdbot Commands

Available command namespaces and help resources.

## Quick Reference

| Namespace | Command | Description |
|-----------|---------|-------------|
| Dev Workflow | `/dev:help` | Development commands (testing, commits, reviews) |
| Wizards | `/wiz:help` | Domain-expert priming agents |
| Build | `/build:help` | Release builds and hotfix management |

## Getting Started

**New to this codebase?**
1. Read `.workflow/AGENTS.md` - Complete workflow guide and coding standards
2. Run `/dev:help` - See all development commands
3. Run `/dev:gate` - Verify your setup works

## Most Used Commands

### Development
- `/dev:gate` - Run full quality gate (lint, build, test) before commits
- `/dev:review <pr|current>` - Multi-agent code review (4 specialists)
- `/dev:test [pattern]` - Run tests with optional filter
- `/dev:commit "msg" files...` - Safe scoped commits

### Upstream Contributions
- `/dev:fix-issue <number>` - Fix upstream issue with TDD workflow
- `/dev:pr-review <number>` - Review a PR from upstream
- `/dev:pr-test <number>` - Test a PR locally

### Build & Release
- `/build:mac-release [version]` - Build macOS app with hotfixes applied
- `./scripts/release-fixes-status.sh` - Check hotfix status

### Domain Experts
- `/wiz:core [path]` - Prime for architecture questions
- `/wiz:workflow [path]` - Prime for dev workflow questions

## Detailed Help

For comprehensive documentation on each namespace, use:
- `/dev:help` - All development workflow commands and usage
- `/wiz:help` - Wizard commands and how they work
- `/build:help` - Build commands, hotfix workflow, and scripts

## Documentation

- `.workflow/AGENTS.md` - Complete workflow guide, standards, troubleshooting
- `automation/infrastructure.md` - Logs, environment, automation details
- `README.md` - Project overview and setup

## Quick Commands

```bash
pnpm install        # Install dependencies
pnpm build          # TypeScript compilation
pnpm test           # Run tests
pnpm clawdbot ...   # Run CLI in dev mode
```

**Before every commit:** Always run `/dev:gate` first.
