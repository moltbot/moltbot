---
summary: "Sign in to GitHub Copilot from Moltbot using the device flow"
read_when:
  - You want to use GitHub Copilot as a model provider
  - You need the `moltbot models auth login-github-copilot` flow
  - You want to use the Copilot CLI as a backend
---
# Github Copilot

## What is GitHub Copilot?

GitHub Copilot is GitHub's AI coding assistant. It provides access to Copilot
models for your GitHub account and plan. Moltbot can use Copilot as a model
provider in three different ways.

## Three ways to use Copilot in Moltbot

### 1) Built-in GitHub Copilot provider (`github-copilot`)

Use the native device-login flow to obtain a GitHub token, then exchange it for
Copilot API tokens when Moltbot runs. This is the **default** and simplest path
because it does not require VS Code.

### 2) Copilot CLI backend (`copilot-cli`)

Use the official [GitHub Copilot CLI](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line)
as a CLI backend via the `@github/copilot-sdk`. This provides access to Copilot's
coding agent capabilities with tool execution and session persistence.

Prerequisites:
- Install the Copilot CLI: `npm install -g @github/copilot`
- Authenticate: `copilot auth login`

### 3) Copilot Proxy plugin (`copilot-proxy`)

Use the **Copilot Proxy** VS Code extension as a local bridge. Moltbot talks to
the proxy’s `/v1` endpoint and uses the model list you configure there. Choose
this when you already run Copilot Proxy in VS Code or need to route through it.
You must enable the plugin and keep the VS Code extension running.

Use GitHub Copilot as a model provider (`github-copilot`). The login command runs
the GitHub device flow, saves an auth profile, and updates your config to use that
profile.

## CLI setup

```bash
moltbot models auth login-github-copilot
```

You'll be prompted to visit a URL and enter a one-time code. Keep the terminal
open until it completes.

### Optional flags

```bash
moltbot models auth login-github-copilot --profile-id github-copilot:work
moltbot models auth login-github-copilot --yes
```

## Set a default model

```bash
moltbot models set github-copilot/gpt-4o
```

### Config snippet

```json5
{
  agents: { defaults: { model: { primary: "github-copilot/gpt-4o" } } }
}
```

## Notes

- Requires an interactive TTY; run it directly in a terminal.
- Copilot model availability depends on your plan; if a model is rejected, try
  another ID (for example `github-copilot/gpt-4.1`).
- The login stores a GitHub token in the auth profile store and exchanges it for a
  Copilot API token when Moltbot runs.

## Copilot CLI backend configuration

To use the Copilot CLI as a backend (instead of the API), configure it in your
`moltbot.config.json`:

```json5
{
  agents: {
    defaults: {
      model: { primary: "copilot-cli/gpt-4.1" },
      cliBackends: {
        "copilot-cli": {
          command: "copilot",
          // Optional: customize the CLI path
          // command: "/usr/local/bin/copilot"
        }
      }
    }
  }
}
```

### Available models via Copilot CLI

The Copilot CLI supports the following models (availability depends on your plan):

- `gpt-5`
- `gpt-4.1`
- `gpt-4.1-mini`
- `gpt-4.1-nano`
- `gpt-4o`
- `o1`
- `o1-mini`
- `o3-mini`
- `claude-sonnet-4.5`
- `claude-sonnet-4`

The Copilot CLI backend uses the `@github/copilot-sdk` for programmatic control
of the CLI via JSON-RPC.
