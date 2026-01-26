---
summary: "Zoho Cliq setup via OAuth API"
read_when:
  - Setting up Zoho Cliq
  - Debugging Zoho Cliq routing
---

# Zoho Cliq (plugin)

Status: supported via plugin (OAuth API). Direct messages, group chats, and channels are supported.
Zoho Cliq is a team communication platform from Zoho; see the official site at
[zoho.com/cliq](https://www.zoho.com/cliq/) for product details.

## Plugin required
Zoho Cliq ships as a plugin and is not bundled with the core install.

Install via CLI (npm registry):
```bash
clawdbot plugins install @clawdbot/zoho-cliq
```

Local checkout (when running from a git repo):
```bash
clawdbot plugins install ./extensions/zoho-cliq
```

If you choose Zoho Cliq during configure/onboarding and a git checkout is detected,
Clawdbot will offer the local install path automatically.

Details: [Plugins](/plugin)

## Quick setup

### 1. Create OAuth Application
1. Go to [Zoho API Console](https://accounts.zoho.com/developerconsole)
2. Click **Add Client** → **Server-based Applications**
3. Fill in:
   - **Client Name**: Clawdbot
   - **Homepage URL**: https://clawd.bot (or your domain)
   - **Authorized Redirect URI**: `https://accounts.zoho.com` (for manual token generation)
4. Copy the **Client ID** and **Client Secret**

### 2. Generate Refresh Token
1. Open this URL in your browser (replace `YOUR_CLIENT_ID`):
   ```
   https://accounts.zoho.com/oauth/v2/auth?scope=ZohoCliq.Messages.ALL,ZohoCliq.Chats.ALL,ZohoCliq.Users.READ&client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=https://accounts.zoho.com&access_type=offline
   ```
2. Authorize the application
3. Copy the `code` parameter from the redirect URL
4. Exchange for tokens via curl:
   ```bash
   curl -X POST "https://accounts.zoho.com/oauth/v2/token" \
     -d "grant_type=authorization_code" \
     -d "client_id=YOUR_CLIENT_ID" \
     -d "client_secret=YOUR_CLIENT_SECRET" \
     -d "code=YOUR_AUTH_CODE" \
     -d "redirect_uri=https://accounts.zoho.com"
   ```
5. Copy the **refresh_token** from the response

### 3. Configure Clawdbot
```json5
{
  channels: {
    "zoho-cliq": {
      enabled: true,
      accounts: {
        main: {
          clientId: "1000.XXXXX",
          clientSecret: "your-client-secret",
          refreshToken: "1000.xxxxx.xxxxx",
          dc: "US"
        }
      }
    }
  }
}
```

### 4. Start the gateway
```bash
clawdbot gateway run
```

## Data centers
Zoho operates in multiple data centers. Set `dc` to match your Zoho account region:

| Region | dc | API Domain |
|--------|------|------------|
| United States | `US` | cliq.zoho.com |
| Europe | `EU` | cliq.zoho.eu |
| India | `IN` | cliq.zoho.in |
| Australia | `AU` | cliq.zoho.com.au |
| Japan | `JP` | cliq.zoho.jp |
| Canada | `CA` | cliq.zohocloud.ca |
| Saudi Arabia | `SA` | cliq.zoho.sa |

Default is `US` if not specified.

## Environment variables (default account)
Set these on the gateway host if you prefer env vars:

- `ZOHO_CLIQ_CLIENT_ID=...`
- `ZOHO_CLIQ_CLIENT_SECRET=...`
- `ZOHO_CLIQ_REFRESH_TOKEN=...`
- `ZOHO_CLIQ_DC=US`

Env vars apply only to the **default** account. Other accounts must use config values.

## OAuth scopes required
The following scopes are needed for full functionality:

- `ZohoCliq.Messages.ALL` - Read and send messages
- `ZohoCliq.Chats.ALL` - Access chat conversations
- `ZohoCliq.Users.READ` - Read user information

## Access control (DMs)
- Default: `channels.zoho-cliq.dmPolicy = "pairing"` (unknown senders get a pairing code).
- Approve via:
  - `clawdbot pairing list zoho-cliq`
  - `clawdbot pairing approve zoho-cliq <CODE>`
- Public DMs: `channels.zoho-cliq.dmPolicy="open"` plus `channels.zoho-cliq.allowFrom=["*"]`.
- Allowlist: `channels.zoho-cliq.dmPolicy="allowlist"` with specific user emails in `allowFrom`.

## Targets for outbound delivery
Use these target formats with `clawdbot message send` or cron/webhooks:

- `chat:<chat_id>` - Send to a specific chat by ID
- `channel:<unique_name>` - Send to a channel by its unique name
- `user:<email>` - Send DM to a user by email
- `user:<zuid>` - Send DM to a user by Zoho User ID
- `@email@example.com` - Send DM (shorthand)

Examples:
```bash
clawdbot message send --channel zoho-cliq --to "user:john@example.com" --text "Hello!"
clawdbot message send --channel zoho-cliq --to "channel:engineering" --text "Update deployed"
```

## Multi-account
Zoho Cliq supports multiple accounts under `channels.zoho-cliq.accounts`:

```json5
{
  channels: {
    "zoho-cliq": {
      accounts: {
        default: {
          name: "Primary",
          clientId: "...",
          clientSecret: "...",
          refreshToken: "...",
          dc: "US"
        },
        eu_team: {
          name: "EU Team",
          clientId: "...",
          clientSecret: "...",
          refreshToken: "...",
          dc: "EU"
        }
      }
    }
  }
}
```

## Message polling
Zoho Cliq uses polling to check for new messages (default: every 3 seconds). This is due to API limitations - Zoho Cliq's webhook support requires bot registration in their platform.

## Troubleshooting

### Auth errors
- **"invalid_code"**: Authorization code expired (valid for ~1 minute). Generate a new one.
- **"invalid_client"**: Check client ID and secret match your OAuth app.
- **Token refresh failed**: Ensure refresh token is valid and hasn't been revoked.

### No messages received
- Polling runs every 3 seconds; there may be a slight delay.
- Check `clawdbot channels status --probe` to verify connection.
- Ensure the OAuth app has the required scopes.

### Wrong data center
- If you get 404 errors, your `dc` setting may not match your Zoho account region.
- Check your Zoho account URL (e.g., accounts.zoho.eu = EU datacenter).

### Rate limits
Zoho Cliq has API rate limits:
- Messages: 50 requests/min per user
- Chats: 30 requests/min per user

If you hit limits, reduce polling frequency or message volume.
