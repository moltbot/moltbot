#!/bin/bash
# Phala Cloud CVM entrypoint - auto-configures Redpill provider on first boot

set -e

CONFIG_DIR="${CLAWDBOT_STATE_DIR:-/home/node/.clawdbot}"
CONFIG_FILE="$CONFIG_DIR/clawdbot.json"

# Create state directory if it doesn't exist
mkdir -p "$CONFIG_DIR"

# Build gateway auth arguments
GATEWAY_AUTH_ARGS=""
if [ "${GATEWAY_AUTH:-off}" = "token" ]; then
  if [ -z "$GATEWAY_TOKEN" ]; then
    # Generate a random token if not provided
    GATEWAY_TOKEN=$(head -c 32 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 32)
    echo "Generated gateway token: $GATEWAY_TOKEN"
  fi
  GATEWAY_AUTH_ARGS="--gateway-auth token --gateway-token $GATEWAY_TOKEN"
elif [ "${GATEWAY_AUTH:-off}" = "password" ]; then
  if [ -z "$GATEWAY_PASSWORD" ]; then
    echo "Error: GATEWAY_AUTH=password requires GATEWAY_PASSWORD to be set"
    exit 1
  fi
  GATEWAY_AUTH_ARGS="--gateway-auth password --gateway-password $GATEWAY_PASSWORD"
else
  GATEWAY_AUTH_ARGS="--gateway-auth off"
fi

# Check if we need to run initial setup
if [ ! -f "$CONFIG_FILE" ] && [ -n "$REDPILL_API_KEY" ]; then
  echo "First boot detected with REDPILL_API_KEY - running auto-configuration..."

  # shellcheck disable=SC2086
  node dist/index.js onboard \
    --non-interactive \
    --accept-risk \
    --mode local \
    --auth-choice redpill-api-key \
    --workspace "${CLAWDBOT_WORKSPACE_DIR:-/home/node/clawd}" \
    --gateway-bind ${GATEWAY_BIND:-loopback} \
    $GATEWAY_AUTH_ARGS \
    --skip-daemon \
    --skip-skills \
    --skip-health \
    --skip-ui

  echo "Auto-configuration complete."

  # Enable password/token-only auth for remote Control UI access
  # This allows the web UI to connect without device pairing (Web Crypto API)
  # which is required for HTTPS proxy deployments like Phala dstack
  node dist/index.js config set gateway.controlUi.allowInsecureAuth true --json
  echo "✓ Control UI configured for remote access"

  # Configure channel allowlists if user IDs are provided
  if [ -n "$TELEGRAM_ALLOWED_USERS" ] || [ -n "$DISCORD_ALLOWED_USERS" ]; then
    echo "Configuring channel allowlists..."

    if [ -n "$TELEGRAM_ALLOWED_USERS" ]; then
      # Convert comma-separated list to JSON array
      TELEGRAM_IDS=$(echo "$TELEGRAM_ALLOWED_USERS" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/')
      node dist/index.js config set channels.telegram.dmPolicy allowlist || true
      node dist/index.js config set "channels.telegram.allowFrom" "[$TELEGRAM_IDS]" --json || true
      echo "✓ Telegram allowlist configured: $TELEGRAM_ALLOWED_USERS"
    fi

    if [ -n "$DISCORD_ALLOWED_USERS" ]; then
      # Convert comma-separated list to JSON array
      DISCORD_IDS=$(echo "$DISCORD_ALLOWED_USERS" | sed 's/,/", "/g' | sed 's/^/"/' | sed 's/$/"/')
      node dist/index.js config set channels.discord.dm.policy allowlist || true
      node dist/index.js config set "channels.discord.dm.allowFrom" "[$DISCORD_IDS]" --json || true
      echo "✓ Discord allowlist configured: $DISCORD_ALLOWED_USERS"
    fi
  fi

  echo "Starting gateway..."
fi

# Clean orphaned session locks from previous gateway restarts
# Gateway SIGUSR1 restart keeps PID=1 but clears in-memory lock state,
# leaving lock files that appear valid but are actually orphaned.
SESSIONS_DIR="$CONFIG_DIR/agents/main/sessions"
if [ -d "$SESSIONS_DIR" ]; then
  LOCK_COUNT=$(find "$SESSIONS_DIR" -name "*.lock" -type f 2>/dev/null | wc -l)
  if [ "$LOCK_COUNT" -gt 0 ]; then
    echo "Cleaning $LOCK_COUNT orphaned session lock(s)..."
    find "$SESSIONS_DIR" -name "*.lock" -type f -delete 2>/dev/null || true
  fi
fi

# Start the gateway
exec node dist/index.js gateway \
  --bind ${GATEWAY_BIND:-loopback} \
  --port "${GATEWAY_PORT:-18789}" \
  --allow-unconfigured
