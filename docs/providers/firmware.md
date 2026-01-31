---
summary: "Use Firmware AI models via unified subscription API"
read_when:
  - You want to use Firmware AI models in Moltbot
  - You want access to Claude, GPT, Gemini, Grok, and DeepSeek via one API key on subscription pricing
  - You need a unified AI subscription service
---

# Firmware

Firmware provides a unified AI subscription that gives you access to models from Anthropic, OpenAI, Google, xAI, and DeepSeek via a single API key and OpenAI-compatible endpoint. One subscription enables all supported models.

## Setup

**Best for:** unified access to multiple model providers with one subscription.

Get your API key from https://app.firmware.ai

### CLI setup

```bash
moltbot onboard --auth-choice firmware-api-key
# or non-interactive
moltbot onboard --firmware-api-key "$FIRMWARE_API_KEY"
```

### Config snippet

```json5
{
  env: { FIRMWARE_API_KEY: "fw-..." },
  agents: { defaults: { model: { primary: "firmware/gpt-5.2" } } }
}
```

## Available models

### Claude (Anthropic)

- `firmware/claude-opus-4-5` - Claude Opus 4.5 (reasoning, 200k context)
- `firmware/claude-sonnet-4-5` - Claude Sonnet 4.5 (reasoning, 200k context)
- `firmware/claude-haiku-4-5` - Claude Haiku 4.5 (reasoning, 200k context)

### GPT (OpenAI)

- `firmware/gpt-5.2` - GPT-5.2 (reasoning, 400k context)
- `firmware/gpt-5` - GPT-5 (reasoning, 128k context)
- `firmware/gpt-5-mini` - GPT-5 Mini (reasoning, 128k context)
- `firmware/gpt-5-nano` - GPT-5 Nano (reasoning, 128k context)
- `firmware/gpt-4o` - GPT-4o (128k context)
- `firmware/gpt-oss-120b` - GPT OSS 120B via Cerebras (reasoning, 128k context)

### Gemini (Google)

- `firmware/gemini-3-pro-preview` - Gemini 3 Pro Preview (reasoning, 1M context)
- `firmware/gemini-3-flash-preview` - Gemini 3 Flash Preview (reasoning, 1M context)
- `firmware/gemini-2.5-pro` - Gemini 2.5 Pro (reasoning, multimodal, 1M+ context)
- `firmware/gemini-2.5-flash` - Gemini 2.5 Flash (reasoning, 1M context)

### Grok (xAI)

- `firmware/grok-4-fast-reasoning` - Grok 4 Fast (Reasoning)
- `firmware/grok-4-fast-non-reasoning` - Grok 4 Fast (Non-Reasoning)
- `firmware/grok-code-fast-1` - Grok Code Fast 1 (reasoning)

### DeepSeek

- `firmware/deepseek-reasoner` - DeepSeek Reasoner (reasoning, 128k context)
- `firmware/deepseek-chat` - DeepSeek Chat (128k context)

## Notes

- Model refs always use `provider/model` (see [/concepts/models](/concepts/models))
- Auth details + reuse rules are in [/concepts/oauth](/concepts/oauth)
- All models are accessed via the unified Firmware API at `https://app.firmware.ai/api/v1`
- Pricing is available via your Firmware subscription (all models are zero-cost through Firmware's unified subscription)
