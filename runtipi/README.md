# Runtipi App Configuration

This directory contains the [Runtipi](https://runtipi.io) app configuration for Clawdbot.

## Directory Structure

```
runtipi/
└── clawdbot/
    ├── config.json          # App metadata and form fields
    ├── docker-compose.json  # Dynamic compose configuration
    └── metadata/
        ├── description.md   # App description for the store
        └── logo.png         # App logo (128x128)
```

## Using with Runtipi

### Option 1: Add to Custom App Store

1. Fork or create your own Runtipi app store repository
2. Copy the `clawdbot/` directory to your app store's `apps/` folder
3. Add your app store URL to Runtipi settings

### Option 2: Local Installation

1. Copy the `clawdbot/` directory to your Runtipi's `user-config/` folder
2. Restart Runtipi to detect the new app

## Prerequisites

Before installing Clawdbot on Runtipi, ensure you have:

1. **At least one AI provider API key**:
   - Anthropic API key (for Claude models)
   - OpenAI API key (for GPT models)
   - Google Gemini API key
   - OpenRouter API key (for multiple providers)

2. **A gateway token** for API authentication:
   ```bash
   openssl rand -hex 32
   ```

3. **(Optional) Messaging channel tokens**:
   - Telegram bot token from [@BotFather](https://t.me/BotFather)
   - Discord bot token from the [Developer Portal](https://discord.com/developers/applications)
   - Slack bot and app tokens

## Docker Image

This configuration uses the official Clawdbot Docker image from GitHub Container Registry:

```
ghcr.io/clawdbot/clawdbot:VERSION
```

To build and push your own image:

```bash
# From the clawdbot repository root
docker build -t ghcr.io/YOUR_ORG/clawdbot:latest .
docker push ghcr.io/YOUR_ORG/clawdbot:latest
```

Then update the image reference in `docker-compose.json`.

## Ports

| Port  | Purpose                           |
|-------|-----------------------------------|
| 18789 | Gateway HTTP/WebSocket (main)     |

## Volumes

| Container Path        | Purpose                    |
|-----------------------|----------------------------|
| /home/node/.clawdbot  | Configuration and sessions |
| /home/node/clawd      | Agent workspace            |

## Post-Installation

After installation:

1. Access the control UI at `http://YOUR_SERVER:18789`
2. Configure additional channels via the UI or by editing `config/clawdbot.json`
3. For WhatsApp: pair via QR code in the control UI

## Documentation

- [Getting Started](https://docs.clawd.bot/start/getting-started)
- [Docker Installation](https://docs.clawd.bot/install/docker)
- [Configuration](https://docs.clawd.bot/configuration)
