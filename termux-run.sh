#!/bin/bash
# Termux wrapper script for Moltbot
# This script sets up the environment and runs moltbot

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Set up writable temp directory for Termux
TERMUX_TMP_DIR="${TMPDIR:-$HOME/.tmp}"
export TMPDIR="$TERMUX_TMP_DIR"
mkdir -p "$TERMUX_TMP_DIR/moltbot" 2>/dev/null || true

# Set log directory to writable location
export CLAWDBOT_LOG_DIR="$TERMUX_TMP_DIR/moltbot"

# Export environment to use native Node (not tsgo)
export CLAWDBOT_TS_COMPILER="tsc"
export CLAWDBOT_RUNNER_LOG="1"

# Run using the built JavaScript
node moltbot.mjs "$@"
