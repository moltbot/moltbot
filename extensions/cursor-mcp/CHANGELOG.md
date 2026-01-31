# Changelog

## 2026.1.29

Initial release of OpenClaw Cursor MCP integration.

### Features

- **MCP Server**: Full Model Context Protocol server implementation for Cursor IDE
- **Tools**:
  - `openclaw_chat`: Chat with OpenClaw AI agent
  - `openclaw_list_sessions`: List active sessions
  - `openclaw_get_session`: Get session details
  - `openclaw_clear_session`: Clear session history
  - `openclaw_execute_command`: Execute OpenClaw commands
  - `openclaw_send_message`: Send messages through channels
  - `openclaw_get_status`: Get gateway status
  - `openclaw_list_models`: List available models
- **Resources**:
  - `openclaw://status`: Gateway status
  - `openclaw://models`: Available models
  - `openclaw://sessions`: Active sessions
  - `openclaw://config`: Configuration (sanitized)
- **Prompts**:
  - `code_review`: Code review assistance
  - `explain_code`: Code explanation
  - `generate_tests`: Test generation
  - `refactor_code`: Refactoring suggestions
  - `debug_help`: Debugging assistance
  - `send_notification`: Channel notifications
- **CLI Commands**:
  - `openclaw mcp serve`: Start MCP server
  - `openclaw mcp info`: Show configuration help
