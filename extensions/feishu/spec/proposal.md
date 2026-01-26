# PRD: Feishu (飞书) channel extension

## Why

Clawdbot already supports several chat surfaces (e.g. Slack, Google Chat, Telegram). Feishu (飞书) is a common “primary chat” surface for many teams. Adding a Feishu channel plugin lets a user run Clawdbot as a personal assistant inside Feishu with the same security posture (pairing/allowlists) and the same agent routing + reply pipeline.

## Goals

- Ship a Feishu **channel plugin** under `extensions/` (installable from npm) that can:
  - Receive inbound messages (DM + group) via Feishu event subscription callback.
  - Respond with text replies (agent replies + `clawdbot message send`).
  - Respect Clawdbot’s DM security model (pairing/allowlist/open/disabled).
  - Support group allowlists + mention gating behavior consistent with other channels.
  - Show up in onboarding as an installable channel (like Matrix/MSTeams plugins).
- Keep V1 minimal and consistent with existing integration patterns:
  - `extensions/googlechat` for “HTTP webhook → monitor → reply dispatcher”
  - `extensions/msteams` for “extension owns provider + status + onboarding”

## Non-goals (V1)

- Full message-card interactivity (buttons / card callbacks).
- Full media pipeline parity (file upload/download for every Feishu message type).
- Full directory/lookup parity (live user/group directory browsing).
- Multi-tenant ISV (app store) flow in the first pass (internal/self-built app only).

## Primary user

Single human operator running Clawdbot for personal use, inside one Feishu tenant.

## User journeys (high-level)

1. User installs and enables the Feishu plugin.
2. User creates a Feishu app (self-built/internal) with Bot capability enabled.
3. User configures event subscription callback URL (served by Clawdbot Gateway).
4. User DMs the bot; unknown DMs get pairing code; after approval bot answers.
5. User adds bot to a group; bot responds only when allowed and mention-gated.

## Functional requirements (high-level)

- Inbound:
  - HTTP handler for Feishu event subscription callback.
  - Support `url_verification` challenge handshake.
  - Validate inbound requests (signature and/or verification token).
  - Handle `im.message.receive_v1` events.
- Outbound:
  - Send text messages to `open_id` (DM) and `chat_id` (group).
  - Reply-to behavior: best-effort thread/reply mapping if Feishu supports it.
- Security:
  - DM policy: `pairing` default; allowlists; `open`; `disabled`.
  - Group policy: `allowlist` default; optional `open` with mention gating; `disabled`.
  - Control command gating: ignore unauthorized control commands in group chats.
- Ops:
  - `channels status` shows configured/running/probe/last inbound/outbound.
  - `channels status --probe` validates token acquisition.

## Success criteria

- A user can complete onboarding and successfully:
  - Receive a DM and get a pairing code.
  - Approve pairing and receive a reply.
  - Receive a group message and respond only when allowlisted + mention-gated.
  - Send a message via `clawdbot message send --to <target>`.

## Decisions (confirmed)

1. **Region**: Feishu only.
2. **Inbound transport**: HTTP callback (event subscription webhook).
3. **V1 scope**: text-only.

## Risks and mitigations

- Misconfigured public exposure: document “only expose `/feishu` path” guidance and recommend a reverse proxy/Tailscale.
- Secret leakage: never log app secrets; store secrets only in config.
- Rate limits: cache tokens; chunk outbound messages via existing chunker helpers.

\*\*\* Add File: extensions/feishu/spec/design.md

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

\*\*\* Add File: extensions/feishu/spec/spec.md

# Spec: Feishu channel extension

## Requirements

### Requirement: Channel plugin availability

The system SHALL provide a Feishu chat channel as a Clawdbot extension plugin that can be installed and enabled without modifying core channel code.

#### Scenario: Plugin appears in onboarding catalog

- **GIVEN** a user runs `clawdbot onboard` in a workspace that contains the Feishu plugin (local path) or can access it on npm
- **WHEN** the user reaches the channel selection step
- **THEN** Feishu is listed as an installable channel plugin with a docs link

### Requirement: Webhook endpoint and URL verification

The system SHALL accept Feishu event subscription callbacks over HTTP and complete the platform “request URL verification” handshake.

#### Scenario: URL verification succeeds

- **GIVEN** Feishu sends a `type="url_verification"` callback payload with a `challenge`
- **WHEN** Clawdbot receives the POST at the configured webhook path
- **THEN** the response status is `200` and the response body is `{"challenge":"<value>"}` (JSON)

### Requirement: Request validation

The system SHALL validate inbound callback requests before processing events.

#### Scenario: Invalid signature/token is rejected

- **GIVEN** a callback request with an invalid signature (encrypted mode) OR mismatched verification token (non-encrypted mode)
- **WHEN** the request is received
- **THEN** the request is rejected with `401` and no message processing occurs

### Requirement: Encrypted payload support

When configured with an encrypt key, the system SHALL decrypt payloads that use the `encrypt` envelope.

#### Scenario: Encrypted event is processed

- **GIVEN** a callback request containing an `encrypt` field
- **WHEN** the plugin is configured with the correct `encryptKey`
- **THEN** the decrypted JSON is used for URL verification and event handling

### Requirement: Inbound message handling (DM)

The system SHALL process `im.message.receive_v1` DMs and route them into the Clawdbot agent pipeline with DM security policies.

#### Scenario: Unknown DM triggers pairing flow

- **GIVEN** `channels.feishu.dm.policy="pairing"`
- **AND** a DM sender is not allowlisted and not previously paired
- **WHEN** the sender DMs the bot
- **THEN** the system records a pairing request and replies with a pairing code message

### Requirement: Inbound message handling (groups)

The system SHALL process `im.message.receive_v1` group messages with group allowlists and mention gating.

#### Scenario: Group message is mention-gated

- **GIVEN** `channels.feishu.groupPolicy="open"` (or allowlisted group)
- **AND** `requireMention=true`
- **WHEN** a group message arrives without mentioning the bot
- **THEN** the system ignores the message and does not invoke the agent

### Requirement: Outbound text delivery

The system SHALL be able to send text messages to Feishu users and group chats.

#### Scenario: CLI message send delivers text

- **GIVEN** the user runs `clawdbot message send --to <feishu-target> --message "hi"`
- **WHEN** the target is a valid Feishu user (`open_id`) or chat (`chat_id`)
- **THEN** the plugin sends a Feishu API request that results in a visible message in the correct conversation

### Requirement: Status and probe visibility

The system SHALL expose Feishu channel health via `clawdbot channels status`, including an active probe that validates credentials.

#### Scenario: Probe fails with actionable error

- **GIVEN** the plugin is enabled but credentials are invalid
- **WHEN** the user runs `clawdbot channels status --probe`
- **THEN** the Feishu channel shows `probe=error` with an actionable message (e.g. token fetch failed)

\*\*\* Add File: extensions/feishu/spec/tasks.md

# Tasks: Add Feishu (飞书) channel extension

## 1. Extension scaffold

- [x] Create `extensions/feishu/` workspace package (`package.json`, `clawdbot.plugin.json`, `index.ts`, `src/`).
- [x] Add plugin catalog metadata in `extensions/feishu/package.json` (`clawdbot.channel` + `clawdbot.install`) so onboarding can install it.

## 2. Config + normalization

- [x] Define Feishu config Zod schema (extension-local) and expose it as `configSchema` via `buildChannelConfigSchema`.
- [x] Implement target normalization (`user:<open_id>`, `chat:<chat_id>`) and allowlist formatting.
- [x] Implement account model (start with default account; keep `accounts` extensible).

## 3. Token manager + API client

- [x] Implement tenant access token fetch + cache (`/auth/v3/tenant_access_token/internal`).
- [x] Implement Feishu “bot info” fetch (`/bot/v3/info`) for mention gating.
- [x] Implement send message (`/im/v1/messages`) and reply message (`/im/v1/messages/:message_id/reply`).

## 4. Webhook handler

- [x] Implement `handleFeishuWebhookRequest(req,res)` and register via `api.registerHttpHandler`.
- [x] Support `url_verification` challenge response (plain + encrypted).
- [x] Implement secure validation:
  - [x] Raw-body capture with size limit.
  - [x] Signature verification when `encryptKey` is configured.
  - [x] Verification token checks when `encryptKey` is not configured.
- [x] Implement decrypt for payloads with `encrypt`.

## 5. Event processing + routing

- [x] Handle `im.message.receive_v1` (text-only V1):
  - [x] DM policy + pairing store integration (mirror GoogleChat monitor behavior).
  - [x] Group policy allowlists + mention gating integration.
  - [x] Control command gating for group chats.
- [x] Build inbound context via `runtime.channel.reply.finalizeInboundContext` and dispatch replies via buffered dispatcher.

## 6. Outbound adapters

- [x] Implement `outbound.sendText` for `clawdbot message send` and heartbeats.

## 7. Status + probe

- [x] Implement `status` adapter snapshot + summary.
- [x] Implement `probeAccount` to validate credentials (token + bot info).

## 8. Onboarding

- [x] Add onboarding adapter with prompts for app id/secret and webhook settings.

## 9. Tests

- [x] Add unit tests for: signature, decrypt, target normalization.
- [ ] Add unit tests for: url_verification, event parsing.
