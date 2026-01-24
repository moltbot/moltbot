# Clawdbot

**Clawdbot** is a personal AI assistant you run on your own devices. It answers you on the channels you already use (WhatsApp, Telegram, Slack, Discord, Signal, iMessage, Microsoft Teams, WebChat), plus extension channels like BlueBubbles, Matrix, Zalo, and Zalo Personal.

## Features

- **Multi-channel support**: Connect WhatsApp, Telegram, Discord, Slack, Signal, iMessage, Microsoft Teams, and more
- **Multiple AI providers**: Use Claude (Anthropic), GPT (OpenAI), Gemini (Google), or OpenRouter for access to many models
- **Self-hosted**: Your data stays on your infrastructure
- **Gateway architecture**: The gateway is the control plane for managing all your AI conversations
- **Canvas rendering**: Render live canvases you control
- **Voice support**: Speak and listen on macOS/iOS/Android

## Setup

1. Configure at least one AI provider API key (Anthropic, OpenAI, Gemini, or OpenRouter)
2. Generate a gateway token for API authentication: `openssl rand -hex 32`
3. Optionally configure messaging channel tokens (Telegram, Discord, Slack)
4. Access the control UI at `http://your-server:18789`

## Configuration

After installation, you can configure additional settings by editing files in the `config` data directory:

- `clawdbot.json` - Main configuration file (JSON5 format)
- `credentials/` - Channel credentials storage

## Documentation

- [Getting Started](https://docs.clawd.bot/start/getting-started)
- [Docker Installation](https://docs.clawd.bot/install/docker)
- [Configuration](https://docs.clawd.bot/configuration)
- [Channels Setup](https://docs.clawd.bot/channels)

## Links

- [Website](https://clawd.bot)
- [Documentation](https://docs.clawd.bot)
- [GitHub](https://github.com/clawdbot/clawdbot)
- [Discord Community](https://discord.gg/clawd)
