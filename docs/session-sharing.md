# Cross-Provider Session Sharing

## Overview

The session sharing feature allows users to link multiple messaging provider identities (e.g., WhatsApp phone number and Telegram user ID) to share a single Claude conversation session. This enables seamless conversation continuity across different platforms.

## Supported Providers

- **WhatsApp** (via wa-web provider)
- **Telegram**
- **Twilio** (SMS/WhatsApp via Twilio API)

## How It Works

### Without Identity Mapping (Default)

By default, each provider maintains separate Claude sessions:

- WhatsApp messages from `+1234567890` → session: `+1234567890`
- Telegram messages from user `@john` → session: `telegram:@john`
- Each provider has its own isolated conversation history

### With Identity Mapping

When identities are linked, they share the same Claude session:

```bash
# Link WhatsApp and Telegram identities
warelay identity link --whatsapp +1234567890 --telegram @john --name "John Doe"

# Now both providers share session: shared-abc-123
# WhatsApp from +1234567890 → session: shared-abc-123
# Telegram from @john → session: shared-abc-123
```

Messages from either provider will continue the same conversation.

## Architecture

### Identity Mapping Storage

Identity mappings are stored in `~/.clawdis/identity-map.json`:

```json
{
  "version": 1,
  "mappings": {
    "shared-abc-123": {
      "id": "shared-abc-123",
      "name": "John Doe",
      "identities": {
        "whatsapp": "+1234567890",
        "telegram": "@john"
      },
      "createdAt": "2024-01-01T00:00:00Z",
      "updatedAt": "2024-01-01T00:00:00Z"
    }
  }
}
```

### Session ID Normalization

The `normalizeSessionId()` function in `src/identity/normalize.ts` handles the mapping:

```typescript
// Without mapping
normalizeSessionId("telegram", "123456") → "telegram:123456"
normalizeSessionId("whatsapp", "+1234") → "+1234"

// With mapping (both return the same shared ID)
normalizeSessionId("telegram", "123456") → "shared-abc-123"
normalizeSessionId("whatsapp", "+1234") → "shared-abc-123"
```

### Integration Points

Session normalization is integrated at the `deriveSessionKey()` level in `src/config/sessions.ts`, which means:

- All auto-reply systems automatically use the normalized session IDs
- Session storage (`~/.clawdis/sessions.json`) uses normalized IDs
- No changes needed in individual provider implementations

## Provider ID Formats

### Telegram
- **Username format**: `@username` (e.g., `@john`)
- **User ID format**: `123456789` (numeric)
- **Normalized without mapping**: `telegram:@username` or `telegram:123456789`

### WhatsApp (wa-web)
- **Format**: E.164 phone number (e.g., `+1234567890`)
- **Normalized without mapping**: `+1234567890` (phone number directly)

### Twilio
- **Format**: E.164 phone number (e.g., `+1234567890`)
- **Normalized without mapping**: `+1234567890` (phone number directly)

## CLI Commands

The following commands are available for managing identity mappings:

### Link Identities

```bash
warelay identity link --whatsapp +1234567890 --telegram @john --name "John"
```

Links multiple provider identities to share a single Claude session. At least two providers must be specified.

**Options:**
- `--whatsapp <phone>` - WhatsApp phone number in E.164 format
- `--telegram <user>` - Telegram username (@username) or numeric user ID
- `--twilio <phone>` - Twilio phone number in E.164 format
- `--name <name>` - Optional display name for the mapping

### List All Mappings

```bash
warelay identity list [--json]
```

Shows all identity mappings with their linked providers and timestamps. Use `--json` for machine-readable output.

### Show Mapping Details

```bash
warelay identity show <shared-id> [--json]
```

Displays detailed information about a specific identity mapping.

### Unlink Identities

```bash
warelay identity unlink <shared-id>
```

Removes an identity mapping. After unlinking, each provider will have its own separate Claude session again.

## Use Cases

### 1. Multi-Device Access
Link your personal WhatsApp and Telegram accounts to maintain conversation continuity:
- Start conversation on WhatsApp during work hours
- Continue same conversation on Telegram while commuting
- Claude remembers full context from both platforms

### 2. Family/Team Sharing
Link multiple family members' or team members' accounts to share a Claude assistant:
- Mom's WhatsApp: `+1234567890`
- Dad's Telegram: `@dad_username`
- Both access the same family assistant with shared context

### 3. Migration Scenarios
Smoothly migrate from one platform to another:
- Link old and new accounts before migration
- Conversation history preserved during transition
- Unlink old account after migration complete

## Implementation Details

### Provider Detection

The `detectProvider()` function in `src/config/sessions.ts` determines the provider from the ID format:

```typescript
function detectProvider(from: string): "whatsapp" | "telegram" | "twilio" {
  // Telegram: "telegram:123" or "@username"
  if (from.startsWith("telegram:") || from.startsWith("@")) {
    return "telegram";
  }
  // WhatsApp/Twilio: E.164 phone numbers
  return "whatsapp";
}
```

### Async Session Key Derivation

Session key derivation is now async to support identity lookup:

```typescript
// Before (synchronous)
const key = deriveSessionKey(scope, ctx);

// After (asynchronous)
const key = await deriveSessionKey(scope, ctx);
```

All callers have been updated to handle the async nature:
- `src/auto-reply/reply.ts` - Auto-reply system
- `src/commands/agent.ts` - Agent command
- `src/web/auto-reply.ts` - Web provider auto-reply

### Group Conversations

Identity mapping does NOT apply to group conversations. Groups maintain separate session keys to avoid mixing group and individual conversation contexts:

```typescript
// Group conversations always use group JID as session key
if (ctx.From.includes("@g.us")) {
  return `group:${ctx.From}`; // No normalization
}
```

## Testing

Comprehensive test coverage in `src/identity/`:

- **`normalize.test.ts`** (11 tests): Session ID normalization logic
- **`storage.test.ts`** (18 tests): Identity map persistence and operations

Run tests:
```bash
pnpm test src/identity
```

## Backwards Compatibility

The feature is fully backwards compatible:

- **No mapping = no change**: Without identity mappings, behavior is identical to before
- **Existing sessions preserved**: Old session IDs continue to work
- **Opt-in feature**: Users must explicitly create mappings to enable sharing

## Security Considerations

- Identity mappings are stored locally in `~/.clawdis/`
- No server-side synchronization (privacy-first design)
- Users have full control over which identities are linked
- Unlinking is immediate and removes all associations

## Future Enhancements

1. **Web UI**: Admin interface for managing identity mappings
2. **Auto-discovery**: Suggest linking when same phone number detected across providers
3. **Audit Log**: Track when identities were linked/unlinked
4. **Export/Import**: Backup and restore identity mappings
5. **CLI Tests**: Add comprehensive E2E tests for all CLI commands

## Troubleshooting

### Sessions not sharing after linking

1. Check if mapping was created: `cat ~/.clawdis/identity-map.json`
2. Verify provider IDs match exactly (case-sensitive for Telegram usernames)
3. Restart the relay to pick up new mappings

### Wrong identity format

- WhatsApp/Twilio: Must use E.164 format with `+` prefix (e.g., `+1234567890`)
- Telegram usernames: Must include `@` prefix (e.g., `@john`)
- Telegram user IDs: Numeric only (e.g., `123456789`)

### How to reset

Delete the identity map file:
```bash
rm ~/.clawdis/identity-map.json
```

Sessions will revert to provider-specific IDs on next message.
