---
summary: "Sign in to GitHub Copilot from OpenClaw using the device flow"
read_when:
  - You want to use GitHub Copilot as a model provider
  - You need the `openclaw models auth login-github-copilot` flow
---
# GitHub Copilot

## What is GitHub Copilot?

GitHub Copilot is GitHub's AI coding assistant. It provides access to Copilot
models for your GitHub account and plan. OpenClaw can use Copilot as a model
provider via the official GitHub Copilot SDK. OpenClaw uses the GitHub device
flow to obtain a GitHub token and exchanges it for Copilot API tokens at runtime.
This is the recommended and supported path for integrating Copilot with
OpenClaw.

Use GitHub Copilot as a model provider (`github-copilot`). The login command runs
the GitHub device flow, saves an auth profile, and updates your config to use
that profile.

## CLI setup

Run the OpenClaw login flow to create an auth profile:

```bash
openclaw models auth login-github-copilot
```

This creates an auth profile and (optionally) updates your config to use it.

### Optional flags

```bash
openclaw models auth login-github-copilot --profile-id github-copilot:work
openclaw models auth login-github-copilot --yes
```

## Set a default model

```bash
openclaw models set github-copilot/gpt-4o
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
  Copilot API token when OpenClaw runs.
