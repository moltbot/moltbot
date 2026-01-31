# @openclaw/mezon

Mezon chat platform plugin for OpenClaw.

🌐 [Mezon Homepage](https://mezon.ai) • 💻 [GitHub](https://github.com/mezonai/mezon) • 📚 [Full Documentation](https://docs.openclaw.ai/channels/mezon)

## Overview

This extension adds Mezon as a messaging channel to OpenClaw. [Mezon](https://mezon.ai) is a modern team communication platform (Discord alternative) with end-to-end encryption, cross-platform support, and built-in AI capabilities.

Your bot can:

- Receive and send encrypted DMs
- Participate in clan channels and threads
- Handle media (images, audio, video, documents up to 500MB)
- Stream responses with intelligent coalescing
- Support multiple bot accounts

## Installation

### Option 1: From npm (when published)

```bash
openclaw plugins install @openclaw/mezon
```

### Option 2: From local checkout

```bash
openclaw plugins install ./extensions/mezon
```

### Option 3: Via onboarding

```bash
openclaw onboard
# Select "Mezon" from the channel list
```

## Quick Setup

### 1. Create a Mezon Bot

1. Visit the [Mezon Developer Portal](https://mezon.ai/developers/applications)
2. Sign in with your Mezon account
3. Click **New Application** and give it a name
4. Navigate to the **Bot** section
5. Copy the **Bot Token** and **Bot ID**

### 2. Configure OpenClaw

**Using environment variables (recommended):**

```bash
export MEZON_TOKEN="your-bot-token"
export MEZON_BOT_ID="your-bot-id"
```

```json5
{
  channels: {
    mezon: {
      enabled: true,
    },
  },
}
```

**Or in config directly:**

```json5
{
  channels: {
    mezon: {
      enabled: true,
      token: "your-bot-token",
      botId: "your-bot-id",
      dmPolicy: "pairing", // Safe default: requires approval
    },
  },
}
```

### 3. Start the Gateway

```bash
openclaw gateway run
```

### 4. Test the Integration

1. Add your bot to a Mezon clan/channel
2. Send a DM or @mention the bot in a channel
3. For DMs with pairing policy, approve the request:
   ```bash
   openclaw pairing list mezon
   openclaw pairing approve mezon <CODE>
   ```

## Configuration

### Core Options

| Option           | Type     | Default       | Required | Description                                      |
| ---------------- | -------- | ------------- | -------- | ------------------------------------------------ |
| `enabled`        | boolean  | `true`        | No       | Enable/disable channel                           |
| `token`          | string   | -             | **Yes**  | Bot token from Developer Portal                  |
| `botId`          | string   | -             | **Yes**  | Bot ID from Developer Portal                     |
| `dmPolicy`       | string   | `"pairing"`   | No       | `pairing` \| `allowlist` \| `open` \| `disabled` |
| `allowFrom`      | string[] | `[]`          | No       | DM allowlist (user IDs or usernames)             |
| `groupPolicy`    | string   | `"allowlist"` | No       | `allowlist` \| `open` \| `disabled`              |
| `groupAllowFrom` | string[] | `[]`          | No       | Group allowlist (user IDs)                       |
| `requireMention` | boolean  | `true`        | No       | Require @mention in groups                       |
| `name`           | string   | -             | No       | Display name for account                         |

### Advanced Options

| Option                            | Type    | Default | Description                             |
| --------------------------------- | ------- | ------- | --------------------------------------- |
| `textChunkLimit`                  | number  | `4000`  | Max characters per message chunk        |
| `blockStreaming`                  | boolean | `false` | Disable streaming responses             |
| `blockStreamingCoalesce.minChars` | number  | `1500`  | Min chars before sending streamed block |
| `blockStreamingCoalesce.idleMs`   | number  | `1000`  | Idle milliseconds before sending block  |

## Access Control

### DM Policies

| Policy              | Behavior                                                 | Use Case                                        |
| ------------------- | -------------------------------------------------------- | ----------------------------------------------- |
| `pairing` (default) | Unknown users receive a pairing code; admin must approve | **Recommended**: Secure access for private bots |
| `allowlist`         | Only users in `allowFrom` can message                    | Strict team environments                        |
| `open`              | Anyone can message the bot                               | Public bots (use with caution)                  |
| `disabled`          | DMs are completely disabled                              | Channel-only bots                               |

### Group Policies

| Policy                | Behavior                                              | Use Case               |
| --------------------- | ----------------------------------------------------- | ---------------------- |
| `allowlist` (default) | Only users in `groupAllowFrom` can trigger            | Controlled team access |
| `open`                | Any member can trigger (mention-gating still applies) | Public channels        |
| `disabled`            | Group messages are disabled                           | DM-only bots           |

### Example: Team Setup (Recommended)

```json5
{
  channels: {
    mezon: {
      enabled: true,
      token: "${MEZON_TOKEN}",
      botId: "${MEZON_BOT_ID}",
      dmPolicy: "allowlist",
      allowFrom: ["alice", "@bob", "user123"],
      groupPolicy: "allowlist",
      groupAllowFrom: ["alice", "bob"],
      requireMention: true,
    },
  },
}
```

### Example: Public Bot

```json5
{
  channels: {
    mezon: {
      enabled: true,
      token: "${MEZON_TOKEN}",
      botId: "${MEZON_BOT_ID}",
      dmPolicy: "open",
      groupPolicy: "open",
      requireMention: true, // Still requires @mention in channels
    },
  },
}
```

## Multi-Account Support

```json5
{
  channels: {
    mezon: {
      enabled: true,
      accounts: {
        work: {
          name: "Work Bot",
          token: "${MEZON_WORK_TOKEN}",
          botId: "${MEZON_WORK_BOT_ID}",
          dmPolicy: "allowlist",
          allowFrom: ["alice", "@bob"],
        },
        personal: {
          name: "Personal Assistant",
          token: "${MEZON_PERSONAL_TOKEN}",
          botId: "${MEZON_PERSONAL_BOT_ID}",
          dmPolicy: "pairing",
        },
      },
    },
  },
}
```

## Capabilities

| Feature                            | Status            | Notes                         |
| ---------------------------------- | ----------------- | ----------------------------- |
| Direct messages                    | ✅ Supported      | Pairing-gated by default      |
| Clan channels                      | ✅ Supported      | Mention-gated by default      |
| Threads                            | ✅ Supported      | Thread-aware session keys     |
| Media (images, audio, video, docs) | ✅ Supported      | Up to 500MB via URL embedding |
| Reactions                          | ✅ Supported      | Full emoji support            |
| Streaming responses                | ✅ Supported      | With intelligent coalescing   |
| Typing indicators                  | ❌ SDK limitation | Not available                 |
| Slash commands                     | ❌ SDK limitation | Text commands only            |

## Programmatic Messaging

Send messages from CLI or cron jobs:

```bash
# Send to a user (DM)
openclaw message send --channel mezon --target user:12345abc --message "Hello!"

# Send to a channel
openclaw message send --channel mezon --target channel:67890def --message "Deploy complete"

# Alternative formats
--target @12345abc           # DM to user
--target mezon:12345abc      # DM to user
--target #67890def           # Channel
--target 67890def            # Channel (default)
```

**Finding IDs**: Check gateway logs (`openclaw logs --follow`) — each inbound message includes sender user ID and channel/thread ID.

## Troubleshooting

### Bot doesn't respond to messages

1. Verify token validity: `openclaw channels status --probe`
2. Check sender is approved (pairing or `allowFrom`)
3. Ensure bot is added to the clan/channel as a member
4. Check gateway logs: `openclaw logs --follow`
5. Verify `dmPolicy` is not `disabled`

### Bot ignores group messages

1. Ensure you are @mentioning the bot (`requireMention: true` by default)
2. Check `groupPolicy` is not `disabled`
3. Confirm sender is in `groupAllowFrom` (if using `allowlist` policy)
4. Verify bot has proper clan membership

### Pairing codes not working

- Codes expire after 1 hour — reissue: `openclaw pairing list mezon`
- Ensure user sends code as DM, not in a group channel
- Check pairing queue: `openclaw pairing list mezon`

### Token rejected on startup

- Run `openclaw channels status --probe` to verify token
- Ensure token matches Developer Portal (no whitespace)
- Verify `MEZON_TOKEN` env var is exported in gateway shell
- Check `botId` matches the Bot ID from Developer Portal

## Security Best Practices

1. **Never commit tokens** — use environment variables (`MEZON_TOKEN`, `MEZON_BOT_ID`)
2. **Use pairing or allowlist** in production (avoid `open` policy unless necessary)
3. **Enable mention-gating** for channels (`requireMention: true`)
4. **Regularly review** pairing approvals: `openclaw pairing list mezon`
5. **Monitor logs** for unauthorized access attempts: `openclaw logs --follow`

## Resources

- **Full Documentation**: https://docs.openclaw.ai/channels/mezon
- **Mezon Homepage**: https://mezon.ai
- **Mezon Developer Portal**: https://mezon.ai/developers/applications
- **Mezon GitHub**: https://github.com/mezonai/mezon
- **Mezon SDK Docs**: https://mezon.ai/docs/mezon-sdk-docs/

## License

MIT
