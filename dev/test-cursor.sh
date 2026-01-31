#!/bin/bash
# Test Cursor Agent integration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_DIR="$SCRIPT_DIR"
PROJECT_ROOT="$(dirname "$DEV_DIR")"

# Load environment variables
if [ -f "$DEV_DIR/.env" ]; then
  set -a
  source "$DEV_DIR/.env"
  set +a
fi

# Use API key from env or config
if [ -z "$CURSOR_API_KEY" ]; then
  # Try to extract from config
  if command -v jq &> /dev/null; then
    CURSOR_API_KEY=$(jq -r '.channels.cursorAgent.accounts.default.apiKey // "mock-api-key"' "$DEV_DIR/config/openclaw.json" 2>/dev/null || echo "mock-api-key")
  else
    CURSOR_API_KEY="mock-api-key"
  fi
fi

export CURSOR_API_KEY

cd "$PROJECT_ROOT"

# Run the test script
exec npx tsx extensions/cursor-agent/scripts/test-api.ts "$@"
