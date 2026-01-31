---
summary: "Use Z.AI / Zhipu AI (GLM models) with OpenClaw"
read_when:
  - You want Z.AI / GLM models in OpenClaw
  - You need to choose between international and China endpoints
  - You have a Coding Plan subscription
---

# Z.AI

Z.AI and Zhipu AI provide access to **GLM** models. There are four provider configurations
depending on your region and subscription type.

## Provider Variants

| Provider       | Region        | Plan Type     | Base URL                      |
| -------------- | ------------- | ------------- | ----------------------------- |
| `zai`          | International | Pay-as-you-go | api.z.ai                      |
| `zai-coding`   | International | Coding Plan   | api.z.ai (coding endpoint)    |
| `zhipu`        | China         | Pay-as-you-go | bigmodel.cn                   |
| `zhipu-coding` | China         | Coding Plan   | bigmodel.cn (coding endpoint) |

## Which should I use?

- **International users with pay-as-you-go**: Use `zai`
- **International users with Coding Plan subscription ($3-15/mo)**: Use `zai-coding`
- **China mainland users with pay-as-you-go**: Use `zhipu`
- **China mainland users with Coding Plan**: Use `zhipu-coding`

The Coding Plan endpoints are optimized for coding tools and have better tool-calling
performance. They use subscription-based billing rather than per-token billing.

## CLI Setup

```bash
# International (pay-as-you-go)
openclaw onboard --auth-choice zai-api-key

# International (Coding Plan)
openclaw onboard --auth-choice zai-coding-api-key

# China (pay-as-you-go)
openclaw onboard --auth-choice zhipu-api-key

# China (Coding Plan)
openclaw onboard --auth-choice zhipu-coding-api-key
```

### Non-interactive

```bash
# International (pay-as-you-go)
openclaw onboard --non-interactive --auth-choice zai-api-key --zai-api-key "$ZAI_API_KEY"

# International (Coding Plan)
openclaw onboard --non-interactive --auth-choice zai-coding-api-key --zai-coding-api-key "$ZAI_API_KEY"

# China (pay-as-you-go)
openclaw onboard --non-interactive --auth-choice zhipu-api-key --zhipu-api-key "$ZHIPU_API_KEY"

# China (Coding Plan)
openclaw onboard --non-interactive --auth-choice zhipu-coding-api-key --zhipu-coding-api-key "$ZHIPU_API_KEY"
```

## Environment Variables

| Provider       | Primary Env Var        | Fallback Chain                 |
| -------------- | ---------------------- | ------------------------------ |
| `zai`          | `ZAI_API_KEY`          | `Z_AI_API_KEY`                 |
| `zai-coding`   | `ZAI_CODING_API_KEY`   | `ZAI_API_KEY` → `Z_AI_API_KEY` |
| `zhipu`        | `ZHIPU_API_KEY`        | (none)                         |
| `zhipu-coding` | `ZHIPU_CODING_API_KEY` | `ZHIPU_API_KEY`                |

The coding providers fall back to their respective general provider's env var, so you can
use a single API key for both if desired.

## Config Snippets

### International (pay-as-you-go)

```json5
{
  env: { ZAI_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "zai/glm-4.7" } } },
}
```

### International (Coding Plan)

```json5
{
  env: { ZAI_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "zai-coding/glm-4.7" } } },
}
```

### China (pay-as-you-go)

```json5
{
  env: { ZHIPU_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "zhipu/glm-4.7" } } },
}
```

### China (Coding Plan)

```json5
{
  env: { ZHIPU_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "zhipu-coding/glm-4.7" } } },
}
```

## Important Notes

- **Keys are subscription-gated**: Your API key only works on the endpoint matching
  your active subscription. A Coding Plan key will return error 1113 ("Insufficient
  balance") on the general pay-as-you-go endpoint, and vice versa. Choose the provider
  variant that matches your subscription type.

- **Regional keys are not interchangeable**: Keys from z.ai don't work on bigmodel.cn
  and vice versa. Create your key on the platform for your region.

- **Coding endpoint optimized for tools**: The coding endpoints have better
  tool-calling performance and are recommended for use with coding assistants.

- **GLM models**: Models are available as `{provider}/glm-4.7`, `{provider}/glm-4.6`, etc.
  See [/providers/glm](/providers/glm) for the model family overview.

- **Authentication**: All variants use Bearer token auth with your API key.
