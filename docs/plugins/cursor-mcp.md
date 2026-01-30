---
title: Cursor IDE Integration
description: Use OpenClaw as an AI backend in Cursor IDE via MCP
---

# Cursor IDE Integration

OpenClaw provides a Model Context Protocol (MCP) server that integrates with [Cursor IDE](https://cursor.com), enabling you to use OpenClaw's AI capabilities directly in Cursor's Composer Agent.

## Overview

The Cursor MCP integration allows you to:

- **Chat with OpenClaw**: Use OpenClaw's AI agent directly in Cursor
- **Manage Sessions**: Create, list, and manage conversation sessions
- **Send Messages**: Route messages through WhatsApp, Telegram, Discord, and more
- **Access Models**: Use any AI model configured in OpenClaw
- **Code Assistance**: Built-in prompts for code review, debugging, and testing

## Quick Setup

### Prerequisites

1. [Install OpenClaw](/install)
2. Start the OpenClaw gateway:
   ```bash
   openclaw gateway run
   ```
3. Install [Cursor IDE](https://cursor.com)

### Configure Cursor

#### Option 1: Cursor Settings UI

1. Open **Cursor Settings** → **Features** → **MCP**
2. Click **"+ Add New MCP Server"**
3. Configure:
   - **Name**: `openclaw`
   - **Type**: `stdio`
   - **Command**: `openclaw`
   - **Arguments**: `mcp serve`

#### Option 2: Manual Configuration

Create or edit `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "openclaw",
      "args": ["mcp", "serve"],
      "env": {
        "OPENCLAW_GATEWAY_URL": "ws://127.0.0.1:18789"
      }
    }
  }
}
```

### Authentication

If your gateway requires authentication:

```json
{
  "mcpServers": {
    "openclaw": {
      "command": "openclaw",
      "args": ["mcp", "serve"],
      "env": {
        "OPENCLAW_GATEWAY_URL": "ws://127.0.0.1:18789",
        "OPENCLAW_GATEWAY_TOKEN": "your-token-here",
        "OPENCLAW_GATEWAY_PASSWORD": "your-password-here"
      }
    }
  }
}
```

## Available Tools

The MCP server exposes these tools to Cursor:

| Tool | Description |
|------|-------------|
| `openclaw_chat` | Chat with the OpenClaw AI agent |
| `openclaw_list_sessions` | List all active chat sessions |
| `openclaw_get_session` | Get details about a specific session |
| `openclaw_clear_session` | Clear a session's conversation history |
| `openclaw_execute_command` | Execute OpenClaw control commands |
| `openclaw_send_message` | Send messages through channels |
| `openclaw_get_status` | Get gateway and channel status |
| `openclaw_list_models` | List available AI models |

### Tool Examples

#### Chat with OpenClaw

```
User: Ask OpenClaw to explain this Python code
Cursor Agent: [Uses openclaw_chat tool]
```

#### Send a Message

```
User: Send "Build completed" to my Telegram channel
Cursor Agent: [Uses openclaw_send_message tool]
```

## Available Resources

Access OpenClaw data via MCP resources:

| URI | Description |
|-----|-------------|
| `openclaw://status` | Gateway and channel status |
| `openclaw://models` | Available AI models |
| `openclaw://sessions` | Active chat sessions |
| `openclaw://config` | Current configuration (sanitized) |

## Available Prompts

Built-in prompts for common development tasks:

| Prompt | Description |
|--------|-------------|
| `code_review` | Review code for issues and improvements |
| `explain_code` | Explain how code works |
| `generate_tests` | Generate tests for code |
| `refactor_code` | Suggest refactoring improvements |
| `debug_help` | Help debug issues |
| `send_notification` | Send notification via channels |

## CLI Commands

```bash
# Start MCP server manually (usually done by Cursor)
openclaw mcp serve

# Show configuration help
openclaw mcp info

# Custom options
openclaw mcp serve --url ws://localhost:18789 --session agent:main:cursor
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENCLAW_GATEWAY_URL` | Gateway WebSocket URL | `ws://127.0.0.1:18789` |
| `OPENCLAW_GATEWAY_TOKEN` | Authentication token | - |
| `OPENCLAW_GATEWAY_PASSWORD` | Authentication password | - |
| `OPENCLAW_SESSION_KEY` | Default session key | `agent:main:cursor` |

## Architecture

```
┌─────────────────┐     MCP Protocol     ┌──────────────────┐
│   Cursor IDE    │◄───────────────────►│  OpenClaw MCP    │
│  (MCP Client)   │      (stdio)         │     Server       │
└─────────────────┘                      └────────┬─────────┘
                                                  │
                                                  │ WebSocket
                                                  ▼
                                         ┌──────────────────┐
                                         │  OpenClaw        │
                                         │  Gateway         │
                                         └────────┬─────────┘
                                                  │
                    ┌─────────────────────────────┼─────────────────────────────┐
                    │                             │                             │
                    ▼                             ▼                             ▼
            ┌───────────────┐           ┌───────────────┐           ┌───────────────┐
            │   AI Models   │           │   Channels    │           │   Sessions    │
            │ (Anthropic,   │           │ (WhatsApp,    │           │               │
            │  OpenAI...)   │           │  Telegram...) │           │               │
            └───────────────┘           └───────────────┘           └───────────────┘
```

## Troubleshooting

### Gateway Connection Failed

1. Ensure the OpenClaw gateway is running:
   ```bash
   openclaw gateway run
   ```

2. Check the gateway URL in your configuration

3. Verify authentication credentials if required

### Tools Not Appearing

1. Restart Cursor after adding the MCP server
2. Check Cursor's MCP logs for errors
3. Ensure `openclaw` is in your system PATH

### Session Issues

Clear and restart a session using the `openclaw_clear_session` tool or:

```bash
openclaw sessions clear agent:main:cursor
```

## Using Cursor's Models in OpenClaw

The integration is bidirectional - you can also use Cursor's AI models (Claude, GPT-4, etc.) as providers for OpenClaw.

### Setup

1. **Install Copilot Proxy extension** in Cursor (search for "Copilot Proxy" by AdrianGonz97)

2. **Check the proxy**:
   ```bash
   openclaw mcp setup-models --check
   ```

3. **Configure OpenClaw**:
   ```bash
   openclaw config set agents.defaults.model cursor/claude-sonnet-4
   ```

### Available Models

| Model | ID |
|-------|-----|
| Claude Sonnet 4 | `cursor/claude-sonnet-4` |
| Claude Sonnet 4 (Thinking) | `cursor/claude-sonnet-4-thinking` |
| GPT-4o | `cursor/gpt-4o` |
| GPT-4o Mini | `cursor/gpt-4o-mini` |
| o1 | `cursor/o1` |
| Gemini 2.5 Pro | `cursor/gemini-2.5-pro` |

### Usage

```bash
# Use Cursor's Claude in OpenClaw
openclaw agent --model cursor/claude-sonnet-4 "Help me debug this"

# In the TUI
openclaw tui --model cursor/gpt-4o
```

## See Also

- [Gateway Configuration](/gateway/configuration)
- [Model Providers](/concepts/model-providers)
- [Sessions](/concepts/sessions)
- [Messaging Channels](/channels)
