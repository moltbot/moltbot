#!/usr/bin/env bash
# Simple watchdog to keep Ollama running and log exits for debugging.
# Place in your shell's background (nohup ./scripts/watch-ollama.sh &)
set -euo pipefail
LOG="/tmp/ollama-watch.log"
echo "$(date -Is) WATCH START" >> "$LOG"
BACKOFF=1
while true; do
  echo "$(date -Is) starting ollama serve (debug logging ON)" >> "$LOG"
  # Wait for port 11434 to be free before starting to avoid bind race
  WAIT=0
  while ss -ltnp 2>/dev/null | grep -q "127.0.0.1:11434"; do
    if [ "$WAIT" -ge 60 ]; then
      echo "$(date -Is) port 11434 still in use after ${WAIT}s; attempting anyway" >> "$LOG"
      break
    fi
    echo "$(date -Is) port 11434 in use; waiting... (${WAIT}s)" >> "$LOG"
    sleep 1
    WAIT=$((WAIT+1))
  done

  OLLAMA_DEBUG=1 OLLAMA_KEEP_ALIVE=30m OLLAMA_LOAD_TIMEOUT=10m ollama serve >> /tmp/ollama.log 2>&1 || true
  EXIT=$?
  echo "$(date -Is) ollama exited with code $EXIT" >> "$LOG"
  echo "$(date -Is) tail of last 40 lines of /tmp/ollama.log:" >> "$LOG"
  tail -n 40 /tmp/ollama.log >> "$LOG" 2>&1 || true
  echo "$(date -Is) will restart in ${BACKOFF}s" >> "$LOG"
  sleep "$BACKOFF"
  BACKOFF=$((BACKOFF * 2))
  if [ "$BACKOFF" -gt 300 ]; then
    BACKOFF=300
  fi
done
