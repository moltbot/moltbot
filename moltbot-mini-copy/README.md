# Moltbot Mini Copy

A minimal subset of [Moltbot](https://github.com/moltbot/moltbot) containing all core functionality but supporting only:

- **CLI client** (command-line interface)
- **WhatsApp channel** (via Baileys web)
- **OpenAI API** (as LLM provider)
- **Gateway server** (WebSocket RPC)
- **Storage layer** (config, sessions, credentials)
- **AI engine** (agent runtime with tool execution)

## What's Included

This is a **direct copy** of Moltbot source files with no modifications. Includes **2,106 TypeScript files** (1,428 source + 665 tests + 13 test utilities) preserving the original architecture patterns.

### Core Components

| Component | Files | Description |
|-----------|-------|-------------|
| `src/gateway/` | 131 | WebSocket RPC server (Hono HTTP) |
| `src/agents/` | 223 | AI agent runtime, tool execution, model catalog |
| `src/cli/` | 137 | Command-line interface with register.*.ts pattern |
| `src/config/` | 87 | Configuration types, Zod schemas, session management |
| `src/web/` | 43 | WhatsApp implementation (Baileys-based) |
| `src/channels/` | 77 | Channel plugin architecture |
| `src/infra/` | 116 | Infrastructure utilities (env, logging, ports) |
| `src/auto-reply/` | 119 | Auto-reply logic and routing |
| `src/commands/` | 169 | Built-in commands |

### Architecture Preserved

- **Gateway Pattern**: `src/gateway/server.ts` with protocol schemas
- **Plugin System**: `src/channels/plugins/types.ts` with 15+ adapters per plugin
- **Agent Tools**: `src/agents/*-tools.ts` and `*-tools.exec.ts` pattern
- **CLI Commands**: `src/cli/program/register.*.ts` pattern
- **Config Types**: `src/config/types.*.ts` and `zod-schema.*.ts`
- **Dependency Injection**: `createDefaultDeps()` pattern

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm or npm

### Installation

```bash
cd moltbot-mini-copy
npm install
```

### Development Mode

```bash
# Run gateway
npm run gateway:dev

# Run CLI commands
npm run dev -- --help
npm run dev -- status
npm run dev -- config show
```

### Build

```bash
npm run build
npm start -- --help
```

## Testing

All important tests are included - security, functionality verification, and sandboxing.

### Run Tests

```bash
# Run all unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage

# E2E tests
npm run test:e2e

# Live tests (requires API keys)
CLAWDBOT_LIVE_TEST=1 npm run test:live
```

### Test Categories

| Category | Count | Description |
|----------|-------|-------------|
| Unit tests | 603 | Core functionality verification |
| E2E tests | 52 | End-to-end integration tests |
| Live tests | 10 | Tests requiring live API access |

### Security & Sandbox Tests

The following critical test suites are included:

- **Sandbox tests** (18 files): `src/agents/sandbox*.test.ts`, `src/commands/sandbox*.test.ts`
  - Sandbox context resolution
  - Docker container isolation
  - Agent-specific sandbox configuration
  - Workspace path restrictions

- **Security tests**: `src/security/*.test.ts`
  - File permission auditing
  - External content sanitization
  - Security fix verification

- **Tool policy tests**: `src/agents/tool-policy*.test.ts`, `src/agents/sandbox/tool-policy.test.ts`
  - Tool execution permissions
  - Plugin allowlist enforcement

- **Exec approval tests**: `src/infra/exec-approval*.test.ts`, `src/gateway/server-methods/exec-approval*.test.ts`
  - Command execution approval flow
  - Approval forwarding

- **Bash execution tests**: `src/agents/bash-tools*.test.ts`
  - Command execution safety
  - PTY fallback handling
  - Background process management

## Adding Features from Full Moltbot

This subset is designed for progressive feature additions by copying more files from the full Moltbot repository.

### Adding a New Channel (e.g., Telegram)

1. Copy `src/telegram/` directory from full Moltbot
2. Copy `src/channels/plugins/outbound/telegram.ts`
3. Copy `src/channels/plugins/onboarding/telegram.ts`
4. Copy `src/channels/plugins/status-issues/telegram.ts`
5. Copy `src/channels/plugins/actions/telegram.ts`
6. Add Grammy dependency to package.json:
   ```json
   "grammy": "^1.39.3",
   "@grammyjs/runner": "^2.0.3",
   "@grammyjs/transformer-throttler": "^1.2.1"
   ```

### Adding a New LLM Provider (e.g., Anthropic)

1. Anthropic is already included in `@mariozechner/pi-ai`
2. Copy any provider-specific config from `src/providers/`
3. Update `src/config/zod-schema.providers.ts` if needed

### Adding Discord Channel

1. Copy `src/discord/` directory
2. Copy Discord plugin files from `src/channels/plugins/`
3. Add dependencies:
   ```json
   "@buape/carbon": "0.14.0",
   "discord-api-types": "^0.38.37"
   ```

## File Structure

```
moltbot-mini-copy/
├── src/
│   ├── index.ts                 # Library exports
│   ├── entry.ts                 # CLI entry point
│   ├── channel-web.ts           # WhatsApp channel bootstrap
│   ├── gateway/                 # WebSocket RPC server
│   │   ├── server.ts            # Main server
│   │   ├── server-methods.ts    # RPC method handlers
│   │   └── protocol/            # Protocol schemas
│   ├── agents/                  # AI agent runtime
│   │   ├── pi-embedded-runner/  # Pi agent integration
│   │   ├── sandbox/             # Sandboxing (Docker, paths, policy)
│   │   ├── model-catalog.ts     # Model definitions
│   │   ├── bash-tools.ts        # Tool definitions
│   │   └── tool-policy.ts       # Tool execution policy
│   ├── cli/                     # Command-line interface
│   │   ├── program.ts           # Main program builder
│   │   ├── deps.ts              # createDefaultDeps()
│   │   └── program/             # register.*.ts commands
│   ├── config/                  # Configuration system
│   │   ├── types.*.ts           # Type definitions
│   │   ├── zod-schema.*.ts      # Validation schemas
│   │   └── sessions/            # Session management
│   ├── web/                     # WhatsApp (Baileys)
│   │   ├── session.ts           # WhatsApp session
│   │   ├── login.ts             # QR code login
│   │   ├── inbound.ts           # Message handling
│   │   ├── outbound.ts          # Send messages
│   │   └── auto-reply/          # Auto-reply logic
│   ├── channels/                # Channel plugin system
│   │   ├── registry.ts          # Plugin registry
│   │   └── plugins/             # Plugin definitions
│   ├── infra/                   # Infrastructure
│   │   ├── env.ts               # Environment handling
│   │   ├── ws.ts                # WebSocket utilities
│   │   └── logging/             # Logging utilities
│   └── ...
├── test/                        # Test utilities
├── vitest.config.ts             # Unit test config
├── vitest.e2e.config.ts         # E2E test config
├── vitest.live.config.ts        # Live test config
├── package.json
├── tsconfig.json
└── moltbot.mjs
```

## What's NOT Included

This minimal copy excludes:

- **Other channels**: Telegram, Discord, Slack, Signal, iMessage, Line
- **Other LLM providers**: Bedrock, Ollama, local models (via node-llama-cpp)
- **Mobile apps**: iOS, Android, macOS
- **Extensions**: MS Teams, Matrix, Zalo, Voice Call
- **Browser automation**: Playwright (partial - basic browser code included)
- **Voice/TTS**: node-edge-tts (dependency removed)

## Comparison with Full Moltbot

| Feature | Mini Copy | Full Moltbot |
|---------|-----------|--------------|
| Channels | WhatsApp only | 10+ |
| LLM Providers | OpenAI (via Pi) | 6+ |
| Clients | CLI only | CLI + Mobile + Web |
| Gateway | Full | Full |
| Storage | Full | Full |
| AI Engine | Full | Full |
| Sandboxing | Full | Full |
| Security Tests | Full | Full |
| Source Files | 1,428 | ~2,500 |
| Test Files | 665 | ~800 |
| Dependencies | ~30 | ~60 |

## Notes

- All code is unmodified from the source Moltbot repository
- All critical tests included (security, sandbox, functionality)
- Some imports may need adjustment if not all dependencies are available
- The full plugin architecture is preserved for easy feature additions

## License

MIT (same as Moltbot)
