---
summary: "Mezon bot support status, capabilities, and configuration"
read_when:
  - Working on Mezon features or integration
---

# Mezon

Status: experimental (plugin). Supports clans, channels, DMs, and threads via the Mezon SDK.

## Plugin required

Mezon ships as a plugin and is not bundled with the core install.

- Install via CLI: `openclaw plugins install @openclaw/mezon`
- Or select **Mezon** during onboarding and confirm the install prompt
- Details: [Plugins](/plugin)

## Quick setup (beginner)

1. Install the Mezon plugin:
   - From a source checkout: `openclaw plugins install ./extensions/mezon`
   - From npm (if published): `openclaw plugins install @openclaw/mezon`
   - Or pick **Mezon** in onboarding and confirm the install prompt
2. Set the token:
   - Env: `MEZON_TOKEN=...`
   - Or config: `channels.mezon.token: "..."`.
3. Restart the gateway (or finish onboarding).
4. DM access is pairing by default; approve the pairing code on first contact.

Minimal config:

```json5
{
  channels: {
    mezon: {
      enabled: true,
      token: "your-bot-token",
      dmPolicy: "pairing",
    },
  },
}
```

## What it is

Mezon is a team communication platform with clans, channels, DMs, and threads.
Its bot SDK lets the Gateway run a bot that participates in any of these conversation types.

- A Mezon bot channel owned by the Gateway.
- Deterministic routing: replies go back to Mezon; the model never chooses channels.
- DMs share the agent's main session.
- Clan channels and group conversations are supported with mention-gating.

## Setup (fast path)

### 1) Create a bot token (Mezon Developer Portal)

1. Go to **https://mezon.ai/developers/applications** and sign in.
2. Create a new application and configure its bot settings.
3. Copy the bot token.

### 2) Configure the token (env or config)

Example:

```json5
{
  channels: {
    mezon: {
      enabled: true,
      token: "your-bot-token",
      dmPolicy: "pairing",
    },
  },
}
```

Env option: `MEZON_TOKEN=...` (works for the default account only).

Multi-account support: use `channels.mezon.accounts` with per-account tokens and optional `name`.

3. Restart the gateway. Mezon starts when a token is resolved (env or config).
4. DM access defaults to pairing. Approve the code when the bot is first contacted.

## How it works (behavior)

- Uses the `mezon-sdk` package for event-driven message handling. The bot connects via `loginMezonClient()` and listens for messages through the `onChannelMessage()` callback.
- Inbound messages are normalized into the shared channel envelope with media placeholders.
- Replies always route back to the same Mezon chat (deterministic routing).
- Messages are deduplicated with a 5-minute TTL cache (max 2000 recent messages). If the same message ID arrives twice within the window, the duplicate is dropped silently.
- Rapid inbound messages are debounced — when multiple messages arrive in quick succession for the same session, they are coalesced before being dispatched to the model.
- Session keys are derived from the combination of account ID, channel ID, and thread ID (hashed), so each conversation context maps to a unique session.
- No typing indicators — the Mezon SDK does not expose a typing indicator API, so the bot cannot signal "typing…" to the user.

## Limits

- Outbound text is chunked to 4000 characters (configurable via `textChunkLimit`).
- Chunking strategy configurable: `length` (default, split by size) or `newline` (split on every newline).
- Media is handled via URL embedding; local media loaded through the media subsystem.
- Streaming is enabled by default with coalescing (min 1500 chars or 1 second idle before sending).

### SDK limitations

- **No typing indicator API** — the bot cannot show "typing…" status. Users see no feedback until the first message chunk arrives.
- **No native slash-command registration** — the SDK does not support registering slash commands with the Mezon client. Commands are handled via text parsing only.

## Access control

### DM access

- Default: `channels.mezon.dmPolicy = "pairing"`. Unknown senders receive a pairing code; messages are ignored until approved.
- Approve via:
  - `openclaw pairing list mezon`
  - `openclaw pairing approve mezon <CODE>`
- Pairing is the default token exchange. Details: [Pairing](/start/pairing)
- `channels.mezon.allowFrom` accepts user IDs or usernames (with or without `@` prefix).
- Policies: `pairing` (default), `allowlist`, `open`, `disabled`.

### Group access

- Default: `channels.mezon.groupPolicy = "allowlist"`. Only users in `groupAllowFrom` trigger responses.
- Policies: `allowlist` (default), `open`, `disabled`.
- `channels.mezon.groupAllowFrom` accepts user IDs.

### Mention gating

- `channels.mezon.requireMention = true` (default). In clan/group channels the bot only responds when explicitly @mentioned.

### Examples

**Strict team setup** — allowlist + mention gating, only approved users in DMs and groups:

```json5
{
  channels: {
    mezon: {
      enabled: true,
      token: "your-bot-token",
      dmPolicy: "allowlist",
      allowFrom: ["alice", "bob", "@charlie"],
      groupPolicy: "allowlist",
      groupAllowFrom: ["alice", "bob"],
      requireMention: true,
    },
  },
}
```

**Open DMs** — anyone can DM the bot, groups still require mention:

```json5
{
  channels: {
    mezon: {
      enabled: true,
      token: "your-bot-token",
      dmPolicy: "open",
      allowFrom: ["*"],
      groupPolicy: "open",
      requireMention: true,
    },
  },
}
```

## Capabilities

| Feature                                 | Status           | Notes                                  |
| --------------------------------------- | ---------------- | -------------------------------------- |
| Direct messages                         | ✅ Supported     | Pairing-gated by default               |
| Groups                                  | ✅ Supported     | Mention-gated by default               |
| Media (images, audio, video, documents) | ✅ Supported     | Via URL embedding                      |
| Reactions                               | ✅ Supported     |                                        |
| Threads                                 | ✅ Supported     | Thread-aware session keys              |
| Streaming                               | ✅ Supported     | With coalescing (1500 chars / 1s idle) |
| Typing indicators                       | ❌ Not available | SDK limitation                         |
| Slash commands                          | ❌ Not available | SDK limitation; text commands only     |

## Delivery targets (CLI/cron)

- `channel:<id>` — send to a channel.
- `user:<id>` — send a DM to a user.
- `group:<id>` — alias for channel.
- `@<id>` or `mezon:<id>` — send a DM to a user.
- `#<id>` — send to a channel.
- Plain ID defaults to channel.
- Example: `openclaw message send --channel mezon --target user:12345abc --message "hi"`.

**How to find IDs:** Check the gateway logs on inbound messages — each log entry includes the sender's user ID and the channel/thread ID. You can also use Mezon's app developer tools (if available) to inspect channel and user IDs.

## Multi-account support

```json5
{
  channels: {
    mezon: {
      enabled: true,
      token: "base-token",
      accounts: {
        work: {
          token: "work-bot-token",
          dmPolicy: "allowlist",
          allowFrom: ["user1", "user2"],
        },
        personal: {
          token: "personal-bot-token",
          dmPolicy: "open",
          allowFrom: ["*"],
        },
      },
    },
  },
}
```

Each account starts independently with its own token and configuration. Account-specific settings override the base-level defaults.

## Troubleshooting

**Bot doesn't respond:**

- Check that the token is valid: `openclaw channels status --probe`
- Verify the sender is approved (pairing or allowFrom)
- Ensure the bot has been added to the clan/channel
- Check gateway logs: `openclaw logs --follow`

**Bot ignores group messages:**

- Verify `requireMention` is true and you are @mentioning the bot
- Check `groupPolicy` is not `disabled`
- Confirm the sender is in `groupAllowFrom` (if using `allowlist` policy)

**Media not delivered:**

- Confirm the attachment URL is accessible
- Check gateway logs for media download errors

**Pairing codes not working:**

- Pairing codes expire after 1 hour. Reissue with `openclaw pairing list mezon` and share the new code.
- Ensure the user is sending the code as a DM to the bot, not in a group channel.

**Bot connected but no messages arrive:**

- Verify the bot has been added to the clan. The bot must be a member of the clan and have access to the target channel.
- Check gateway logs for SDK login confirmation: `openclaw logs --follow` and look for the "Mezon logged in" entry.
- If the bot logged in but messages are missing, confirm the channel type matches expectations (DM vs. group vs. thread).

**Duplicate messages:**

- The dedup cache holds up to 2000 messages with a 5-minute TTL. If you see duplicates, check `openclaw logs` for cache-miss entries — this can happen if the gateway restarted and the cache was cleared.
- Persistent duplicates may indicate the SDK is delivering the same event twice; check for multiple bot instances running with the same token.

**Streaming feels delayed:**

- Streaming uses coalescing by default: the bot waits for at least 1500 characters or 1 second of idle time before sending a chunk. This prevents rapid small edits from flooding the chat.
- To reduce perceived delay, lower the coalescing thresholds:
  ```json5
  {
    channels: {
      mezon: {
        blockStreamingCoalesce: {
          minChars: 500, // send sooner (default: 1500)
          idleMs: 500, // shorter idle window (default: 1000)
        },
      },
    },
  }
  ```
- To disable streaming entirely, set `blockStreaming: true`.

**Token rejected on startup:**

- Run `openclaw channels status --probe` to verify the token is valid.
- Confirm the token in your config matches the one from the Mezon Developer Portal. Tokens are opaque strings — ensure no leading/trailing whitespace.
- If using `MEZON_TOKEN` env var, verify it is exported in the shell where the gateway runs.

More help: [Channel troubleshooting](/channels/troubleshooting).

## Configuration reference (Mezon)

Full configuration: [Configuration](/gateway/configuration)

Provider options:

- `channels.mezon.enabled`: enable/disable channel startup.
- `channels.mezon.token`: bot token from Mezon Developer Portal.
- `channels.mezon.dmPolicy`: `pairing | allowlist | open | disabled` (default: pairing).
- `channels.mezon.allowFrom`: DM allowlist (user IDs or usernames). `open` requires `"*"`.
- `channels.mezon.groupPolicy`: `allowlist | open | disabled` (default: allowlist).
- `channels.mezon.groupAllowFrom`: group allowlist (user IDs).
- `channels.mezon.requireMention`: require @mention in groups (default: true).
- `channels.mezon.textChunkLimit`: max characters per outbound chunk (default: 4000).
- `channels.mezon.chunkMode`: chunking strategy, `length` or `newline` (default: length).
- `channels.mezon.blockStreaming`: disable block streaming (default: false).
- `channels.mezon.blockStreamingCoalesce.minChars`: min chars before sending streamed block (default: 1500).
- `channels.mezon.blockStreamingCoalesce.idleMs`: idle time before sending streamed block (default: 1000).
- `channels.mezon.configWrites`: allow channel-initiated config writes (default: true).
- `channels.mezon.capabilities`: optional provider capability tags.

Multi-account options:

- `channels.mezon.accounts.<id>.token`: per-account token.
- `channels.mezon.accounts.<id>.name`: display name.
- `channels.mezon.accounts.<id>.enabled`: enable/disable account.
- `channels.mezon.accounts.<id>.dmPolicy`: per-account DM policy.
- `channels.mezon.accounts.<id>.allowFrom`: per-account DM allowlist.
- `channels.mezon.accounts.<id>.groupPolicy`: per-account group policy.
- `channels.mezon.accounts.<id>.groupAllowFrom`: per-account group allowlist.
- `channels.mezon.accounts.<id>.requireMention`: per-account mention gating.
- `channels.mezon.accounts.<id>.textChunkLimit`: per-account chunk limit.
- `channels.mezon.accounts.<id>.chunkMode`: per-account chunk mode.
- `channels.mezon.accounts.<id>.blockStreaming`: per-account streaming toggle.
- `channels.mezon.accounts.<id>.blockStreamingCoalesce`: per-account coalesce settings.
- `channels.mezon.accounts.<id>.configWrites`: per-account config writes toggle.
