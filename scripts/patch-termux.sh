#!/bin/bash
# Termux patch script for Moltbot
# Run this after `pnpm install` to create stubs for missing native modules

set -euo pipefail

echo "[moltbot-termux] Applying Termux patches..."

# Create clipboard stub
CLIPBOARD_STUB="node_modules/@mariozechner/clipboard-android-arm64"
if [ ! -d "$CLIPBOARD_STUB" ]; then
  echo "[moltbot-termux] Creating clipboard stub..."
  mkdir -p "$CLIPBOARD_STUB"

  cat > "$CLIPBOARD_STUB/package.json" << 'EOF'
{
  "name": "@mariozechner/clipboard-android-arm64",
  "version": "0.3.0",
  "os": ["android"],
  "cpu": ["arm64"],
  "main": "index.js",
  "types": "index.d.ts"
}
EOF

  cat > "$CLIPBOARD_STUB/index.js" << 'EOF'
// Stub implementation for Termux/Android
module.exports = {
  copyText: async (text) => {
    console.warn('[clipboard] Clipboard not available on Termux/Android');
    return false;
  },
  pasteText: async () => {
    console.warn('[clipboard] Clipboard not available on Termux/Android');
    return '';
  },
  readText: async () => {
    console.warn('[clipboard] Clipboard not available on Termux/Android');
    return '';
  },
  writeText: async (text) => {
    console.warn('[clipboard] Clipboard not available on Termux/Android');
    return false;
  }
};
EOF

  cat > "$CLIPBOARD_STUB/index.d.ts" << 'EOF'
export function copyText(text: string): Promise<boolean>;
export function pasteText(): Promise<string>;
export function readText(): Promise<string>;
export function writeText(text: string): Promise<boolean>;
EOF

  echo "[moltbot-termux] Clipboard stub created at $CLIPBOARD_STUB"
else
  echo "[moltbot-termux] Clipboard stub already exists"
fi

echo "[moltbot-termux] Patches applied!"
echo ""
echo "You can now run Moltbot with:"
echo "  ./termux-run.sh [command]"
echo "  node moltbot.mjs [command]"
