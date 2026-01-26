#!/bin/bash

echo "=== Clawdbot Environment Diagnostic ==="
echo "Date: $(date)"
echo "Host: $(hostname)"
echo "-------------------------------------"

# 1. Architecture Check
ARCH=$(uname -m)
echo "Architecture: $ARCH"

IS_ARM64=false
if [[ "$ARCH" == "arm64" ]]; then
    IS_ARM64=true
fi

# 2. Rosetta Check
IS_ROSETTA=false
if [[ "$(sysctl -in sysctl.proc_translated)" == "1" ]]; then
    IS_ROSETTA=true
    echo "⚠️  WARNING: Running under Rosetta translation!"
    echo "   Your terminal is emulating x86_64 on Apple Silicon."
    echo "   This may cause installation issues."
    echo "   Resolution: Use a native terminal or ensure 'Open using Rosetta' is unchecked."
else
    echo "Rosetta Status: Not Active (Native)"
fi

# 3. Homebrew Check
BREW_PATH=$(which brew)
echo "Homebrew Path: $BREW_PATH"

if [[ "$IS_ARM64" == "true" || "$IS_ROSETTA" == "true" ]]; then
    if [[ "$BREW_PATH" == "/usr/local/bin/brew" && "$IS_ROSETTA" == "true" ]]; then
        echo "⚠️  WARNING: Homebrew found in Intel path (/usr/local) while on Apple Silicon (via Rosetta)."
        echo "   Recommmended: use /opt/homebrew (Native)."
    elif [[ "$BREW_PATH" == "/opt/homebrew/bin/brew" ]]; then
        echo "✅ Homebrew is in the correct Native Apple Silicon path."
    fi
fi

# 4. Node Check
NODE_PATH=$(which node)
NODE_VER=$(node -v)
NODE_ARCH=$(node -p "process.arch")
echo "Node Path: $NODE_PATH"
echo "Node Version: $NODE_VER"
echo "Node Arch: $NODE_ARCH"

if [[ "$IS_ROSETTA" == "true" && "$NODE_ARCH" == "x64" ]]; then
     echo "⚠️  WARNING: Node.js is running as x64 (Intel) under Rosetta."
     echo "   Native modules may fail to build."
fi

echo "-------------------------------------"
echo "Diagnostic Complete."
