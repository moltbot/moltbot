# Tech design: Feishu (飞书) channel plugin

## Summary

Implement `@clawdbot/feishu` as a channel extension that:

- Registers a channel plugin (`api.registerChannel`) and an HTTP webhook handler (`api.registerHttpHandler`).
- Starts a per-account “monitor” on gateway start (via `plugin.gateway.startAccount`) that registers webhook targets and manages runtime status.
- Uses the existing Clawdbot reply pipeline (`runtime.channel.reply.dispatchReplyWithBufferedBlockDispatcher`) to route inbound messages to an agent and send outbound replies back to Feishu.

This follows the proven “webhook channel” structure in `extensions/googlechat`.

## Architecture

### Components

- **Feishu plugin entrypoint**: `extensions/feishu/index.ts`
  - Stores `PluginRuntime` (like `extensions/googlechat/src/runtime.ts`).
  - Registers channel + HTTP handler.
- **Channel plugin**: `extensions/feishu/src/channel.ts`
  - Config adapter (accounts, enabled/configured, allowFrom formatting).
  - Outbound adapter (sendText).
  - Security adapter (DM policy warnings, group policy warnings).
  - Status adapter (probe + runtime snapshot).
  - Gateway adapter (startAccount → register webhook target).
- **Monitor / webhook handler**: `extensions/feishu/src/monitor.ts`
  - Parses raw body, validates signature/token, decrypts if needed.
  - Handles `url_verification`.
  - Handles `im.message.receive_v1` text messages.
  - Applies DM + group policies and mention gating.
  - Builds inbound context and calls reply dispatcher.
  - Sends replies via Feishu REST API.
- **API client**: `extensions/feishu/src/api.ts`
  - Token manager: `tenant_access_token/internal` (self-built apps).
  - Send message / reply message endpoints.
  - Bot info (`/open-apis/bot/v3/info`) to detect mentions.

## Webhook verification and decryption

### URL verification

- Feishu sends a payload (plain or encrypted) where `type === "url_verification"` and includes `challenge`.
- The handler responds `200` with JSON: `{"challenge":"<challenge>"}`.

### Decrypt algorithm

- If payload has `encrypt`:
  - Compute AES key = `sha256(encryptKey)` bytes (32 bytes).
  - Decode `encrypt` from base64.
  - IV = first 16 bytes; ciphertext = remaining bytes.
  - Decrypt via `aes-256-cbc` to UTF-8 JSON.

### Signature validation (encrypted mode)

- Headers: `x-lark-request-timestamp`, `x-lark-request-nonce`, `x-lark-signature`.
- Compute: `sha256(timestamp + nonce + encryptKey + rawBodyString)` (hex).
- Compare with `x-lark-signature`.
- Use the raw request body string exactly as received (do not re-stringify parsed JSON).

### Token validation (non-encrypted mode)

- When `encryptKey` is not configured, validate `verificationToken` against payload `token` (or `header.token`).

## Mention gating

- Fetch and cache bot identity via `GET /open-apis/bot/v3/info`.
- In group chats:
  - `wasMentioned = mentions.some(m => m.id.open_id === botOpenId || m.id.user_id === botUserId)`
  - Apply `resolveMentionGatingWithBypass` with `requireMention` from group config or channel default.

## Test strategy

Colocate tests in `extensions/feishu/src/` (Vitest).

- Signature verification (valid/invalid).
- Decrypt (known encryptKey + payload → expected JSON).
- Target normalization.
- URL verification and event parsing.
