# AssureBot

**Lean, secure, self-hosted AI assistant for Railway.**

Your AI agent that runs on your infrastructure, answers only to you, and you can actually audit.

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/template/assurebot)

## Why AssureBot?

| Full OpenClaw | AssureBot |
|---------------|-----------|
| 12+ channels | Telegram only |
| File-based config | Env vars only |
| Plugins/extensions | None (locked down) |
| Desktop/mobile apps | Headless server |
| Complex setup | One-click deploy |

**Trade-off**: Less features, more trust.

## Features

- **Telegram Bot** — Allowlist-only access, no public commands
- **Image Analysis** — Send photos for AI analysis (Claude Vision / GPT-4V)
- **Webhook Receiver** — Authenticated HTTP endpoint for integrations
- **Docker Sandbox** — Isolated code execution (no network, dropped caps)
- **Cron Scheduler** — Time-based recurring tasks
- **Full Audit Log** — JSONL logs of every interaction

## Quick Start

### Environment Variables

```bash
# Required
TELEGRAM_BOT_TOKEN=your_bot_token
ALLOWED_USERS=123456789,987654321  # Telegram user IDs

# AI Provider (one required)
ANTHROPIC_API_KEY=sk-ant-...
# or
OPENAI_API_KEY=sk-...

# Optional
WEBHOOK_SECRET=auto-generated-if-empty
AUDIT_LOG_PATH=/data/audit.jsonl
SANDBOX_ENABLED=true
```

### Deploy to Railway

1. Click the deploy button above
2. Set environment variables
3. Your bot is live

### Run Locally

```bash
cd secure
pnpm install
pnpm start
```

### Docker

```bash
docker build -t assurebot -f secure/Dockerfile .
docker run -d \
  -e TELEGRAM_BOT_TOKEN=... \
  -e ALLOWED_USERS=... \
  -e ANTHROPIC_API_KEY=... \
  assurebot
```

## Security Model

- **No config files** — All secrets via environment variables
- **Allowlist only** — Only specified Telegram user IDs can interact
- **Timing-safe auth** — Webhook tokens compared safely
- **Sandbox isolation** — Code runs in Docker with no network, read-only root, dropped capabilities
- **Audit everything** — Every message, command, and action logged to JSONL

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Telegram   │────▶│  AssureBot  │────▶│  AI Agent   │
│   (User)    │◀────│   (Core)    │◀────│  (Claude/   │
└─────────────┘     └─────────────┘     │   OpenAI)   │
                           │            └─────────────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │ Webhooks │ │ Sandbox  │ │ Scheduler│
        └──────────┘ └──────────┘ └──────────┘
```

## Commands

In Telegram, send:
- Any text message → AI responds
- Photo with caption → Image analysis
- `/sandbox <code>` → Run code in isolated container
- `/schedule <cron> <task>` → Create scheduled task
- `/tasks` → List scheduled tasks

## Based On

AssureBot is a hardened fork of [OpenClaw](https://github.com/openclaw/openclaw), stripped down for security-first self-hosting.

## License

MIT
