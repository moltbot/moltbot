#!/usr/bin/env bash
set -euo pipefail

# Sync local skills to VPS managed skills directory.
# Update SSH_TARGET or paths if your VPS changes.
SSH_TARGET="root@100.94.23.85"
LOCAL_SKILLS_DIR="/Users/user/Downloads/Documents - USER’s MacBook Air/Code/clawdia/skills"
REMOTE_SKILLS_DIR="/root/.clawdbot/skills"
LOG_FILE="$HOME/Library/Logs/clawdbot-sync-skills.log"

mkdir -p "$(dirname "$LOG_FILE")"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Sync start" >> "$LOG_FILE"

/usr/bin/rsync -az --delete \
  "${LOCAL_SKILLS_DIR}/" \
  "${SSH_TARGET}:${REMOTE_SKILLS_DIR}/" >> "$LOG_FILE" 2>&1

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Sync complete" >> "$LOG_FILE"
