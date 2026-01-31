#!/bin/bash
# Start mock Cursor API server for testing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

PORT="${MOCK_CURSOR_PORT:-3456}"

echo "🤖 Starting Mock Cursor API Server"
echo "   Port: $PORT"
echo "   Webhook secret: mock-webhook-secret"
echo ""
echo "Configure your dev environment to use this:"
echo "   export CURSOR_API_BASE_URL=http://localhost:$PORT"
echo ""

cd "$PROJECT_ROOT"

exec npx tsx extensions/cursor-agent/scripts/mock-cursor-api.ts
