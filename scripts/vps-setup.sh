#!/usr/bin/env bash
#
# Clawdbot VPS Setup Script
# For Hetzner or any Debian/Ubuntu VPS
#
# Usage: curl -fsSL https://raw.githubusercontent.com/.../vps-setup.sh | bash
#    or: bash vps-setup.sh
#
set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
error() { echo -e "${RED}[x]${NC} $1"; exit 1; }

# Check root
[[ $EUID -eq 0 ]] || error "Run as root: sudo bash $0"

# Detect OS
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    OS=$ID
else
    error "Cannot detect OS"
fi

log "Detected OS: $OS"

#───────────────────────────────────────────────────────────────────────────────
# 1. System packages
#───────────────────────────────────────────────────────────────────────────────
log "Installing system dependencies..."

if [[ "$OS" == "ubuntu" || "$OS" == "debian" ]]; then
    apt-get update -qq
    apt-get install -y -qq curl wget git build-essential
elif [[ "$OS" == "fedora" || "$OS" == "centos" || "$OS" == "rhel" ]]; then
    dnf install -y curl wget git gcc gcc-c++ make
else
    warn "Unknown OS, assuming packages are installed"
fi

#───────────────────────────────────────────────────────────────────────────────
# 2. Node.js (via NodeSource)
#───────────────────────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ $(node -v | cut -d. -f1 | tr -d 'v') -lt 22 ]]; then
    log "Installing Node.js 22..."
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
else
    log "Node.js $(node -v) already installed"
fi

# Parse arguments
TAILSCALE_AUTH_KEY=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --tailscale-key)
            TAILSCALE_AUTH_KEY="$2"
            shift 2
            ;;
        *)
            shift
            ;;
    esac
done

#───────────────────────────────────────────────────────────────────────────────
# 3. Tailscale
#───────────────────────────────────────────────────────────────────────────────
if ! command -v tailscale &>/dev/null; then
    log "Installing Tailscale..."
    curl -fsSL https://tailscale.com/install.sh | sh
else
    log "Tailscale already installed"
fi

# Authenticate Tailscale if key provided
if [[ -n "$TAILSCALE_AUTH_KEY" ]]; then
    log "Authenticating Tailscale..."
    tailscale up --authkey="$TAILSCALE_AUTH_KEY" --ssh --reset
elif ! tailscale status &>/dev/null; then
    warn "Tailscale not connected. Run: tailscale up --ssh"
    warn "Get auth key from: https://login.tailscale.com/admin/settings/keys"
fi

#───────────────────────────────────────────────────────────────────────────────
# 4. Create clawdbot user
#───────────────────────────────────────────────────────────────────────────────
CLAWDBOT_USER="clawdbot"
CLAWDBOT_HOME="/home/$CLAWDBOT_USER"

if ! id "$CLAWDBOT_USER" &>/dev/null; then
    log "Creating user: $CLAWDBOT_USER"
    useradd -m -s /bin/bash "$CLAWDBOT_USER"
else
    log "User $CLAWDBOT_USER already exists"
fi

#───────────────────────────────────────────────────────────────────────────────
# 5. Install Clawdbot
#───────────────────────────────────────────────────────────────────────────────
log "Installing Clawdbot..."
npm install -g clawdbot@latest

# Verify installation
CLAWDBOT_VERSION=$(clawdbot --version 2>/dev/null || echo "unknown")
log "Clawdbot version: $CLAWDBOT_VERSION"

#───────────────────────────────────────────────────────────────────────────────
# 6. Create directories
#───────────────────────────────────────────────────────────────────────────────
log "Creating directories..."
mkdir -p "$CLAWDBOT_HOME/.clawdbot"
mkdir -p "$CLAWDBOT_HOME/clawd"
chown -R "$CLAWDBOT_USER:$CLAWDBOT_USER" "$CLAWDBOT_HOME/.clawdbot"
chown -R "$CLAWDBOT_USER:$CLAWDBOT_USER" "$CLAWDBOT_HOME/clawd"

#───────────────────────────────────────────────────────────────────────────────
# 7. Create systemd service
#───────────────────────────────────────────────────────────────────────────────
log "Creating systemd service..."

cat > /etc/systemd/system/clawdbot-gateway.service << 'EOF'
[Unit]
Description=Clawdbot Gateway
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=clawdbot
Group=clawdbot
WorkingDirectory=/home/clawdbot/clawd
ExecStart=/usr/bin/clawdbot gateway run --bind loopback --port 18789
Restart=always
RestartSec=10

# Environment
Environment=NODE_ENV=production
Environment=HOME=/home/clawdbot

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=read-only
ReadWritePaths=/home/clawdbot/.clawdbot /home/clawdbot/clawd
PrivateTmp=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=clawdbot-gateway

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
log "Systemd service created: clawdbot-gateway"

#───────────────────────────────────────────────────────────────────────────────
# 8. Create config template
#───────────────────────────────────────────────────────────────────────────────
CONFIG_FILE="$CLAWDBOT_HOME/.clawdbot/clawdbot.json"
if [[ ! -f "$CONFIG_FILE" ]]; then
    log "Creating config template..."
    cat > "$CONFIG_FILE" << 'EOF'
{
  "gateway": {
    "mode": "local",
    "port": 18789,
    "bind": "loopback",
    "auth": {
      "mode": "token",
      "token": "REPLACE_WITH_SECURE_TOKEN"
    }
  },
  "channels": {},
  "plugins": {
    "entries": {}
  }
}
EOF
    chown "$CLAWDBOT_USER:$CLAWDBOT_USER" "$CONFIG_FILE"
    warn "Edit config: nano $CONFIG_FILE"
    warn "Generate token: openssl rand -hex 32"
fi

#───────────────────────────────────────────────────────────────────────────────
# 9. Firewall (UFW)
#───────────────────────────────────────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    log "Configuring firewall..."
    ufw allow ssh
    ufw allow in on tailscale0
    ufw --force enable
    log "Firewall: SSH + Tailscale allowed"
else
    warn "UFW not installed - configure firewall manually"
fi

#───────────────────────────────────────────────────────────────────────────────
# Summary
#───────────────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
echo -e "${GREEN}Setup Complete!${NC}"
echo "═══════════════════════════════════════════════════════════════════════════"
echo ""
echo "Next steps:"
echo ""
echo "  1. Connect Tailscale (if not already):"
echo "     tailscale up --ssh --authkey=tskey-auth-xxx"
echo ""
echo "  2. Generate gateway token:"
echo "     TOKEN=\$(openssl rand -hex 32)"
echo "     echo \"Token: \$TOKEN\""
echo ""
echo "  3. Edit config:"
echo "     nano $CONFIG_FILE"
echo "     # Set the token and add channels"
echo ""
echo "  4. Start gateway:"
echo "     systemctl enable --now clawdbot-gateway"
echo ""
echo "  5. Check status:"
echo "     systemctl status clawdbot-gateway"
echo "     journalctl -u clawdbot-gateway -f"
echo ""
echo "  6. Access from Mac (via Tailscale):"
echo "     ssh clawdbot@$(hostname)"
echo "     # Or via Tailscale name: ssh clawdbot@vps-tailscale-name"
echo ""
echo "═══════════════════════════════════════════════════════════════════════════"
