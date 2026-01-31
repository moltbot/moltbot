#!/bin/bash
# Termux wrapper script for OpenClaw
# This script sets up the environment and runs openclaw

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Check if CLI entrypoint exists
if [ ! -f "./openclaw.mjs" ]; then
    echo "Error: openclaw.mjs not found in current directory: $(pwd)"
    echo "Please run this script from the OpenClaw repository root."
    echo "If the project hasn't been built yet, run: pnpm build"
    exit 1
fi

# Set up writable temp directory for Termux
TERMUX_TMP_DIR="${TMPDIR:-$HOME/.tmp}"
export TMPDIR="$TERMUX_TMP_DIR"
mkdir -p "$TERMUX_TMP_DIR/openclaw" 2>/dev/null || true

# Set log directory to writable location
export CLAWDBOT_LOG_DIR="$TERMUX_TMP_DIR/openclaw"

# Export environment to use native Node (not tsgo)
export CLAWDBOT_TS_COMPILER="tsc"
export CLAWDBOT_RUNNER_LOG="1"

# Run using the built JavaScript
node ./openclaw.mjs "$@"
