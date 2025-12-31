#!/bin/bash
# Clawdis Gateway Watchdog Script
# Run via cron: */5 * * * * /home/almaz/zoo_flow/clawdis/scripts/watchdog.sh
#
# This script checks if the gateway is healthy and restarts it if not.
# It also handles log rotation and cleanup.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="/home/almaz/.clawdis"
MAX_LOG_SIZE_MB=100
MAX_LOG_AGE_DAYS=7
LOCK_FILE="/tmp/clawdis-watchdog.lock"
WATCHDOG_LOG="$LOG_DIR/watchdog.log"

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$WATCHDOG_LOG"
}

# Prevent concurrent runs
if [ -f "$LOCK_FILE" ]; then
    pid=$(cat "$LOCK_FILE" 2>/dev/null)
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
        exit 0
    fi
fi
echo $$ > "$LOCK_FILE"
trap "rm -f $LOCK_FILE" EXIT

# Ensure log directory exists
mkdir -p "$LOG_DIR"

load_env() {
    set +u
    if [ -f "/home/almaz/zoo_flow/clawdis/.env" ]; then
        set -a
        source /home/almaz/zoo_flow/clawdis/.env
        set +a
    fi
    if [ -f "/home/almaz/.clawdis/secrets.env" ]; then
        set -a
        source /home/almaz/.clawdis/secrets.env
        set +a
    fi
    set -u
}

get_telegram_proxy() {
    local proxy=""
    if command -v python3 >/dev/null 2>&1; then
        proxy=$(python3 - <<'PY' 2>/dev/null
import json, os, sys
path = os.path.expanduser("~/.clawdis/clawdis.json")
try:
    with open(path, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    proxy = cfg.get("telegram", {}).get("proxy") or ""
    if isinstance(proxy, str):
        sys.stdout.write(proxy)
except Exception:
    pass
PY
)
    elif command -v node >/dev/null 2>&1; then
        proxy=$(node - <<'NODE' 2>/dev/null
const fs = require("fs");
const path = require("path");
try {
  const cfgPath = path.join(process.env.HOME || "", ".clawdis", "clawdis.json");
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  const proxy = (cfg.telegram && cfg.telegram.proxy) || "";
  if (typeof proxy === "string") process.stdout.write(proxy);
} catch {}
NODE
)
    fi
    echo "$proxy"
}

# Log rotation
rotate_logs() {
    for logfile in "$LOG_DIR"/*.log; do
        [ -f "$logfile" ] || continue

        # Check size (in MB)
        size=$(du -m "$logfile" 2>/dev/null | cut -f1)
        if [ "${size:-0}" -gt "$MAX_LOG_SIZE_MB" ]; then
            log "Rotating $logfile (${size}MB > ${MAX_LOG_SIZE_MB}MB)"
            mv "$logfile" "${logfile}.$(date +%Y%m%d-%H%M%S)"
            touch "$logfile"
        fi
    done

    # Clean old rotated logs
    find "$LOG_DIR" -name "*.log.*" -mtime +$MAX_LOG_AGE_DAYS -delete 2>/dev/null || true
}

# Health check
check_health() {
    local output=""
    output=$("$SCRIPT_DIR/health-check.sh" --json 2>/dev/null || true)
    if echo "$output" | grep -q '"healthy": true'; then
        return 0
    else
        if [ -n "$output" ]; then
            log "Health details: $(echo "$output" | tr '\n' ' ')"
        else
            log "Health details: (no output from health-check)"
        fi
        return 1
    fi
}

# Network health check - verify proxy connections
check_network() {
    # Check if we have ESTABLISHED connections to proxy
    if ss -tnp 2>/dev/null | grep -q "ESTAB.*103.99.54.122"; then
        return 0
    fi

    # Check if we have stuck SYN-SENT to Telegram (bad)
    if ss -tnp 2>/dev/null | grep -q "SYN-SENT.*149.154"; then
        log "WARNING: SYN-SENT to Telegram detected - proxy may not be working"
        return 1
    fi

    return 0
}

# Check Telegram API health
check_telegram() {
    load_env

    if [ -z "${TELEGRAM_BOT_TOKEN:-}" ]; then
        return 1
    fi

    local proxy
    local -a proxy_args=()
    proxy=$(get_telegram_proxy)
    if [ -n "$proxy" ]; then
        proxy_args=(--proxy "$proxy")
    fi

    # Check pending updates
    pending=$(curl -s --max-time 10 "${proxy_args[@]}" "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo" 2>/dev/null | grep -o '"pending_update_count":[0-9]*' | cut -d: -f2)

    if [ "${pending:-0}" -gt 10 ]; then
        log "WARNING: $pending pending Telegram updates - bot may be stuck"
        return 1
    fi

    return 0
}

# Restart service
restart_service() {
    log "Attempting to restart clawdis-gateway service..."

    # Try systemctl first
    if command -v systemctl &> /dev/null; then
        if sudo -n systemctl restart clawdis-gateway 2>/dev/null; then
            log "Service restarted via systemctl"
            return 0
        fi
    fi

    # Fallback: kill and restart manually
    log "Systemctl failed, attempting manual restart..."
    pkill -f "clawdis gateway" 2>/dev/null || true
    sleep 2

    # Start in background
    cd /home/almaz/zoo_flow/clawdis
    source .env 2>/dev/null || true
    nohup "$SCRIPT_DIR/start-gateway.sh" >> "$LOG_DIR/gateway.log" 2>> "$LOG_DIR/gateway-error.log" &

    sleep 5
    if check_health; then
        log "Manual restart successful"
        return 0
    else
        log "Manual restart failed"
        return 1
    fi
}

# Main logic
main() {
    rotate_logs

    local needs_restart=false
    local reason=""

    # Check 1: Basic health (process, ports)
    if ! check_health; then
        needs_restart=true
        reason="process/port health check failed"
    fi

    # Check 2: Network health (proxy connections)
    if ! check_network; then
        needs_restart=true
        reason="network health check failed (proxy issue)"
    fi

    # Check 3: Telegram API health (pending updates)
    if ! check_telegram; then
        needs_restart=true
        reason="Telegram health check failed (stuck updates)"
    fi

    if [ "$needs_restart" = false ]; then
        # Healthy - just log periodically (every hour)
        if [ "$(date +%M)" = "00" ]; then
            log "Health check: OK (process, network, telegram all healthy)"
        fi
    else
        log "Health check: FAILED - $reason - initiating restart"

        # Wait a bit and check again (might be temporary)
        sleep 10

        if check_health && check_network; then
            log "Health recovered without intervention"
        else
            restart_service

            # Verify restart worked
            sleep 10
            if check_health && check_network; then
                log "Restart successful - all checks passing"
            else
                log "ERROR: Restart did not fix issue - manual intervention required"
            fi
        fi
    fi
}

main "$@"
