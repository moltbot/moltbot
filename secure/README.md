# AssureBot

**Lean, secure, self-hosted AI assistant for Railway.**

Your AI agent that runs on your infrastructure, answers only to you, and you can actually audit.

## Why AssureBot?

| Full Moltbot | AssureBot |
|--------------|----------------|
| 12+ channels | Telegram only |
| File-based config | Env vars only |
| Plugins/extensions | None (locked down) |
| Desktop/mobile apps | Headless server |
| Complex setup | One-click deploy |

**Trade-off**: Less features, more trust.

## Features

```
┌─────────────────────────────────────────────────────┐
│  TELEGRAM (your secure UI)                          │
│  ├── Chat with AI (text, images, documents)         │
│  ├── Code execution (15+ languages)                 │
│  ├── Forward anything → get analysis                │
│  └── /commands for actions                          │
├─────────────────────────────────────────────────────┤
│  CODE EXECUTION                                     │
│  ├── /js, /python, /ts, /bash - Quick execute       │
│  ├── /run <lang> <code> - Any language              │
│  ├── Docker (local) or Piston API (cloud)           │
│  └── Isolated, no network, resource limits          │
├─────────────────────────────────────────────────────┤
│  WEBHOOKS IN (authenticated)                        │
│  ├── GitHub → "PR merged, here's the summary"       │
│  ├── Uptime → "Site down, checking why..."          │
│  └── Anything → AI-summarized to Telegram           │
├─────────────────────────────────────────────────────┤
│  SCHEDULED TASKS (cron)                             │
│  ├── Morning briefing                               │
│  ├── Monitor RSS/sites                              │
│  └── Recurring research                             │
├─────────────────────────────────────────────────────┤
│  PERSISTENCE (optional)                             │
│  ├── PostgreSQL - Tasks, user profiles              │
│  ├── Redis - Conversations, cache                   │
│  └── Personality learning per user                  │
└─────────────────────────────────────────────────────┘
```

## Commands

| Command | Description |
|---------|-------------|
| `/js <code>` | Run JavaScript |
| `/python <code>` | Run Python |
| `/ts <code>` | Run TypeScript |
| `/bash <code>` | Run shell commands |
| `/run <lang> <code>` | Run any language |
| `/status` | Bot & sandbox status |
| `/clear` | Clear conversation |
| `/schedule` | Schedule AI tasks |
| `/tasks` | List scheduled tasks |
| `/help` | Full command list |

**Supported Languages**: python, javascript, typescript, bash, rust, go, c, cpp, java, ruby, php

## Deploy to Railway

### One-Click (Recommended)

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template?template=https://github.com/TNovs1/moltbot/tree/main&envs=TELEGRAM_BOT_TOKEN,ALLOWED_USERS,ANTHROPIC_API_KEY)

This auto-provisions PostgreSQL and Redis for persistence.

### Manual

1. Fork this repo
2. Create Railway project from GitHub
3. **Set Root Directory to `secure`**
4. Set environment variables (see below)
5. Optionally add PostgreSQL and Redis services
6. Deploy

## Configuration

**All config via environment variables. No files.**

### Required

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...    # From @BotFather
ALLOWED_USERS=123456789,987654321       # Telegram user IDs

# Pick ONE AI provider:
ANTHROPIC_API_KEY=sk-ant-...            # Claude
OPENAI_API_KEY=sk-...                   # GPT-4
OPENROUTER_API_KEY=sk-or-...            # 100+ models
```

### Optional

```bash
# AI Model (optional - uses sensible defaults)
AI_MODEL=claude-sonnet-4-20250514       # or gpt-4o, etc.

# Storage (auto-wired on Railway template)
DATABASE_URL=postgres://...             # PostgreSQL
REDIS_URL=redis://...                   # Redis

# Sandbox (enabled by default)
SANDBOX_ENABLED=true                    # Auto-detects Docker or Piston API
SANDBOX_NETWORK=none                    # none | bridge
SANDBOX_MEMORY=512m
SANDBOX_CPUS=1
SANDBOX_TIMEOUT_MS=60000

# Webhooks
WEBHOOK_SECRET=random-32-chars          # Auto-generated if missing
WEBHOOK_BASE_PATH=/hooks                # Default: /hooks

# Scheduler
SCHEDULER_ENABLED=true                  # Default: true

# Audit
AUDIT_ENABLED=true                      # Default: true
AUDIT_LOG_PATH=/data/audit.jsonl

# Server
PORT=8080                               # Railway sets this
HOST=0.0.0.0
```

## Security Model

### What's Enforced

| Control | Implementation |
|---------|----------------|
| **Access** | Telegram user ID allowlist |
| **Auth** | Timing-safe token comparison |
| **Sandbox** | Docker (local) or Piston API (cloud), isolated |
| **Secrets** | Env-only, auto-redacted in logs |
| **Audit** | Every interaction logged |

### Sandbox Backends

AssureBot auto-detects the best available backend:

1. **Docker** - Full isolation, no network, caps dropped (requires Docker socket)
2. **Piston API** - Free cloud execution, 15+ languages (works on Railway/Render/Fly)
3. **None** - Sandbox disabled if neither available

### What's NOT Included

Intentionally removed:

- Web UI / setup wizard
- Plugin system
- WhatsApp/Signal/Discord/Slack
- File-based configuration
- Multi-account support
- Desktop/mobile apps

## Run Locally

```bash
cd secure
npm install

# Dev mode
TELEGRAM_BOT_TOKEN=xxx \
ANTHROPIC_API_KEY=xxx \
ALLOWED_USERS=123456789 \
npm run dev

# Production
npm run build
npm start
```

## Endpoints

| Path | Description |
|------|-------------|
| `/health` | Health check (JSON) |
| `/ready` | Readiness probe |
| `/hooks/*` | Webhook receiver (POST, auth required) |

## Webhook Usage

```bash
# Send a webhook
curl -X POST https://your-app.up.railway.app/hooks/github \
  -H "Authorization: Bearer YOUR_WEBHOOK_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"action": "opened", "pull_request": {"title": "Fix bug"}}'
```

All webhooks are:
1. Authenticated (token required)
2. Summarized by AI
3. Forwarded to all allowed Telegram users

## Audit Log Format

```jsonl
{"ts":"2024-01-15T10:30:00Z","type":"message","userId":123,"text":"Hello","response":"Hi!"}
{"ts":"2024-01-15T10:30:05Z","type":"webhook","path":"/hooks/github","status":200}
{"ts":"2024-01-15T10:30:10Z","type":"sandbox","command":"[python] print(1)","exitCode":0}
```

## Architecture

```
┌────────────────────┐     ┌────────────────────┐
│   AssureBot        │────▶│   Sandbox          │
│   (main container) │     │  (Docker/Piston)   │
│                    │     │                    │
│  • Telegram bot    │     │  • Code execution  │
│  • Webhook recv    │     │  • 15+ languages   │
│  • Scheduler       │     │  • Isolated        │
│  • Personality     │     │  • No network      │
└────────────────────┘     └────────────────────┘
         │
         ├────▶ [PostgreSQL] - Tasks, profiles
         ├────▶ [Redis] - Conversations, cache
         │
         ▼
    [Anthropic/OpenAI/OpenRouter]
    (Direct API calls)
```

## License

MIT - Same as Moltbot.

---

**Full Moltbot**: [github.com/moltbot/moltbot](https://github.com/moltbot/moltbot)
