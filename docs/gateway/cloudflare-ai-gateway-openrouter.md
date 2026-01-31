# Cloudflare AI Gateway for OpenRouter

This note is a practical setup recipe for running OpenClaw with OpenRouter, while routing the actual LLM API calls through Cloudflare AI Gateway for observability (logs/metrics) and optional policy controls.

This assumes you already have OpenClaw running (for example via `docker-compose.yml`) and that OpenClaw is already using `openrouter/...` models.

## Goal

- Keep your OpenRouter model IDs (for example `openrouter/moonshotai/kimi-k2-thinking`).
- Change the OpenRouter API base URL from `https://openrouter.ai/api/v1` to the Cloudflare AI Gateway endpoint.
- Keep OpenClaw accessible only via your own access controls (for example Tailscale + SSH port forwarding).

## Cloudflare Setup (Dashboard)

1) In the Cloudflare dashboard, create an AI Gateway.

2) Create an OpenRouter provider endpoint in AI Gateway.

3) Copy the AI Gateway OpenRouter endpoint base URL (Cloudflare format):

```text
https://gateway.ai.cloudflare.com/v1/{account_id}/{gateway_id}/openrouter
```

Notes:
- Requests still use your OpenRouter API key via the normal `Authorization: Bearer ...` header (Cloudflare forwards to OpenRouter).
- If you enable Cloudflare "Authenticated Gateway", you will need to add Cloudflare's gateway auth header in addition to the OpenRouter key:
  - Header: `cf-aig-authorization: Bearer <token>`
  - In this repo's Docker setup, set `CLOUDFLARE_AIG_TOKEN` in `.env` and restart the gateway. OpenClaw injects the header at runtime so the token does not need to be written into `openclaw.json` or `models.json`.

## OpenClaw Setup (Route OpenRouter Through Cloudflare)

OpenClaw (via `pi-coding-agent`) can override a provider base URL without overriding its built-in model catalog by configuring the provider with an empty `models` array.

Set:
- `models.providers.openrouter.baseUrl` to the Cloudflare AI Gateway OpenRouter endpoint base URL you copied.
- `models.providers.openrouter.models` to `[]` (empty) so OpenClaw continues to use the built-in OpenRouter model list.

Implementation note:
- OpenClaw's OpenRouter integration uses OpenRouter's `.../api/v1/...` endpoints under the hood, so with the base URL above it will effectively hit:
  - `.../openrouter/chat/completions`
  - (not `.../openrouter/v1/...`)
  Cloudflare's own examples sometimes show `/openrouter/v1/...` for OpenAI-SDK-style clients.

Troubleshooting note:
- If Cloudflare returns 404s, try setting the base URL to include `/v1`:
  - `https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/openrouter/v1`

If you are using the Docker Compose setup in this repo, run these from the repo directory:

```bash
docker compose run --rm openclaw-cli config set --json models.providers.openrouter '{ baseUrl: "<CF_AI_GATEWAY_BASE_URL>", models: [] }'
docker compose restart openclaw-gateway
```

Example placeholder:

- `<CF_AI_GATEWAY_BASE_URL>` looks like:
  - `https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway_id>/openrouter`

## Verify

1) Confirm OpenClaw can still list and use OpenRouter models:

```bash
docker compose run --rm openclaw-cli models list --provider openrouter
```

2) Trigger a response (Control UI or WhatsApp) and verify:
   - OpenClaw still replies.
   - Cloudflare AI Gateway shows logged requests for the gateway.

Note:
- `openclaw models scan` currently fetches OpenRouter's `/models` directly from OpenRouter (it does not use the OpenAI-compatible chat completions base URL), so those scan requests may not appear in AI Gateway.

## Rollback

If anything behaves strangely (for example OpenRouter models disappear from `models list`), remove the override and restart:

```bash
docker compose run --rm openclaw-cli config unset models.providers.openrouter
docker compose restart openclaw-gateway
```

## Related OpenClaw Docs

- Models: /concepts/models
- Config CLI: /cli/config
- Gateway troubleshooting: /gateway/troubleshooting
