# Merge Strategy: moltbot-fork → openclaw v2026.1.29

## Current State
- **Branch**: `feat/session-compact-tool`
- **Base commit**: `c9fe062824cabdf919cfbedc1b915375b5e684d1`
- **Target tag**: `v2026.1.29` (`77e703c69b07a236c2f0962bd195e03aae1b8da0`)
- **Our commits** (3 total):
  1. `efd6209bc` - feat(tools): add session_compact tool for agent-invoked context compaction
  2. `30262f9ff` - feat(session_compact): add threshold check and auto-save compaction file
  3. `ec8ddeb5a` - fix(session_compact): use direct compaction when called from active run

## Files Analysis

### ⚠️ HIGH-RISK CONFLICTS (changed both sides)
| File | Our Changes | Risk |
|------|-------------|------|
| `package.json` | Our custom scripts/deps | **HIGH** - version bumps both sides |
| `src/plugins/tools.ts` | Added session_compact registration | **HIGH** - tool registration changes |
| `src/telegram/bot-message-context.ts` | Our custom modifications | **MEDIUM** |
| `src/telegram/bot.test.ts` | Test updates | **LOW** (just tests) |

### ✅ SAFE FILES (only our changes)
These files are new or only modified by us - no upstream changes:
- `src/agents/tools/session-compact-tool.ts` (NEW - 282 lines)
- `src/agents/session-tool-result-guard.ts` (our hook additions)
- `src/agents/pi-embedded-runner.ts` (minor modifications)
- `src/agents/pi-embedded.ts` (1-line addition)
- `src/agents/moltbot-tools.ts` (renamed from openclaw-tools.ts)

### 📁 NEW FILES (will be preserved)
- `LOCAL_STATE.md`
- `config/redacted/.gitkeep`
- `config/redacted/moltbot.redacted.json`
- `scripts/local/export-local-state.mjs`
- `scripts/local/import-clawd.mjs`

---

## Recommended Approach: **MERGE** (not rebase)

### Why Merge over Rebase
1. **Preserves history** - Our 3 commits stay intact
2. **Easier conflict resolution** - Single merge commit to fix conflicts
3. **Safer rollback** - Can easily revert the merge commit if something breaks
4. **Works with pushed branches** - Our `feat/session-compact-tool` is already on `fork` remote

---

## Step-by-Step Procedure

### Phase 1: Backup
```bash
cd ~/moltbot-fork

# Create backup branch
git branch backup/pre-merge-v2026.1.29 feat/session-compact-tool

# Also tag current state
git tag pre-merge-snapshot
```

### Phase 2: Fetch & Prepare
```bash
# Ensure we have latest tags
git fetch origin --tags

# Verify target exists
git rev-parse v2026.1.29
```

### Phase 3: Merge
```bash
# Make sure we're on our feature branch
git checkout feat/session-compact-tool

# Merge the tag (creates merge commit)
git merge v2026.1.29 --no-edit
```

### Phase 4: Resolve Conflicts
When conflicts occur, resolve in this order:

#### 1. `package.json`
- Keep upstream version number (`v2026.1.29` or its version)
- Preserve any of our custom `scripts.local.*` entries
- Accept upstream dependency versions
```bash
# After resolving:
pnpm install  # regenerate lockfile
```

#### 2. `src/plugins/tools.ts`
- Keep ALL upstream changes to the file
- Re-add our session_compact tool import and registration
- Look for the `tools` array and add:
```typescript
import { sessionCompactTool } from '../agents/tools/session-compact-tool.js';
// ... in the tools array:
sessionCompactTool,
```

#### 3. `src/telegram/bot-message-context.ts`
- Carefully merge - likely both changes can coexist
- Test Telegram functionality after

#### 4. `src/telegram/bot.test.ts`
- Accept upstream test changes
- Verify our functionality still works

### Phase 5: Verify
```bash
# Build
pnpm build

# Run tests
pnpm test

# Quick smoke test
pnpm dev
```

### Phase 6: Complete
```bash
# Add resolved files
git add .

# Complete merge
git commit

# Push to fork
git push fork feat/session-compact-tool
```

---

## Rollback Strategy

### If merge goes wrong BEFORE commit:
```bash
git merge --abort
```

### If merge was committed but broken:
```bash
git reset --hard backup/pre-merge-v2026.1.29
```

### If merge was pushed and needs revert:
```bash
git revert -m 1 HEAD  # revert the merge commit
git push fork feat/session-compact-tool
```

---

## Post-Merge Checklist

- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes (or known failures documented)
- [ ] Session compact tool works (`/compact` command)
- [ ] Telegram bot starts without errors
- [ ] Gateway starts without errors
- [ ] Our custom scripts still work:
  - [ ] `pnpm run local:export`
  - [ ] `pnpm run local:import`

---

## Alternative: Cherry-Pick (if merge is too messy)

If the merge produces too many conflicts (>10 files), consider:

```bash
# Start fresh from v2026.1.29
git checkout -b feat/session-compact-tool-rebased v2026.1.29

# Cherry-pick our commits one by one
git cherry-pick efd6209bc  # initial session_compact
git cherry-pick 30262f9ff  # threshold + auto-save
git cherry-pick ec8ddeb5a  # direct compaction fix

# This will also have conflicts but scoped to our changes only
```

---

## Notes

- The large diff count (~1000+ files) is mostly due to brand renaming (openclaw→moltbot) in upstream
- Our core feature (session_compact tool) is isolated in 4-5 files
- The merge should complete in under 30 minutes for an experienced dev

Generated: 2025-01-29
