# OpenClaw on Termux

This is a patched version of OpenClaw that works on Termux (Android).

## What was patched

### 1. Native Module Stubs

Created stub implementations for native modules that don't support Android/arm64:

- **`@mariozechner/clipboard-android-arm64`**: Stub package in `node_modules/@mariozechner/clipboard-android-arm64/`
  - Clipboard operations return safely without functionality
  - Logs warnings when clipboard is accessed

### 2. TypeScript Compiler

The original `pnpm moltbot` command uses `@typescript/native-preview` (tsgo) which doesn't support Android.

**Solution**: Use the pre-built JavaScript in `dist/`:
```bash
node openclaw.mjs [command]
# Or use the wrapper:
./termux-run.sh [command]
```

### 3. Limitations

Some features will not work on Termux due to missing native modules:

- ❌ **Clipboard operations** (from `@mariozechner/clipboard`)
- ❌ **Native canvas** (from `@napi-rs/canvas`)
- ❌ **Matrix channel** (from `@matrix-org/matrix-sdk-crypto-nodejs`)
- ⚠️ **Some native extensions**

Core functionality works fine:
- ✅ CLI commands
- ✅ Gateway (most channels)
- ✅ Agent runtime
- ✅ WebChat
- ✅ WhatsApp, Telegram, Discord, Slack, etc.

## Usage

### Run CLI commands

```bash
# Version
./termux-run.sh --version

# Setup wizard
./termux-run.sh setup

# Gateway
./termux-run.sh gateway run --port 18789

# Agent
./termux-run.sh agent --message "Hello"

# Send messages
./termux-run.sh message send --to +1234567890 --message "Test"
```

### Direct node (alternative)

```bash
node openclaw.mjs [command]
```

## Re-applying patches after reinstall

If you reinstall dependencies (`pnpm install`), re-run the patch script:

```bash
bash scripts/patch-termux.sh
```

This will recreate the clipboard stub.

## Development

### Building

```bash
pnpm build
```

### Running from source

Use the Termux wrapper - it will use the built `dist/` files automatically.

### Testing

Most tests should work, but skip tests that require native modules:

```bash
# Run tests (skip live/docker tests)
pnpm test
```

## Troubleshooting

### "Cannot find module '@mariozechner/clipboard-android-arm64'"

Run the patch script:
```bash
bash scripts/patch-termux.sh
```

### "Cannot find module '@typescript/native-preview-...'"

The Termux wrapper doesn't use this. Use `./termux-run.sh` or `node openclaw.mjs` instead of `pnpm openclaw`.

### Gateway fails to start

Some channels may not work due to missing native modules. Check logs:
```bash
./termux-run.sh logs --tail 50
```

## Recommended Channels for Termux

These channels work well on Termux:
- ✅ WhatsApp (Baileys - pure JS)
- ✅ Telegram (grammY - pure JS)
- ✅ Discord (discord.js - pure JS)
- ✅ Slack (Bolt - pure JS)
- ✅ Signal (signal-cli external process)
- ✅ WebChat (built-in)

These may have issues:
- ⚠️ iMessage (macOS only)
- ⚠️ Matrix (native crypto module)
- ⚠️ Canvas (native module)
