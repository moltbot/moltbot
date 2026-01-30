---
summary: "Run OpenClaw Gateway 24/7 on a GCP Compute Engine VM with durable state"
read_when:
  - You want OpenClaw running 24/7 on GCP
  - You want a production-grade, always-on Gateway on your own VM
  - You want full control over persistence, binaries, and restart behavior
---

# OpenClaw on GCP Compute Engine

## Goal

Run a persistent OpenClaw Gateway on a GCP Compute Engine VM with durable state and safe restart behavior.

Pricing varies by machine type and region; pick the smallest VM that fits your workload and scale up if needed.

**Two installation paths:**
- **Docker** (recommended for ops teams) — isolated runtime, baked binaries
- **Native** (recommended for personal use) — simpler setup, uses systemd

---

## What you need

- GCP account (free tier eligible for e2-micro)
- gcloud CLI installed (or use Cloud Console)
- SSH access from your laptop
- Basic comfort with SSH + copy/paste
- ~20-30 minutes
- Model auth credentials (Anthropic API key recommended)
- Optional: Tailscale account (free) for secure remote access
- Optional provider credentials:
  - WhatsApp QR
  - Telegram bot token
  - Gmail OAuth

---

## Quick path (experienced operators)

1. Create GCP project + enable Compute Engine API
2. Create Compute Engine VM (e2-small, Ubuntu 24.04, 20-50GB)
3. SSH into the VM
4. Install OpenClaw (Docker or native)
5. Configure channels (Telegram, WhatsApp, etc.)
6. Access via SSH tunnel or Tailscale

---

## 1) Install gcloud CLI (or use Console)

**Option A: gcloud CLI** (recommended for automation)

Install from https://cloud.google.com/sdk/docs/install

Initialize and authenticate:

```bash
gcloud init
gcloud auth login
```

**Option B: Cloud Console**

All steps can be done via the web UI at https://console.cloud.google.com

---

## 2) Create a GCP project

**CLI:**

```bash
gcloud projects create my-openclaw-project --name="OpenClaw Gateway"
gcloud config set project my-openclaw-project
```

Enable billing at https://console.cloud.google.com/billing (required for Compute Engine).

Enable the Compute Engine API:

```bash
gcloud services enable compute.googleapis.com
```

**Set up budget alerts (recommended):**

```bash
gcloud services enable billingbudgets.googleapis.com

gcloud billing budgets create \
  --billing-account=<BILLING_ACCOUNT_ID> \
  --display-name="openclaw-budget" \
  --budget-amount=50USD \
  --filter-projects="projects/my-openclaw-project" \
  --threshold-rule=percent=50 \
  --threshold-rule=percent=90 \
  --threshold-rule=percent=100
```

**Console:**

1. Go to IAM & Admin > Create Project
2. Name it and create
3. Enable billing for the project
4. Navigate to APIs & Services > Enable APIs > search "Compute Engine API" > Enable

---

## 3) Create the VM

**Machine types:**

| Type | Specs | Cost | Notes |
|------|-------|------|-------|
| e2-micro | 2 vCPU (shared), 1GB RAM | Free tier eligible | May OOM under load |
| e2-small | 2 vCPU, 2GB RAM | ~$12/mo | Minimum recommended |
| e2-standard-2 | 2 vCPU, 8GB RAM | ~$49/mo | Comfortable for heavy use |

**CLI:**

```bash
gcloud compute instances create openclaw-gateway \
  --zone=us-central1-a \
  --machine-type=e2-small \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-ssd \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --metadata=enable-oslogin=TRUE
```

**Console:**

1. Go to Compute Engine > VM instances > Create instance
2. Name: `openclaw-gateway`
3. Region: `us-central1`, Zone: `us-central1-a`
4. Machine type: `e2-small`
5. Boot disk: Ubuntu 24.04 LTS, 30GB SSD
6. Create

---

## 4) SSH into the VM

**CLI:**

```bash
gcloud compute ssh openclaw-gateway --zone=us-central1-a
```

**Console:**

Click the "SSH" button next to your VM in the Compute Engine dashboard.

Note: SSH key propagation can take 1-2 minutes after VM creation. If connection is refused, wait and retry.

---

## 5) Choose installation method

### Option A: Native installation (recommended for personal use)

**Install Node.js 22:**

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
sudo apt-get install -y nodejs
```

**Install OpenClaw:**

```bash
curl -fsSL https://openclaw.bot/install.sh | bash
```

Or via npm:

```bash
sudo npm install -g openclaw@latest
```

**Run onboarding:**

```bash
openclaw onboard --install-daemon
```

The wizard configures:
- Model authentication (Anthropic API key recommended)
- Gateway as systemd service
- Messaging channels
- Security defaults

**Verify:**

```bash
openclaw status
openclaw gateway status
```

### Option B: Docker installation (recommended for ops teams)

For the generic Docker flow, see [Docker](/install/docker).

**Install Docker:**

```bash
sudo apt-get update
sudo apt-get install -y git curl ca-certificates
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
```

Log out and back in for the group change to take effect.

**Clone and configure:**

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw
mkdir -p ~/.openclaw ~/.openclaw/workspace
```

**Create `.env`:**

```bash
OPENCLAW_IMAGE=openclaw:latest
OPENCLAW_GATEWAY_TOKEN=<generate-with-openssl-rand-hex-32>
OPENCLAW_GATEWAY_BIND=lan
OPENCLAW_GATEWAY_PORT=18789
OPENCLAW_CONFIG_DIR=/home/$USER/.openclaw
OPENCLAW_WORKSPACE_DIR=/home/$USER/.openclaw/workspace
GOG_KEYRING_PASSWORD=<generate-with-openssl-rand-hex-32>
XDG_CONFIG_HOME=/home/node/.openclaw
```

Generate strong secrets with `openssl rand -hex 32`. Do not commit this file.

**Create `docker-compose.yml`:**

```yaml
services:
  openclaw-gateway:
    image: ${OPENCLAW_IMAGE}
    build: .
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - HOME=/home/node
      - NODE_ENV=production
      - TERM=xterm-256color
      - OPENCLAW_GATEWAY_BIND=${OPENCLAW_GATEWAY_BIND}
      - OPENCLAW_GATEWAY_PORT=${OPENCLAW_GATEWAY_PORT}
      - OPENCLAW_GATEWAY_TOKEN=${OPENCLAW_GATEWAY_TOKEN}
      - GOG_KEYRING_PASSWORD=${GOG_KEYRING_PASSWORD}
      - XDG_CONFIG_HOME=${XDG_CONFIG_HOME}
    volumes:
      - ${OPENCLAW_CONFIG_DIR}:/home/node/.openclaw
      - ${OPENCLAW_WORKSPACE_DIR}:/home/node/.openclaw/workspace
    ports:
      - "127.0.0.1:${OPENCLAW_GATEWAY_PORT}:18789"
    command:
      ["node", "dist/index.js", "gateway", "--bind", "${OPENCLAW_GATEWAY_BIND}", "--port", "${OPENCLAW_GATEWAY_PORT}"]
```

**Bake required binaries (critical for Docker):**

Binaries installed at runtime are lost on restart. Add them to the Dockerfile:

```dockerfile
FROM node:22-bookworm

RUN apt-get update && apt-get install -y socat && rm -rf /var/lib/apt/lists/*

# Example: Gmail CLI
RUN curl -L https://github.com/steipete/gog/releases/latest/download/gog_Linux_x86_64.tar.gz \
  | tar -xz -C /usr/local/bin && chmod +x /usr/local/bin/gog

# Example: WhatsApp CLI
RUN curl -L https://github.com/steipete/wacli/releases/latest/download/wacli_Linux_x86_64.tar.gz \
  | tar -xz -C /usr/local/bin && chmod +x /usr/local/bin/wacli

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY ui/package.json ./ui/package.json
COPY scripts ./scripts

RUN corepack enable
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build
RUN pnpm ui:install
RUN pnpm ui:build

ENV NODE_ENV=production
CMD ["node","dist/index.js"]
```

**Build and launch:**

```bash
docker compose build
docker compose up -d openclaw-gateway
```

**Verify:**

```bash
docker compose logs -f openclaw-gateway
```

Success: `[gateway] listening on ws://0.0.0.0:18789`

---

## 6) Secure remote access

### Option A: Tailscale (recommended)

Tailscale creates an encrypted mesh network. No public IP needed, no firewall rules to manage.

**Install Tailscale on VM:**

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up --ssh
```

Authorize the device in your browser when prompted.

**Install Tailscale locally:**

Install from https://tailscale.com/download and sign in to the same account.

**Remove public IP (security hardening):**

```bash
# Set up Cloud NAT first (for outbound traffic)
gcloud compute routers create nat-router \
  --network=default \
  --region=us-central1

gcloud compute routers nats create nat-config \
  --router=nat-router \
  --region=us-central1 \
  --nat-all-subnet-ip-ranges \
  --auto-allocate-nat-external-ips

# Remove public IP
gcloud compute instances delete-access-config openclaw-gateway \
  --zone=us-central1-a \
  --access-config-name="external-nat"
```

**Access via Tailscale:**

```bash
ssh user@openclaw-gateway  # Tailscale SSH
```

**Access Control UI via Tailscale Serve:**

Add to `~/.openclaw/openclaw.json`:

```json5
{
  gateway: {
    bind: "loopback",
    tailscale: { mode: "serve" }
  }
}
```

Access at `https://openclaw-gateway.<tailnet>.ts.net/`

### Option B: SSH tunnel

```bash
gcloud compute ssh openclaw-gateway --zone=us-central1-a -- -L 18789:127.0.0.1:18789
```

Open in browser: `http://127.0.0.1:18789/`

---

## 7) Configure messaging channels

### Telegram

1. Message @BotFather on Telegram
2. Send `/newbot` and follow prompts
3. Copy the bot token

**Configure via environment:**

```bash
export TELEGRAM_BOT_TOKEN="your_token_here"
```

**Or in config (`~/.openclaw/openclaw.json`):**

```json5
{
  channels: {
    telegram: {
      enabled: true,
      botToken: "your_token_here",
      dmPolicy: "pairing",
      groups: { "*": { requireMention: true } }
    }
  }
}
```

**Approve first user:**

When someone messages your bot, they receive a pairing code. Approve with:

```bash
openclaw pairing approve telegram <CODE>
```

### WhatsApp

```bash
openclaw channels login
```

Scan the QR code with WhatsApp on your phone.

---

## 8) Management commands

| Command | Description |
|---------|-------------|
| `openclaw status` | Overview of Gateway and providers |
| `openclaw gateway status` | Gateway service status |
| `openclaw gateway restart` | Restart Gateway |
| `openclaw channels status` | Channel connection status |
| `openclaw logs --follow` | Live logs |
| `openclaw doctor` | Diagnose and fix issues |
| `openclaw security audit` | Security audit |
| `openclaw security audit --fix` | Auto-fix security issues |

---

## What persists where

| Component | Location | Persistence | Notes |
|-----------|----------|-------------|-------|
| Gateway config | `~/.openclaw/openclaw.json` | Host filesystem | Tokens, settings |
| Model auth | `~/.openclaw/credentials/` | Host filesystem | API keys, OAuth |
| Agent workspace | `~/.openclaw/workspace/` | Host filesystem | SOUL.md, MEMORY.md, skills |
| Sessions | `~/.openclaw/agents/<id>/sessions/` | Host filesystem | Conversation logs |
| WhatsApp session | `~/.openclaw/credentials/whatsapp/` | Host filesystem | Preserves QR login |
| External binaries | `/usr/local/bin/` | Docker image | Must be baked at build time |
| Node runtime | Container filesystem | Docker image | Rebuilt every image build |

For Docker: all `~/.openclaw` paths are mounted from host via volumes. Container filesystem is ephemeral.

---

## Security checklist

| Check | Status |
|-------|--------|
| Gateway on loopback only | Required |
| No public IP (use Tailscale) | Recommended |
| Cloud NAT for outbound | Required if no public IP |
| Pairing mode for DMs | Default |
| Require mention in groups | Recommended |
| File permissions 600/700 | Required |
| Regular security audits | Recommended |

**Recommended permissions:**

```bash
chmod 700 ~/.openclaw
chmod 600 ~/.openclaw/openclaw.json
chmod 600 ~/.openclaw/credentials/*
```

---

## Updates

**Native installation:**

```bash
sudo npm install -g openclaw@latest
openclaw gateway restart
```

**Docker installation:**

```bash
cd ~/openclaw
git pull
docker compose build
docker compose up -d
```

---

## Troubleshooting

**SSH connection refused**

SSH key propagation can take 1-2 minutes after VM creation. Wait and retry.

**OS Login issues**

```bash
gcloud compute os-login describe-profile
```

Ensure your account has the required IAM permissions.

**Out of memory (OOM)**

Upgrade machine type:

```bash
gcloud compute instances stop openclaw-gateway --zone=us-central1-a
gcloud compute instances set-machine-type openclaw-gateway \
  --zone=us-central1-a \
  --machine-type=e2-small
gcloud compute instances start openclaw-gateway --zone=us-central1-a
```

**No internet after removing public IP**

Ensure Cloud NAT is configured (see section 6).

**Gateway won't start**

```bash
# Check if already running
ps aux | grep openclaw

# Force restart
openclaw gateway --force --verbose
```

---

## Service accounts (CI/CD)

For automation or CI/CD pipelines, create a dedicated service account with minimal permissions:

```bash
# Create service account
gcloud iam service-accounts create openclaw-deploy \
  --display-name="OpenClaw Deployment"

# Grant Compute Instance Admin role
gcloud projects add-iam-policy-binding my-openclaw-project \
  --member="serviceAccount:openclaw-deploy@my-openclaw-project.iam.gserviceaccount.com" \
  --role="roles/compute.instanceAdmin.v1"
```

Avoid using the Owner role for automation. Use the principle of least privilege.

See https://cloud.google.com/iam/docs/understanding-roles for IAM role details.

---

## Cost summary

| Component | Cost/month |
|-----------|------------|
| e2-small VM | ~$12 |
| 30GB SSD | ~$5 |
| Cloud NAT | ~$1 |
| **Total** | **~$18** |

Free tier: e2-micro is eligible but may OOM under load.

Set up budget alerts to avoid surprises.

---

## Next steps

- Set up messaging channels: [Channels](/channels)
- Pair local devices as nodes: [Nodes](/nodes)
- Configure the Gateway: [Gateway configuration](/gateway/configuration)
- Security best practices: [Gateway security](/gateway/security)
