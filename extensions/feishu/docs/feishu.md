---
summary: "Feishu bot support status, capabilities, and configuration"
read_when:
  - You want to connect Clawdbot to Feishu
  - You are debugging Feishu webhook callbacks
---

# Feishu (Bot API)

Status: experimental. HTTP callback only. Text messages only (V1).

## Plugin required

Feishu ships as a plugin and is not bundled with the core install.

- Install via CLI: `clawdbot plugins install @clawdbot/feishu`
- Or select **Feishu** during onboarding and confirm the install prompt

## Quick setup (beginner)

1. Install the Feishu plugin:
   - From a source checkout: `clawdbot plugins install ./extensions/feishu`
   - From npm (if published): `clawdbot plugins install @clawdbot/feishu`
2. Create a Feishu app, enable the bot feature, and get:
   - `appId`
   - `appSecret`
3. Configure event subscription:
   - Callback URL: `https://gateway.example.com/feishu`
   - Events: subscribe to `im.message.receive_v1`
   - Set either a **verification token** or an **encrypt key**
4. Configure Clawdbot:

```json5
{
  channels: {
    feishu: {
      enabled: true,
      appId: "cli_xxx",
      appSecret: "xxx",
      verificationToken: "xxx", // or encryptKey: "xxx"
      webhookPath: "/feishu",
      dm: { policy: "pairing" },
      groupPolicy: "allowlist",
      groups: {
        oc_xxx: { allow: true, requireMention: true },
      },
    },
  },
}
```

5. Start the gateway. Feishu will POST to the webhook path.
6. DM access is pairing by default; approve the pairing code on first contact.

## Webhook security

The plugin validates webhook requests using one of:

- `verificationToken`: checks the token provided in the callback payload.
- `encryptKey`: validates the Feishu signature header and decrypts encrypted payloads when present.

## Group behavior

- Default `groupPolicy` is `allowlist`.
- Groups require mention by default (`requireMention: true`).
- Configure allowlisted groups by **chat id** under `channels.feishu.groups`.

## Targets (delivery and allowlists)

- Direct message user: `user:<open_id>` (example open id format: `ou_xxx`)
- Group chat: `chat:<chat_id>` (example chat id format: `oc_xxx`)

Example outbound send:

```bash
clawdbot message send --channel feishu --target user:ou_xxx --message "hello"
```

## Configuration reference (Feishu)

Provider options:

- `channels.feishu.enabled`: enable/disable the channel.
- `channels.feishu.appId`: Feishu appId.
- `channels.feishu.appSecret`: Feishu appSecret.
- `channels.feishu.verificationToken`: webhook verification token.
- `channels.feishu.encryptKey`: webhook encrypt key (signature validation + optional decryption).
- `channels.feishu.webhookPath`: webhook path on the gateway HTTP server (default `/feishu`).
- `channels.feishu.webhookUrl`: optional; used to derive the webhook path.
- `channels.feishu.dm.policy`: `pairing | allowlist | open | disabled` (default `pairing`).
- `channels.feishu.dm.allowFrom`: allowlist entries (`ou_...`) or `"*"`.
- `channels.feishu.groupPolicy`: `allowlist | open | disabled` (default `allowlist`).
- `channels.feishu.groups.<chatId>`: group allowlist entry and options (`allow`, `requireMention`, `users`, `systemPrompt`).

Multi-account options:

- `channels.feishu.accounts.<id>.appId`
- `channels.feishu.accounts.<id>.appSecret`
- `channels.feishu.accounts.<id>.verificationToken`
- `channels.feishu.accounts.<id>.encryptKey`
- `channels.feishu.accounts.<id>.webhookPath`
- `channels.feishu.accounts.<id>.webhookUrl`
- `channels.feishu.accounts.<id>.dm`
- `channels.feishu.accounts.<id>.groups`
