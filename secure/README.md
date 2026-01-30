# AssureBot

**Lean, secure, self-hosted AI assistant for Railway.**

Your AI agent that runs on your infrastructure, answers only to you, and you can actually audit.

## Why AssureBot?

| Full OpenClaw | AssureBot |
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
│  ├── Forward anything → get analysis                │
│  └── /commands for actions                          │
├─────────────────────────────────────────────────────┤
│  DOCUMENT ANALYSIS                                  │
│  ├── PDF extraction and summarization               │
│  ├── Code files, markdown, JSON, CSV                │
│  └── Up to 20MB per document                        │
├─────────────────────────────────────────────────────┤
│  WEBHOOKS IN (authenticated)                        │
│  ├── GitHub → "PR merged, here's the summary"       │
│  ├── Uptime → "Site down, checking why..."          │
│  └── Anything → AI-summarized to Telegram           │
├─────────────────────────────────────────────────────┤
│  SCHEDULED TASKS (persistent cron)                  │
│  ├── Morning briefing                               │
│  ├── Stored in PostgreSQL (survives restarts)       │
│  └── Conversations cached in Redis                  │
├─────────────────────────────────────────────────────┤
│  SANDBOX (isolated execution)                       │
│  ├── Docker container                               │
│  ├── No network by default                          │
│  └── Resource limits                                │
└─────────────────────────────────────────────────────┘
```

## Deploy to Railway

### Quick Start

1. Fork this repo
2. Create new Railway project → "Deploy from GitHub repo"
3. Select your fork
4. **Critical**: Click "Settings" → Set **Root Directory** to `secure`
5. Add services:
   - Click "New" → "Database" → "PostgreSQL"
   - Click "New" → "Database" → "Redis"
6. In main service, add Variables:
   - `TELEGRAM_BOT_TOKEN` (from @BotFather)
   - `ALLOWED_USERS` (your Telegram user ID, get it from @userinfobot)
   - `OPENROUTER_API_KEY` or `ANTHROPIC_API_KEY` or `OPENAI_API_KEY`
7. Railway auto-wires `DATABASE_URL` and `REDIS_URL` from the database services
8. Deploy!

### Getting Your Telegram User ID

1. Message @userinfobot on Telegram
2. It replies with your user ID (a number like `123456789`)
3. Use this as `ALLOWED_USERS`

## Configuration

**All config via environment variables. No files.**

### Required

```bash
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...    # From @BotFather
ALLOWED_USERS=123456789,987654321       # Telegram user IDs

# AI Provider (one required)
ANTHROPIC_API_KEY=sk-ant-...            # Claude direct
# or
OPENAI_API_KEY=sk-...                   # OpenAI direct
# or
OPENROUTER_API_KEY=sk-or-...            # OpenRouter (100+ models)
AI_MODEL=anthropic/claude-3.5-sonnet    # Optional: override default model
```

### Optional

```bash
# Storage (Railway provides these automatically)
DATABASE_URL=postgresql://...           # PostgreSQL for task persistence
REDIS_URL=redis://...                   # Redis for conversation caching

# Webhooks
WEBHOOK_SECRET=random-32-chars          # Auto-generated if missing
WEBHOOK_BASE_PATH=/hooks                # Default: /hooks

# Sandbox
SANDBOX_ENABLED=true                    # Default: true
SANDBOX_NETWORK=none                    # none | bridge
SANDBOX_MEMORY=512m
SANDBOX_CPUS=1
SANDBOX_TIMEOUT_MS=60000

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
| **Sandbox** | Docker: no network, read-only root, caps dropped |
| **Secrets** | Env-only, auto-redacted in logs |
| **Audit** | Every interaction logged |

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
pnpm install

# Dev mode
TELEGRAM_BOT_TOKEN=xxx \
ANTHROPIC_API_KEY=xxx \
ALLOWED_USERS=123456789 \
pnpm dev

# Production
pnpm build
pnpm start
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
{"ts":"2024-01-15T10:30:10Z","type":"sandbox","command":"python -c 'print(1)'","exitCode":0}
```

## Architecture

```
┌────────────────────┐     ┌────────────────────┐
│     assurebot      │────▶│     sandbox        │
│   (main container) │     │  (Docker sidecar)  │
│                    │     │                    │
│  • Telegram bot    │     │  • Isolated exec   │
│  • Webhook recv    │     │  • No network      │
│  • Scheduler       │     │  • Resource limits │
│  • Allowlist auth  │     │  • Ephemeral       │
└────────────────────┘     └────────────────────┘
         │
    ┌────┴────┬─────────────┐
    ▼         ▼             ▼
┌────────┐ ┌────────┐ ┌────────────────┐
│  Pg    │ │ Redis  │ │ Anthropic/     │
│ Tasks  │ │ Cache  │ │ OpenAI         │
└────────┘ └────────┘ └────────────────┘
```

## License

MIT

---

Based on [OpenClaw](https://github.com/openclaw/openclaw)
