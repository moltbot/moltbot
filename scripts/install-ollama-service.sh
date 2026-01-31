#!/usr/bin/env bash
# Installs the systemd unit for Ollama. Run as root or with sudo to install system-wide.
set -euo pipefail
UNIT_SRC="$(pwd)/scripts/units/ollama.service"
SYSTEM_UNIT_PATH="/etc/systemd/system/ollama.service"
USER_UNIT_DIR="$HOME/.config/systemd/user"

if [ "$EUID" -ne 0 ]; then
  echo "Installing user-level service (no sudo required)

To install system-wide, run this script as root (sudo)."
  mkdir -p "$USER_UNIT_DIR"
  cp "$UNIT_SRC" "$USER_UNIT_DIR/ollama.service"
  systemctl --user daemon-reload
  systemctl --user enable --now ollama.service
  echo "User service installed and started via systemd --user. Logs: journalctl --user -u ollama.service -f"
  exit 0
fi

# System-wide install
cp "$UNIT_SRC" "$SYSTEM_UNIT_PATH"
chmod 644 "$SYSTEM_UNIT_PATH"
systemctl daemon-reload
systemctl enable --now ollama.service
echo "Installed and started system-wide unit: $SYSTEM_UNIT_PATH"
echo "Check logs: journalctl -u ollama.service -f"