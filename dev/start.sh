#!/bin/bash
# Start OpenClaw gateway with dev configuration

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_DIR="$SCRIPT_DIR"
PROJECT_ROOT="$(dirname "$DEV_DIR")"

# Check if setup has been run
if [ ! -f "$DEV_DIR/config/openclaw.json" ]; then
  echo "❌ Dev environment not set up. Run ./dev/setup.sh first."
  exit 1
fi

# Load environment variables
if [ -f "$DEV_DIR/.env" ]; then
  set -a
  source "$DEV_DIR/.env"
  set +a
fi

# Export paths for OpenClaw
export OPENCLAW_CONFIG="$DEV_DIR/config/openclaw.json"
export OPENCLAW_HOME="$DEV_DIR/data"
export OPENCLAW_CREDENTIALS_DIR="$DEV_DIR/data/credentials"

# Default port
PORT="${OPENCLAW_GATEWAY_PORT:-18790}"

echo "🦞 Starting OpenClaw Dev Gateway"
echo "   Config: $OPENCLAW_CONFIG"
echo "   Data:   $OPENCLAW_HOME"
echo "   Port:   $PORT"
echo ""

cd "$PROJECT_ROOT"

# Check if we should use mock Cursor API
if [ -n "$CURSOR_API_BASE_URL" ]; then
  echo "   Using Cursor API: $CURSOR_API_BASE_URL"
  echo ""
fi

# Run gateway
if command -v pnpm &> /dev/null; then
  exec pnpm gateway:watch -- --port "$PORT" --verbose "$@"
elif command -v npm &> /dev/null; then
  exec npm run gateway:watch -- --port "$PORT" --verbose "$@"
else
  # Direct execution with tsx
  exec npx tsx src/entry.ts gateway --port "$PORT" --verbose "$@"
fi
