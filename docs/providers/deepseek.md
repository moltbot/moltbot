---
summary: "Configure DeepSeek API (Chat + Reasoner models)"
read_when:
  - You want to use DeepSeek models
  - You need to configure DeepSeek API key
  - You want cost-effective reasoning models
---

# DeepSeek

DeepSeek provides cost-effective AI models with OpenAI-compatible endpoints. Moltbot supports both the Chat and Reasoner models.

## Models

| Model ID | Name | Reasoning | Context |
|----------|------|-----------|---------|
| `deepseek-chat` | DeepSeek Chat | No | 64K |
| `deepseek-reasoner` | DeepSeek Reasoner | Yes | 64K |

## Quick start

```bash
moltbot onboard --auth-choice deepseek-api-key
```

Or set the environment variable:

```bash
export DEEPSEEK_API_KEY="sk-..."
moltbot models set deepseek/deepseek-chat
```

## Config snippet

```json5
{
  env: { DEEPSEEK_API_KEY: "sk-..." },
  agents: {
    defaults: {
      model: { primary: "deepseek/deepseek-chat" }
    }
  }
}
```

## Using the Reasoner model

For tasks requiring chain-of-thought reasoning:

```json5
{
  agents: {
    defaults: {
      model: { primary: "deepseek/deepseek-reasoner" }
    }
  }
}
```

## Notes

- DeepSeek uses an OpenAI-compatible API at `https://api.deepseek.com`
- Get your API key from [platform.deepseek.com](https://platform.deepseek.com/)
- Pricing is very competitive compared to other providers
