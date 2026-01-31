# Changelog

## 2026.1.30

### Features

- Initial Mezon plugin release
- Mezon chat integration via mezon-sdk (WebSocket-based event handling)
- Direct messages (DMs) with pairing-based access control
- Clan channel support with mention-gating
- Thread-aware conversations with independent session contexts
- Media support (images, audio, video, documents up to 500MB)
- Streaming responses with intelligent coalescing (1500 chars / 1s idle)
- Multi-account support with per-account configuration
- Access control via dmPolicy (pairing, allowlist, open, disabled)
- Group access control via groupPolicy (allowlist, open, disabled)
- User ID and username normalization for allowlists
- Environment variable fallback for default account credentials (MEZON_TOKEN, MEZON_BOT_ID)
- Message deduplication with 5-minute TTL cache (max 2000 messages)
- Echo loop prevention via bot user ID tracking and sent message tracking
- Envelope sanitization for web chat history cleanup
- Session key derivation from account ID, channel ID, and thread ID (hashed)
- Status monitoring and probing support

### Improvements

- Added proper configuration schema with Zod validation
- Added plugin descriptor (openclaw.plugin.json)
- Added comprehensive README and documentation
- Added bot user ID retrieval with multiple fallback strategies
- Added defensive sent message tracking to prevent echo loops
- Added Mezon to envelope sanitization system for clean web chat display
- Added support for Markdown text chunking (4000 char limit)
- Added streaming coalescing configuration options

### SDK Integration

- Mezon SDK (mezon-sdk) for WebSocket-based real-time messaging
- Login flow via loginMezonClient()
- Event-driven message handling via onChannelMessage() callback
- DM channel creation via channelManager.createDMchannel()
- Channel message sending via channel.send()
- Attachment support via URL embedding

### Access Control Features

- Pairing workflow for unknown DM senders with 1-hour code expiry
- Allowlist support for user IDs and usernames (with @ prefix handling)
- Mention-gating for clan/group channels (requireMention: true by default)
- Per-account access control overrides
- Wildcard support ("\*") for open policies

### Capabilities

- Direct messages: ✅ Supported (pairing-gated by default)
- Clan channels: ✅ Supported (mention-gated by default)
- Threads: ✅ Supported (thread-aware session keys)
- Media: ✅ Supported (images, audio, video, documents via URL embedding)
- Reactions: ✅ Supported
- Streaming: ✅ Supported (with configurable coalescing)
- Typing indicators: ❌ Not available (SDK limitation)
- Slash commands: ❌ Not available (SDK limitation)

### Known Limitations

- Typing indicators not supported (Mezon SDK does not expose typing API)
- Native slash-command registration not supported (text parsing only)
- Mezon SDK creates "./mezon-cache/" directory relative to process.cwd() — workaround implemented to use user's home directory on Windows when gateway starts from system directories

### Configuration Reference

Core options: `enabled`, `token`, `botId`, `dmPolicy`, `allowFrom`, `groupPolicy`, `groupAllowFrom`, `requireMention`, `name`

Advanced options: `textChunkLimit`, `chunkMode`, `blockStreaming`, `blockStreamingCoalesce`, `configWrites`

Multi-account: `accounts.<id>.token`, `accounts.<id>.botId`, `accounts.<id>.name`, plus per-account overrides for all policy options

### Delivery Targets

Supported formats: `channel:<id>`, `user:<id>`, `@<id>`, `mezon:<id>`, `#<id>`, plain ID (defaults to channel)

### Platform Support

- Cross-platform: Web, Desktop (Windows/macOS/Linux), Mobile (iOS/Android)
- End-to-end encryption for all communications
- Sub-millisecond response times (platform capability)
- Support for millions of concurrent connections (platform capability)
