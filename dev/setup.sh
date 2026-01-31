#!/bin/bash
# Setup isolated dev environment for OpenClaw

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_DIR="$SCRIPT_DIR"
PROJECT_ROOT="$(dirname "$DEV_DIR")"

echo "🦞 Setting up OpenClaw dev environment..."
echo "   Dev directory: $DEV_DIR"
echo ""

# Create directory structure
mkdir -p "$DEV_DIR/config"
mkdir -p "$DEV_DIR/data/credentials"
mkdir -p "$DEV_DIR/data/sessions"
mkdir -p "$DEV_DIR/data/logs"
mkdir -p "$DEV_DIR/data/workspace"

# Create .env file
cat > "$DEV_DIR/.env" << 'EOF'
# OpenClaw Dev Environment
# This file is gitignored

# Use local config and data directories
OPENCLAW_CONFIG_DIR=./dev/config
OPENCLAW_DATA_DIR=./dev/data
OPENCLAW_CREDENTIALS_DIR=./dev/data/credentials

# Dev gateway port (different from default 18789)
OPENCLAW_GATEWAY_PORT=18790

# Optional: Mock Cursor API (uncomment to use mock server)
# CURSOR_API_BASE_URL=http://localhost:3456

# Optional: Your real Cursor API key (or set in config)
# CURSOR_API_KEY=your-api-key-here

# Debug logging
# DEBUG=openclaw:*
EOF

# Create dev config
cat > "$DEV_DIR/config/openclaw.json" << 'EOF'
{
  "$schema": "https://openclaw.ai/schema/config.json",
  "agent": {
    "model": "anthropic/claude-sonnet-4",
    "thinkingLevel": "medium"
  },
  "gateway": {
    "port": 18790,
    "bind": "loopback"
  },
  "session": {
    "store": "./dev/data/sessions"
  },
  "channels": {
    "cursorAgent": {
      "accounts": {
        "default": {
          "enabled": true,
          "apiKey": "${CURSOR_API_KEY:-mock-api-key}",
          "repository": "https://github.com/your-org/your-repo",
          "branch": "main",
          "webhookUrl": "http://localhost:18790/cursor-agent/default/webhook",
          "webhookSecret": "dev-webhook-secret-12345"
        }
      }
    }
  },
  "workspace": "./dev/data/workspace"
}
EOF

# Create workspace AGENTS.md
cat > "$DEV_DIR/data/workspace/AGENTS.md" << 'EOF'
# Dev Workspace

This is a development workspace for testing OpenClaw.

## Available Tools

- Cursor Agent: Send coding tasks to Cursor Background Agents

## Test Commands

Send messages like:
- "Add a README.md file @repo:https://github.com/test/repo"
- "Fix the bug in utils.ts @branch:develop"
EOF

# Add to .gitignore if not already there
GITIGNORE="$PROJECT_ROOT/.gitignore"
if ! grep -q "dev/config" "$GITIGNORE" 2>/dev/null; then
  echo "" >> "$GITIGNORE"
  echo "# Dev environment (local only)" >> "$GITIGNORE"
  echo "dev/config/" >> "$GITIGNORE"
  echo "dev/data/" >> "$GITIGNORE"
  echo "dev/.env" >> "$GITIGNORE"
  echo "Added dev directories to .gitignore"
fi

echo ""
echo "✅ Dev environment created!"
echo ""
echo "Directory structure:"
echo "   $DEV_DIR/config/openclaw.json  - Configuration"
echo "   $DEV_DIR/data/                 - Data directory"
echo "   $DEV_DIR/.env                  - Environment variables"
echo ""
echo "Next steps:"
echo "   1. Edit dev/config/openclaw.json to add your Cursor API key"
echo "   2. Run ./dev/start.sh to start the gateway"
echo "   3. Open http://localhost:18790 for WebChat"
echo ""
echo "Or use the mock Cursor API:"
echo "   1. Run ./dev/mock-cursor.sh in one terminal"
echo "   2. Run ./dev/start.sh in another terminal"
echo ""
