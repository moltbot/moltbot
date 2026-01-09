# Quick Start

## First Steps
1. Read root `CLAUDE.md` - coding standards (source of truth)
2. Check `package.json` - available scripts
3. Run `/help` - see available slash commands

## Key Commands
- `/gate` - quality gate before commits
- `/test` - run tests
- `/commit "msg" files...` - safe commit

## Constraints (Multi-Agent Safety)
- No branch switching (`git checkout/switch`)
- No stashing (`git stash`)
- No force push

## Explore to Learn
- Test patterns: `src/**/*.test.ts`
- CLI structure: `src/cli/`, `src/commands/`
- Slash commands: `.claude/dev/`
