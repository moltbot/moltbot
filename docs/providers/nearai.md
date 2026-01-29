---
summary: "Use NEAR AI private inference in Moltbot"
read_when:
  - You want private inference with Intel TDX/NVIDIA TEE
  - You want NEAR AI setup guidance
---
# NEAR AI

NEAR AI provides privacy-focused AI inference using confidential computing. All inference runs inside Intel TDX (Trust Domain Extensions) and NVIDIA TEE (Trusted Execution Environment), ensuring your prompts and responses are never logged or exposed to the host system.

## Why NEAR AI in Moltbot

- **Private inference** - all computation happens inside secure enclaves.
- **Cryptographic verification** - outputs are signed inside TEE before leaving.
- **No logging** - prompts and responses are never stored.
- OpenAI-compatible `/v1` endpoints.

## Privacy Technology

NEAR AI uses two layers of hardware-based security:

| Technology | Purpose |
|------------|---------|
| **Intel TDX** | Isolates AI workloads in confidential VMs |
| **NVIDIA TEE** | GPU-level isolation for model weights and computations |

All AI outputs are cryptographically signed inside the TEE before leaving the secure environment, ensuring authenticity and integrity of responses.

## Features

- **OpenAI-compatible APIs**: Standard endpoints like `/v1/chat/completions`, `v1/responses`, `/v1/images/generations`, etc.
- **Streaming**: Supported on all models
- **Function calling**: Supported
- **Vision**: Supported on vision-capable models

## Setup

### 1. Get API Key

1. Sign up at [cloud.near.ai](https://cloud.near.ai)
2. Go to your dashboard and generate an API key
3. Copy your API key

### 2. Configure Moltbot

**Option A: Environment Variable**

```bash
export NEARAI_API_KEY="your-api-key"
```

**Option B: Interactive Setup (Recommended)**

```bash
moltbot onboard --auth-choice nearai-api-key
```

This will:
1. Prompt for your API key (or use existing `NEARAI_API_KEY`)
2. Configure the provider automatically
3. Set NEAR AI as your default model

**Option C: Non-interactive**

```bash
moltbot onboard --non-interactive \
  --auth-choice nearai-api-key \
  --nearai-api-key "your-api-key"
```

### 3. Verify Setup

```bash
moltbot chat --model nearai/zai-org/GLM-4.7 "Hello, are you working?"
```

## Model Selection

After setup, you can use any available NEAR AI model:

```bash
moltbot models set nearai/zai-org/GLM-4.7
moltbot models set nearai/deepseek-ai/DeepSeek-V3.1
```

List all available models:

```bash
moltbot models list | grep nearai
```

## Available Models

> **Note:** The model list may change. See the latest available models at [cloud.near.ai/models](https://cloud.near.ai/models).

| Model ID | Name | Privacy | Reasoning | Context | Cost |
|----------|------|---------|-----------|---------|------|
| `anthropic/claude-sonnet-4-5` | Claude Sonnet 4.5 | Anonymized | ✅ | 200K | $3.00 in / $15.50 out ($/M tokens) |
| `black-forest-labs/FLUX.2-klein-4B` | FLUX.2-klein-4B | Private | ❌ | 128K | $0.012/image |
| `deepseek-ai/DeepSeek-V3.1` | DeepSeek V3.1 | Private | ❌ | 128K | $1.05 in / $3.10 out ($/M tokens) |
| `google/gemini-3-pro` | Gemini 3 Pro Preview | Anonymized | ✅ | 1M | $1.25 in / $15.00 out ($/M tokens) |
| `openai/gpt-5.2` | OpenAI GPT-5.2 | Anonymized | ✅ | 400K | $1.80 in / $15.50 out ($/M tokens) |
| `openai/gpt-oss-120b` | GPT OSS 120B | Private | ✅ | 131K | $0.15 in / $0.55 out ($/M tokens) |
| `Qwen/Qwen3-30B-A3B-Instruct-2507` | Qwen3 30B | Private | ❌ | 262K | $0.15 in / $0.55 out ($/M tokens) |
| `zai-org/GLM-4.7` | GLM 4.7 (default) | Private | ✅ | 131K | $0.85 in / $3.30 out ($/M tokens) |

## Configure via `moltbot configure`

1. Run `moltbot configure`
2. Select **Model/auth**
3. Choose **NEAR AI**

## Usage Examples

```bash
# Use default model (GLM 4.7)
moltbot chat --model nearai/zai-org/GLM-4.7

# Use Claude Sonnet 4.5 for advanced reasoning
moltbot chat --model nearai/anthropic/claude-sonnet-4-5

# Use Gemini 3 Pro for ultra-long context (1M tokens!)
moltbot chat --model nearai/google/gemini-3-pro

# Use GPT-5.2 for deep reasoning
moltbot chat --model nearai/openai/gpt-5.2

# Use DeepSeek for cost-effective tasks
moltbot chat --model nearai/deepseek-ai/DeepSeek-V3.1

# Use Qwen for long context (262K!)
moltbot chat --model nearai/Qwen/Qwen3-30B-A3B-Instruct-2507

# Use FLUX for image generation
moltbot chat --model nearai/black-forest-labs/FLUX.2-klein-4B

# Send a message
moltbot agent --message "Explain quantum computing" --model nearai/zai-org/GLM-4.7
```

## Troubleshooting

### API key not recognized

```bash
echo $NEARAI_API_KEY
moltbot models list | grep nearai
```

Ensure the environment variable is set correctly.

### Connection issues

NEAR AI API is at `https://cloud-api.near.ai/v1`. Ensure your network allows HTTPS connections.

## Config file example

```json5
{
  env: { NEARAI_API_KEY: "..." },
  agents: { defaults: { model: { primary: "nearai/zai-org/GLM-4.7" } } },
  models: {
    mode: "merge",
    providers: {
      "nearai": {
        baseUrl: "https://cloud-api.near.ai/v1",
        apiKey: "${NEARAI_API_KEY}",
        api: "openai-completions"
        // Models are auto-discovered from the built-in catalog
      }
    }
  }
}
```

## Links

- [NEAR AI Cloud](https://cloud.near.ai)
- [NEAR AI Documentation](https://docs.near.ai)
