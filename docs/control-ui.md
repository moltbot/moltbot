---
summary: "Browser-based control UI for the Gateway (chat, nodes, config)"
read_when:
  - You want to operate the Gateway from a browser
  - You want Tailnet access without SSH tunnels
---
# Control UI (browser)

The Control UI is a small **Vite + Lit** single-page app served by the Gateway under:

- `http://<host>:18789/`

It speaks **directly to the Gateway WebSocket** on the same port.

## What it can do (today)
- Chat with the model via Gateway WS (`chat.history`, `chat.send`, `chat.abort`)
- List nodes via Gateway WS (`node.list`)
- View/edit `~/.clawdis/clawdis.json` via Gateway WS (`config.get`, `config.set`)

## Tailnet access (recommended)

Expose the Gateway on your Tailscale interface and require a token:

```bash
clawdis gateway --bind tailnet --token "$(openssl rand -hex 32)"
```

Then open:

- `http://<tailscale-ip>:18789/ui/`

Paste the token into the UI settings (it’s sent as `connect.params.auth.token`).

## Building the UI

The Gateway serves static files from `dist/control-ui`. Build them with:

```bash
pnpm ui:install
pnpm ui:build
```

For local development (separate dev server):

```bash
pnpm ui:install
pnpm ui:dev
```

Then point the UI at your Gateway WS URL (e.g. `ws://127.0.0.1:18789`).
