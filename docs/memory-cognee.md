---
summary: "Cognee memory quick setup and usage"
read_when:
  - Setting up Cognee memory provider
  - Configuring knowledge graph memory
---

# Cognee Memory Provider

Moltbot supports [Cognee](https://www.cognee.ai/) - [open source AI memory](https://github.com/topoteretes/cognee) - as an optional memory provider. Cognee builds knowledge graph memory backed by embeddings from any data and can be run locally with Docker. Learn more from [Cognee Documentation](https://docs.cognee.ai/).

## Quickstart with Docker

Run the example compose file:

```bash
docker compose -f examples/cognee-docker-compose.yaml up -d
```
Verify:

```bash
curl http://localhost:8000/health
```

## Configuration

Put the token in `~/.clawdbot/.env`:

```bash
COGNEE_API_KEY="your-cognee-access-token"
CLAWDBOT_GATEWAY_TOKEN="your-random-gateway-token"
```

Configure `~/.clawdbot/moltbot.json` (JSON5):

```json5
{
  agents: {
    defaults: {
      memorySearch: {
        enabled: true,
        provider: "cognee",
        sources: ["memory", "sessions"],
        experimental: { sessionMemory: true },
        cognee: {
          baseUrl: "http://localhost:8000",
          apiKey: "${COGNEE_API_KEY}",
          datasetName: "clawdbot",
          searchType: "GRAPH_COMPLETION",
          maxResults: 6,
          autoCognify: true,
          timeoutSeconds: 180
        }
      }
    }
  }
}
```

Start the gateway with env loaded:

```zsh
set -a; source "$HOME/.clawdbot/.env"; set +a
pnpm moltbot gateway --port 18789 --token "$CLAWDBOT_GATEWAY_TOKEN" --verbose
```

## Usage

Cognee indexes `MEMORY.md` in workspace root, `memory/*.md`, and session transcripts when `sources: ["sessions"]` is enabled.

1. Initial index and status:

```bash
pnpm moltbot memory status --index --json
```

2. Memory updates:

```bash
pnpm moltbot memory status --index --update-cognee --json
```

## Troubleshooting

- Connection test: `curl http://localhost:8000/health`
- Reset cached values that Moltbot reuses: `mv "$HOME/.clawdbot/memory/cognee/main.json" "$HOME/.clawdbot/memory/cognee/main.json.bak"`