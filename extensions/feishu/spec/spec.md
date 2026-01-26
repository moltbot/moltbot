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
