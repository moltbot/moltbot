---
summary: "Clawdbot on Hostinger VPS (simplest UI-based setup)"
read_when:
  - Setting up Clawdbot on Hostinger VPS
  - Looking for the easiest VPS setup with a UI
  - Want one-click Docker deployment
---

# Clawdbot on Hostinger VPS

## Goal

Run a persistent Clawdbot Gateway on Hostinger VPS using their **Docker Manager** UI.

This is the **simplest setup path** if you prefer a graphical interface over SSH and command-line configuration. Hostinger's hPanel includes a Docker catalog with Clawdbot pre-configured for one-click deployment.

## Cost Comparison (2026)

| Provider | Plan | Specs | Price/mo | Notes |
|----------|------|-------|----------|-------|
| Oracle Cloud | Always Free ARM | up to 4 OCPU, 24GB RAM | $0 | ARM, limited capacity / signup quirks |
| Hetzner | CX22 | 2 vCPU, 4GB RAM | ~$4 | Cheapest paid option |
| Hostinger | KVM 1 | 1 vCPU, 4GB RAM | ~$5 | UI-based, Docker catalog |
| DigitalOcean | Basic | 1 vCPU, 1GB RAM | $6 | Easy UI, good docs |
| Vultr | Cloud Compute | 1 vCPU, 1GB RAM | $6 | Many locations |
| Linode | Nanode | 1 vCPU, 1GB RAM | $5 | Now part of Akamai |

**Why Hostinger?**
- Fully UI-based setup (no SSH required)
- Docker Manager with pre-configured Clawdbot in the catalog
- Good starting point for users less comfortable with the command line

---

## Prerequisites

- Hostinger account ([signup](https://www.hostinger.com/docker-hosting))
- ~10 minutes

That's it. No SSH keys, no terminal experience required.

---

## 1) Purchase a VPS

1. Go to [Hostinger VPS plans](https://www.hostinger.com/docker-hosting)
2. Select a plan (minimum **1GB RAM** recommended, 4GB preferred)
3. Complete checkout
4. Wait for provisioning (typically 1-2 minutes)

## 2) Install Docker Manager

1. Log into [hPanel](https://hpanel.hostinger.com/)
2. Select your VPS from the dashboard
3. In the left sidebar, find **Docker Manager**
4. If not already installed, click **Install**
5. Wait 2-3 minutes for installation to complete

## 3) Deploy Clawdbot from Catalog

1. Open **Docker Manager** in hPanel
2. Go to the **Catalog** section
3. Search for **Clawdbot**
4. Click the **Deploy** button on the Clawdbot card

## 4) Configure Environment Variables

The deployment wizard will show configuration options:

**Required (auto-generated):**
- `CLAWDBOT_GATEWAY_TOKEN` — Used to access the Control UI (generated automatically)

You can also configure these later via the Control UI.

## 5) Complete Deployment

1. Review your configuration
2. Click **Deploy**
3. Wait for the container to reach **Running** status (1-2 minutes)
4. Note the assigned port number shown in Docker Manager

---

## Access the Control UI

Once deployed, access Clawdbot at:

```
http://YOUR_VPS_IP:PORT
```

Replace:
- `YOUR_VPS_IP` with your VPS IP address (shown in hPanel dashboard)
- `PORT` with the port assigned by Docker Manager

Enter the gateway token when prompted.

---

## Connect Your Channels

From the Control UI, you can connect messaging platforms:

1. Open the Control UI in your browser
2. Navigate to **Channels** or **Integrations**
3. Follow the prompts to connect:
   - **WhatsApp** — Scan QR code
   - **Telegram** — Enter bot token
   - **Discord** — Enter bot token
   - **Slack** — OAuth flow

See [Channels](/channels) for detailed setup guides.

---

## Managing Your Deployment

All management happens through Docker Manager in hPanel:

- **View logs:** Click on the Clawdbot container → Logs tab
- **Restart:** Click the restart button on the container
- **Stop/Start:** Use the container controls
- **Update:** Pull the latest image and redeploy

### Update to Latest Version

1. In Docker Manager, stop the Clawdbot container
2. Go to the Catalog and redeploy Clawdbot
3. Your configuration persists if using volumes

---

## Advanced: SSH Access

If you need command-line access for troubleshooting:

1. In hPanel, go to **Docker Manager**
2. Press **Terminal** button

From SSH, you can use standard Clawdbot CLI commands:

```bash
# Check status
docker ps | grep clawdbot

# View logs
docker logs -f <container_id>

# Enter container shell
docker exec -it <container_id> /bin/bash
```

---

## Persistence

Docker Manager configures volumes automatically. Your data persists across container restarts:

- `~/.clawdbot/` — config, credentials, session data
- `~/clawd/` — workspace (SOUL.md, memory, artifacts)

---

## Troubleshooting

### Container won't start

1. In Docker Manager, check the container logs
2. Verify you have enough RAM (1GB minimum)
3. Try redeploying from the Catalog

### Can't access Control UI

1. Verify the container is in **Running** status
2. Check the correct port in Docker Manager
3. Ensure your browser can reach the VPS IP

### Gateway token not working

1. Check the `CLAWDBOT_GATEWAY_TOKEN` in Docker Manager → Environment
2. The token is case-sensitive
3. Try redeploying with a new token

### Need more control

If you need advanced configuration (custom binaries, specific Docker options), consider using SSH access for direct Docker commands.

---

## See Also

- [Hetzner guide](/platforms/hetzner) — Docker Compose with full control
- [DigitalOcean guide](/platforms/digitalocean) — CLI-based setup
- [Oracle guide](/platforms/oracle) — free tier option
- [Docker install](/install/docker) — generic Docker setup
- [Gateway configuration](/gateway/configuration) — all config options
