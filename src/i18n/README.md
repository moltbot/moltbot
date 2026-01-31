# Internationalization (i18n) in OpenClaw

This directory contains the core logic and translation files for OpenClaw's internationalization.

## Core Principles

### Zero Impact on Logic

The i18n layer is a pure UI wrapper. It does not alter the underlying business logic or command execution.

### Seamless Migration

Existing code remains functional. The `t()` function acts as a pass-through when no translation is found, ensuring 100% backward compatibility.

### Graceful Fallback

If a specific key is missing in the target language, the system automatically falls back to the English (default) string.

## How It Works

OpenClaw uses a lightweight JSON-based translation system.

1. **Detection**: It checks the `LANG` or `LC_ALL` environment variables.
2. **Lookup**: Matches the string key against the corresponding JSON file in `src/i18n/locales/`.
3. **Rendering**: Injects the translated string into the TUI or CLI output.

## Usage

To run OpenClaw in a specific language, set your environment variable:

### Bash

```bash
# Run in Chinese
LANG=zh_CN openclaw onboarding

# Run in English (Default)
openclaw onboarding
```

## Contributing a New Language

1. Copy `locales/en.json` to `locales/<lang_code>.json`.
2. Translate the values while keeping the keys identical to the English version.
3. Submit a Pull Request!
