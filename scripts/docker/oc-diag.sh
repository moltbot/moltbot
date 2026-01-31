#!/usr/bin/env bash
set -euo pipefail

# Quick OpenClaw Docker health/diagnostics bundle.
# Run from the repo root (where docker-compose.yml lives).

compose() {
  docker compose "$@"
}

echo "==> docker compose ps"
compose ps
echo

echo "==> gateway logs (tail 200)"
compose logs --tail=200 openclaw-gateway || true
echo

echo "==> gateway health"
compose exec -T openclaw-gateway node dist/index.js health
echo

echo "==> channels status --probe"
compose exec -T openclaw-gateway node dist/index.js channels status --probe
echo

echo "==> openrouter provider override (config)"
compose run --rm openclaw-cli config get models.providers.openrouter --json || true
echo

echo "==> CLOUDFLARE_AIG_TOKEN present? (length only)"
compose exec -T openclaw-gateway bash -lc 'if [ -n "${CLOUDFLARE_AIG_TOKEN:-}" ]; then echo "CLOUDFLARE_AIG_TOKEN=set len=${#CLOUDFLARE_AIG_TOKEN}"; else echo "CLOUDFLARE_AIG_TOKEN=missing"; fi'
