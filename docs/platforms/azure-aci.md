---
title: Azure Container Instances
description: Deploy OpenClaw on Azure Container Instances (ACI)
---

# Azure Container Instances Deployment

**Goal:** OpenClaw Gateway running on [Azure Container Instances](https://learn.microsoft.com/azure/container-instances/) with persistent storage via Azure File Share, public DNS, and Log Analytics monitoring.

## What you need

- [Azure subscription](https://azure.microsoft.com/free/) (free trial works)
- [Azure Developer CLI (azd)](https://aka.ms/azure-dev/install) installed
- [Azure CLI (az)](https://learn.microsoft.com/cli/azure/install-azure-cli) installed
- [Docker](https://docs.docker.com/get-docker/) installed and running
- Model auth: Anthropic API key, Claude setup-token, or other provider keys

## Beginner quick path

1. Clone repo
2. Set secrets with `azd env set`
3. Deploy with `azd up`
4. Open the URL and paste your gateway token

## 1) Clone and initialize

```bash
git clone https://github.com/openclaw/openclaw.git
cd openclaw

# Initialize azd (pick a name and region when prompted)
azd init
```

## 2) Set secrets

```bash
# Required: Gateway token (for authentication)
azd env set OPENCLAW_GATEWAY_TOKEN $(openssl rand -hex 32)
```

**Save the gateway token** -- you will need it to access the Control UI.

### Model provider keys

Set at least one AI provider key:

```bash
# Option A: Anthropic setup-token (recommended)
# Run this in a separate terminal, then paste the output:
claude setup-token
azd env set ANTHROPIC_API_KEY "sk-ant-oat01-..."

# Option B: Anthropic API key
azd env set ANTHROPIC_API_KEY "sk-ant-..."

# Option C: OpenAI API key
azd env set OPENAI_API_KEY "sk-..."
```

## 3) Deploy

```bash
azd up
```

This will:
1. Provision Azure resources (Container Registry, Storage, Log Analytics, ACI)
2. Build the Docker image from the repo Dockerfile
3. Push the image to your Azure Container Registry
4. Start the container with persistent storage

After deployment, the output shows the gateway URL.

## 4) Access the gateway

Open the displayed URL in your browser (e.g., `http://openclaw-xxxxx.eastus.azurecontainer.io:18789`) and paste your gateway token to authenticate.

## Architecture

```
Resource Group (rg-{environment})
 |
 +-- Container Registry (ACR)     -- stores the Docker image
 +-- Storage Account
 |    +-- File Share               -- persistent state at /data
 +-- Log Analytics Workspace       -- container logs & metrics
 +-- Container Instance (ACI)      -- runs the gateway
      - Port 18789 (public IP + DNS)
      - Volume: Azure File Share -> /data
```

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENCLAW_GATEWAY_TOKEN` | Gateway authentication token | Yes |
| `ANTHROPIC_API_KEY` | Anthropic API key or setup-token | At least one provider |
| `OPENAI_API_KEY` | OpenAI API key | At least one provider |
| `AZURE_LOCATION` | Azure region (e.g., `eastus`) | Set during `azd init` |

### Container resources

Default: 1 CPU, 2 GB RAM. To change, edit the defaults in `infra/azure/main.bicep`:

```bicep
param containerCpu int = 2      // default: 1
param containerMemory int = 4   // default: 2
```

Then redeploy with `azd up`.

## Management

### View logs

```bash
# Via azd
azd monitor --logs

# Via Azure CLI (replace placeholders)
az container logs --resource-group <rg-name> --name <container-name> --follow
```

### Update deployment

Pull latest changes and redeploy:

```bash
git pull
azd deploy
```

### Stop / start

```bash
az container stop --resource-group <rg-name> --name <container-name>
az container start --resource-group <rg-name> --name <container-name>
```

### Destroy all resources

```bash
azd down
```

## Creating a config file

After the gateway is running, you can create a config file on the persistent volume. Use the Control UI or connect to the container:

```bash
az container exec --resource-group <rg-name> --name <container-name> --exec-command "/bin/bash"
```

Create the config at `/data/openclaw.json`:

```bash
cat > /data/openclaw.json << 'EOF'
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "anthropic/claude-opus-4-5",
        "fallbacks": ["anthropic/claude-sonnet-4-5"]
      }
    },
    "list": [
      {
        "id": "main",
        "default": true
      }
    ]
  },
  "gateway": {
    "mode": "local",
    "bind": "auto"
  }
}
EOF
```

Restart the container to apply:

```bash
az container restart --resource-group <rg-name> --name <container-name>
```

## Troubleshooting

### First deploy fails on image pull

On first `azd up`, provisioning may fail with `InaccessibleImage` because the
container image hasn't been pushed to ACR yet. This is a one-time issue:

```bash
# 1) Push the image manually after ACR is created:
ACR_NAME=$(azd env get-values | grep AZURE_CONTAINER_REGISTRY_NAME | cut -d'=' -f2 | tr -d '"')
az acr login --name "$ACR_NAME"
docker build --platform linux/amd64 -t "${ACR_NAME}.azurecr.io/openclaw:latest" -f Dockerfile .
docker push "${ACR_NAME}.azurecr.io/openclaw:latest"

# 2) Run provision again:
azd provision
```

Subsequent deploys using `azd up` will work without this extra step.

### Gateway slow to start

The gateway takes 2-5 minutes to start on 1 CPU ACI (initial module loading).
The liveness probe is configured with a 5-minute grace period. If the gateway
is still not responding after 7-8 minutes, check logs for errors.

### Container not starting

Check logs:
```bash
azd monitor --logs
```

Common causes:
- Missing or invalid API keys
- Insufficient memory (increase `containerMemory` param)
- ACR image not pushed (see "First deploy fails on image pull" above)

### Cannot reach the gateway URL

1. Verify the container is running:
   ```bash
   az container show --resource-group <rg-name> --name <container-name> --query "instanceView.state"
   ```
2. Ensure port 18789 is not blocked by corporate firewalls
3. Check the public IP was assigned:
   ```bash
   az container show --resource-group <rg-name> --name <container-name> --query "ipAddress"
   ```

### State not persisting

If configuration or sessions are lost after restart, verify the Azure File Share is mounted:

```bash
az container show --resource-group <rg-name> --name <container-name> --query "properties.volumes"
```

## Security

**Warning:** By default, the container is exposed on a public IP with only the gateway token for protection. Traffic is unencrypted HTTP.

**Recommended for production:**

1. **Strong gateway token** -- use `openssl rand -hex 32` (auto-generated by the deploy flow)
2. **IP allowlisting** -- configure Azure NSG rules to restrict access
3. **VNet integration** -- deploy into a Virtual Network for private access
4. **Azure Front Door** -- add TLS termination and WAF protection
5. **Monitor access** -- review Log Analytics for unusual patterns

## Cost

Default configuration (1 CPU, 2 GB RAM, 24/7):
- ACI: ~$30-40 USD/month
- Storage (1 GB File Share): ~$0.06/month
- Log Analytics: Free tier covers most usage
- ACR (Basic): ~$5/month

To reduce costs:
- Stop the container when not in use
- Use smaller CPU/memory allocation
- See [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/)
