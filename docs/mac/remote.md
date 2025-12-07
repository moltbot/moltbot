# Remote Clawd mode (Dec 2025)

## What it is
- Run the Clawdis relay on another machine (Linux/macOS) reachable over SSH while the macOS app keeps TCC, notifications, and UI.
- You can toggle Local vs Remote in **Settings → General → Clawdis runs**; remote adds fields for SSH target, identity file, and project root.
- We recommend running a Tailscale node on both sides so the target is reachable even off-LAN.

## Requirements
- SSH access with public-key auth (`BatchMode=yes`); set `user@host[:port]` and an identity file.
- The remote host must have a working `clawdis` install in the project root you specify.
- `clawdis-mac` is still used for permissioned actions; the CLI path is auto-discovered on the remote via `command -v` + common prefixes.

## How it works
- The app builds commands through the new runner:
  - `clawdis status/health/agent/relay` are wrapped in `ssh … /bin/sh -c '<cd project && clawdis …>'` with CLI path lookup.
  - `clawdis rpc` is tunneled over a long-lived SSH process so web chat and the app’s Agent tab stay responsive.
- Local TCC flows remain unchanged; if the remote agent needs local permissions, it should SSH back here and invoke `clawdis-mac …` (same CLI surface).

## Setup steps
1) Open **Settings → General → Clawdis runs** and pick **Remote over SSH**.
2) Fill **SSH target**, **Identity file**, and **Project root** (where `clawdis` lives on the remote).
3) Click **Test remote**; it runs `clawdis status --json` remotely and caches the resolved CLI path.
4) Run onboarding’s WhatsApp login step on the machine where the relay will run (remote if remote mode is enabled).

## Notes
- Connection strings accept `user@host:port`; leading `ssh ` is stripped if pasted from a shell snippet.
- Project root defaults to the path you enter; if blank, no `cd` is issued before the relay command.
- The remote log path remains `/tmp/clawdis/clawdis.log`; view it via SSH if you need details.
- If you switch back to Local, existing remote state is left untouched; re-run Test remote when switching again.
