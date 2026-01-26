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
- [x] Add unit tests for: url_verification, event parsing.
