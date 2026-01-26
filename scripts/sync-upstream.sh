#!/usr/bin/env bash
#
# Sync with upstream clawdbot while preserving local extensions
#
# Strategy:
#   1. Stash local extensions
#   2. Pull/rebase upstream
#   3. Restore local extensions
#   4. Handle conflicts if any
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "$SCRIPT_DIR")"
cd "$REPO_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log() { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; exit 1; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

#───────────────────────────────────────────────────────────────────────────────
# Configuration
#───────────────────────────────────────────────────────────────────────────────

UPSTREAM_REMOTE="upstream"
UPSTREAM_URL="https://github.com/clawdbot/clawdbot.git"
MAIN_BRANCH="main"

# Local-only paths (won't conflict with upstream)
LOCAL_EXTENSIONS=(
    "extensions/zoho-cliq"
    # Add more local extensions here
)

# Backup directory
BACKUP_DIR="$REPO_DIR/.local-backup"

#───────────────────────────────────────────────────────────────────────────────
# Setup upstream remote
#───────────────────────────────────────────────────────────────────────────────
setup_upstream() {
    if ! git remote get-url "$UPSTREAM_REMOTE" &>/dev/null; then
        log "Adding upstream remote: $UPSTREAM_URL"
        git remote add "$UPSTREAM_REMOTE" "$UPSTREAM_URL"
    else
        info "Upstream remote already configured"
    fi
}

#───────────────────────────────────────────────────────────────────────────────
# Backup local extensions
#───────────────────────────────────────────────────────────────────────────────
backup_local() {
    log "Backing up local extensions..."
    rm -rf "$BACKUP_DIR"
    mkdir -p "$BACKUP_DIR"

    for ext in "${LOCAL_EXTENSIONS[@]}"; do
        if [[ -d "$REPO_DIR/$ext" ]]; then
            local dest="$BACKUP_DIR/$ext"
            mkdir -p "$(dirname "$dest")"
            cp -r "$REPO_DIR/$ext" "$dest"
            info "  Backed up: $ext"
        fi
    done

    # Also backup any uncommitted changes
    if ! git diff --quiet || ! git diff --cached --quiet; then
        git stash push -m "sync-upstream-$(date +%Y%m%d-%H%M%S)"
        info "  Stashed uncommitted changes"
    fi
}

#───────────────────────────────────────────────────────────────────────────────
# Restore local extensions
#───────────────────────────────────────────────────────────────────────────────
restore_local() {
    log "Restoring local extensions..."

    for ext in "${LOCAL_EXTENSIONS[@]}"; do
        local src="$BACKUP_DIR/$ext"
        local dest="$REPO_DIR/$ext"
        if [[ -d "$src" ]]; then
            # Remove upstream version if exists (unlikely for local-only)
            rm -rf "$dest"
            cp -r "$src" "$dest"
            info "  Restored: $ext"
        fi
    done

    # Restore stashed changes if any
    if git stash list | grep -q "sync-upstream-"; then
        log "Restoring stashed changes..."
        git stash pop || warn "Stash pop had conflicts - resolve manually"
    fi
}

#───────────────────────────────────────────────────────────────────────────────
# Sync with upstream
#───────────────────────────────────────────────────────────────────────────────
sync_upstream() {
    log "Fetching upstream..."
    git fetch "$UPSTREAM_REMOTE"

    local LOCAL_HEAD=$(git rev-parse HEAD)
    local UPSTREAM_HEAD=$(git rev-parse "$UPSTREAM_REMOTE/$MAIN_BRANCH")

    if [[ "$LOCAL_HEAD" == "$UPSTREAM_HEAD" ]]; then
        info "Already up to date with upstream"
        return 0
    fi

    # Count commits behind/ahead
    local BEHIND=$(git rev-list --count HEAD.."$UPSTREAM_REMOTE/$MAIN_BRANCH")
    local AHEAD=$(git rev-list --count "$UPSTREAM_REMOTE/$MAIN_BRANCH"..HEAD)

    info "Local is $BEHIND commits behind, $AHEAD commits ahead of upstream"

    # Merge strategy: merge upstream into local (preserves local commits)
    log "Merging upstream/$MAIN_BRANCH..."

    if git merge "$UPSTREAM_REMOTE/$MAIN_BRANCH" -m "Merge upstream $MAIN_BRANCH"; then
        log "Merge successful!"
    else
        error "Merge conflicts detected. Resolve manually then run: git merge --continue"
    fi
}

#───────────────────────────────────────────────────────────────────────────────
# Check for local modifications to upstream files
#───────────────────────────────────────────────────────────────────────────────
check_conflicts() {
    log "Checking for potential conflicts..."

    # Files modified locally that also exist upstream
    local MODIFIED=$(git diff --name-only "$UPSTREAM_REMOTE/$MAIN_BRANCH"...HEAD 2>/dev/null || true)

    if [[ -n "$MODIFIED" ]]; then
        info "Files modified locally (may conflict on next sync):"
        echo "$MODIFIED" | head -20
        local COUNT=$(echo "$MODIFIED" | wc -l | tr -d ' ')
        if [[ $COUNT -gt 20 ]]; then
            info "  ... and $((COUNT - 20)) more"
        fi
    fi
}

#───────────────────────────────────────────────────────────────────────────────
# Main
#───────────────────────────────────────────────────────────────────────────────
main() {
    echo "═══════════════════════════════════════════════════════════════"
    echo "  Clawdbot Upstream Sync"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""

    # Ensure we're on the right branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ "$CURRENT_BRANCH" != "$MAIN_BRANCH" ]]; then
        warn "Not on $MAIN_BRANCH branch (on: $CURRENT_BRANCH)"
        read -p "Switch to $MAIN_BRANCH? [y/N] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            git checkout "$MAIN_BRANCH"
        else
            error "Aborted"
        fi
    fi

    # Ensure working directory is clean (except for local extensions)
    if ! git diff --quiet -- . ":(exclude)extensions/"; then
        warn "You have uncommitted changes outside extensions/"
        read -p "Continue anyway? [y/N] " -n 1 -r
        echo
        [[ $REPLY =~ ^[Yy]$ ]] || error "Aborted"
    fi

    setup_upstream
    backup_local
    sync_upstream
    restore_local
    check_conflicts

    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo -e "${GREEN}Sync complete!${NC}"
    echo "═══════════════════════════════════════════════════════════════"
    echo ""
    echo "Local extensions preserved:"
    for ext in "${LOCAL_EXTENSIONS[@]}"; do
        [[ -d "$REPO_DIR/$ext" ]] && echo "  - $ext"
    done
    echo ""
    echo "Next: Review changes with 'git log --oneline -10'"
}

# Run
main "$@"
