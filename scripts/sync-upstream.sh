#!/usr/bin/env bash
set -euo pipefail

# Sync local main with upstream and push to fork + dev

BRANCH="${1:-main}"
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
LOG_FILE="/tmp/sync-upstream.log"

notify() {
    local title="$1"
    local message="$2"
    echo "[$title] $message"
    osascript -e "display notification \"$message\" with title \"$title\"" 2>/dev/null || true
}

fail() {
    if [ "${STASHED:-false}" = true ]; then
        echo "📦 Restoring stashed changes before exit..."
        if git stash pop; then
            notify "Clawdbot Sync Failed" "$1 (stashed changes restored)"
        else
            notify "Clawdbot Sync Failed" "$1 (stash pop failed, run 'git stash pop' manually)"
        fi
    else
        notify "Clawdbot Sync Failed" "$1"
    fi
    exit 1
}

cd "$REPO_DIR" || fail "Could not cd to $REPO_DIR"

echo "$(date '+%Y-%m-%d %H:%M:%S') Starting sync..."

# Check for git lock
if [ -f .git/index.lock ]; then
    fail "Git lock file exists. Another git process may be running."
fi

# Stash any uncommitted changes
STASHED=false
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "📦 Stashing uncommitted changes..."
    git stash push -m "sync-upstream auto-stash $(date '+%Y-%m-%d %H:%M:%S')" || fail "Could not stash changes"
    STASHED=true
fi

# Ensure we're on the right branch
CURRENT_BRANCH=$(git branch --show-current) || fail "Could not determine current branch"
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
    echo "⚠️  On branch '$CURRENT_BRANCH', switching to '$BRANCH'..."
    git checkout "$BRANCH" || fail "Could not checkout $BRANCH"
fi

# Fetch from upstream
echo "📥 Fetching from upstream..."
if ! git fetch upstream; then
    fail "Could not fetch from upstream. Check network connection."
fi

# Verify upstream branch exists
if ! git rev-parse "upstream/$BRANCH" >/dev/null 2>&1; then
    fail "Branch '$BRANCH' does not exist on upstream."
fi

# Check if we're already up to date
LOCAL=$(git rev-parse "$BRANCH") || fail "Could not resolve local $BRANCH"
UPSTREAM=$(git rev-parse "upstream/$BRANCH") || fail "Could not resolve upstream/$BRANCH"
if [ "$LOCAL" = "$UPSTREAM" ]; then
    echo "✅ Already up to date with upstream."
    exit 0
fi

# Merge upstream
echo "🔀 Merging upstream/$BRANCH..."
if ! git merge "upstream/$BRANCH" --no-edit; then
    echo "❌ Merge conflict detected! Aborting to keep repo clean."
    git merge --abort
    fail "Merge conflict with upstream. Manual resolution needed."
fi

# Push to remotes
echo "📤 Pushing to fork..."
if ! git push fork "$BRANCH"; then
    fail "Failed to push to fork. Merge succeeded but push failed!"
fi

echo "📤 Pushing to dev..."
if ! git push dev "$BRANCH"; then
    fail "Failed to push to dev. Fork updated but dev failed!"
fi

# Restore stashed changes
if [ "$STASHED" = true ]; then
    echo "📦 Restoring stashed changes..."
    git stash pop || notify "Clawdbot Sync Warning" "Sync succeeded but stash pop failed. Run 'git stash pop' manually."
fi

notify "Clawdbot Sync" "Successfully synced with upstream"
echo "✅ Sync complete!"
