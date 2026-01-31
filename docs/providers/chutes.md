---
summary: "Use Chutes AI with OpenClaw"
read_when:
  - You want to use Chutes AI models in OpenClaw
  - You need to configure Chutes via OAuth or API key
---

# Chutes AI

Chutes provides high-performance inference for open-weight models, including GLM 4.7 Flash. OpenClaw supports Chutes via both OAuth and API key authentication.

Models are fetched dynamically from the Chutes API, ensuring you always have access to the latest models, accurate pricing, and context window limits.

## Why Chutes in OpenClaw

- **High Performance**: Optimized inference for top-tier open-weight models.
- **Trusted Execution Environment (TEE)**: Run models in a secure, verifiable enclave for maximum privacy.
- **Dynamic Discovery**: Automatic access to new models as they are released on Chutes.
- **OpenAI-compatible**: Standard `/v1` endpoints for seamless integration.

## Features

- **OAuth + API Key**: Multiple ways to authenticate based on your needs.
- **TEE Filtering**: Easily filter for models running in a Trusted Execution Environment.
- **Tool Calling**: Support for function calling on major models like Qwen 3 and DeepSeek V3.
- **Streaming**: ✅ Full streaming support for all models.

## CLI setup

To configure Chutes with an API key:

```bash
openclaw onboard --auth-choice chutes-api-key
```

To configure Chutes with OAuth (browser-based):

```bash
openclaw onboard --auth-choice chutes
```

**Non-interactive setup:**

```bash
openclaw onboard --non-interactive \
  --accept-risk \
  --auth-choice chutes-api-key \
  --chutes-api-key "$CHUTES_API_KEY"
```

## Which Model Should I Use?

| Use Case              | Recommended Model                                     | Why                                                                   |
| --------------------- | ----------------------------------------------------- | --------------------------------------------------------------------- |
| **General chat**      | `chutes/zai-org/GLM-4.7-Flash`                        | Fast, reliable, and the default choice                                |
| **Best Overall**      | `chutes/moonshotai/Kimi-K2.5-TEE`                     | 1T parameter MoE model; perfect scores in reasoning/ethics benchmarks |
| **TEE Privacy**       | `chutes/deepseek-ai/DeepSeek-V3.2-TEE`                | Top-tier reasoning in a secure enclave                                |
| **Complex reasoning** | `chutes/Qwen/Qwen3-235B-A22B-Instruct-2507-TEE`       | Massive 235B model with TEE support                                   |
| **Tool calling**      | `chutes/chutesai/Mistral-Small-3.1-24B-Instruct-2503` | Excellent tool support and performance                                |

OAuth allows you to use your Chutes account without manually managing API keys. OpenClaw uses the standard [Sign in with Chutes](https://github.com/chutesai/Sign-in-with-Chutes) flow.

### OAuth Scopes

OpenClaw requests the following scopes by default:

- `openid` (Required for authentication)
- `profile` (Access to username, email, name)
- `chutes:invoke` (Required to make AI API calls on your behalf)

### Custom OAuth App (Advanced)

If you wish to use your own OAuth application instead of the default, set these environment variables before running onboarding:

- `CHUTES_CLIENT_ID`: Your OAuth client ID
- `CHUTES_CLIENT_SECRET`: Your OAuth client secret (if applicable)
- `CHUTES_OAUTH_REDIRECT_URI`: Your redirect URI (default: `http://127.0.0.1:1456/oauth-callback`)

## Config snippet

```json5
{
  env: { CHUTES_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "chutes/zai-org/GLM-4.7-Flash" } } },
  models: {
    providers: {
      chutes: {
        baseUrl: "https://llm.chutes.ai/v1",
        api: "openai-completions",
        apiKey: "${CHUTES_API_KEY}",
        teeOnly: false, // Set to true to filter models by Trusted Execution Environment
      },
    },
  },
}
```

## Model Discovery

OpenClaw automatically discovers models from the Chutes API when credentials are configured. If the API is unreachable, it falls back to a curated catalog of popular models.

The discovery process:

1. Fetches available models from `https://llm.chutes.ai/v1/models`
2. Merges with local catalog metadata (context windows, capabilities)
3. Applies `teeOnly` filtering if configured

## Available Models

### TEE Models (Trusted Execution Environment)

| Model ID                                        | Name              | Context | Features         |
| ----------------------------------------------- | ----------------- | ------- | ---------------- |
| `moonshotai/Kimi-K2.5-TEE`                      | Kimi K2.5         | 256k    | Vision, tools    |
| `deepseek-ai/DeepSeek-V3.2-TEE`                 | DeepSeek V3.2     | 203k    | Reasoning, tools |
| `Qwen/Qwen3-235B-A22B-Instruct-2507-TEE`        | Qwen 3 235B       | 262k    | Tools            |
| `mistralai/Mistral-Small-24B-Instruct-2501-TEE` | Mistral Small 24B | 131k    | Tools            |

### Standard Models

| Model ID                                       | Name              | Context | Features      |
| ---------------------------------------------- | ----------------- | ------- | ------------- |
| `zai-org/GLM-4.7-Flash`                        | GLM 4.7 Flash     | 128k    | Fast, general |
| `chutesai/Mistral-Small-3.1-24B-Instruct-2503` | Mistral Small 3.1 | 131k    | Tools         |
| `NousResearch/Hermes-4-14B`                    | Hermes 4 14B      | 41k     | Tools         |

For a full list, see the [Chutes Models API](https://llm.chutes.ai/v1/models).

## Rate Limits

Chutes applies fair-use rate limiting:

| Tier | Requests/min | Tokens/min | Notes                    |
| ---- | ------------ | ---------- | ------------------------ |
| Free | 60           | 100k       | Subject to availability  |
| Pro  | 300          | 1M         | Contact for higher needs |

Rate limit headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Streaming and Tool Support

| Feature              | Support                                          |
| -------------------- | ------------------------------------------------ |
| **Streaming**        | ✅ All models                                    |
| **Function calling** | ✅ Most models (Qwen 3, DeepSeek, Mistral, Kimi) |
| **Vision/Images**    | ✅ Kimi K2.5                                     |
| **JSON mode**        | ✅ Supported via `response_format`               |

## Usage Examples

```bash
# Use default model (GLM 4.7 Flash)
openclaw chat --model chutes/zai-org/GLM-4.7-Flash "Hello!"

# Use Kimi K2.5 TEE (best overall)
openclaw chat --model chutes/moonshotai/Kimi-K2.5-TEE "Explain quantum computing"

# Use DeepSeek V3.2 TEE for reasoning
openclaw chat --model chutes/deepseek-ai/DeepSeek-V3.2-TEE "Solve this logic puzzle..."

# List available Chutes models
openclaw models list | grep chutes
```

## Error Handling

| HTTP Code | Meaning            | Resolution                        |
| --------- | ------------------ | --------------------------------- |
| 401       | Invalid API key    | Verify key, re-run onboard        |
| 403       | Insufficient scope | Re-auth with required scopes      |
| 429       | Rate limited       | Back off, check X-RateLimit-Reset |
| 500       | Server error       | Retry with exponential backoff    |
| 503       | Model unavailable  | Try alternative model or wait     |

OpenClaw automatically retries on 429/5xx with exponential backoff (max 3 retries).

## Troubleshooting

### API key not recognized

```bash
echo $CHUTES_API_KEY
openclaw models list | grep chutes
```

Ensure the key is valid and starts with the expected prefix.

### Model not available

The Chutes model catalog updates dynamically. Run `openclaw models list` to see currently available models. Some models may be temporarily offline.

### Connection issues

Chutes API is at `https://llm.chutes.ai/v1`. Ensure your network allows HTTPS connections.

## Notes

- Chutes models use the `chutes/` provider prefix
- Default model: `chutes/zai-org/GLM-4.7-Flash`
- OpenAI-compatible endpoints
- **TEE models** run in a Trusted Execution Environment for maximum privacy; filter with `teeOnly: true`

## Links

- [Chutes AI](https://chutes.ai)
- [Models API](https://llm.chutes.ai/v1/models)
- [Sign in with Chutes](https://github.com/chutesai/Sign-in-with-Chutes)
