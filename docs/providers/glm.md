---
summary: "GLM model family overview + how to use it in OpenClaw"
read_when:
  - You want GLM models in OpenClaw
  - You need the model naming convention and setup
---

# GLM models

GLM is a **model family** developed by Zhipu AI. GLM models are available through two platforms:

- **Z.AI** (api.z.ai) - International platform
- **Zhipu AI** (bigmodel.cn) - China mainland platform

## Provider Options

| Provider       | Platform             | Use Case                 |
| -------------- | -------------------- | ------------------------ |
| `zai`          | Z.AI (International) | Pay-as-you-go            |
| `zai-coding`   | Z.AI (International) | Coding Plan subscription |
| `zhipu`        | Zhipu AI (China)     | Pay-as-you-go            |
| `zhipu-coding` | Zhipu AI (China)     | Coding Plan subscription |

## CLI Setup

```bash
# International users
openclaw onboard --auth-choice zai-api-key

# China users
openclaw onboard --auth-choice zhipu-api-key
```

## Config Snippet

```json5
{
  env: { ZAI_API_KEY: "sk-..." },
  agents: { defaults: { model: { primary: "zai/glm-4.7" } } },
}
```

## Available Models

- `glm-4.7` - Latest flagship model (205K context)
- `glm-4.6` - Previous generation (205K context)
- `glm-4.6v` - Vision model (128K context)
- `glm-4.5` - Balanced performance (131K context)
- `glm-4.5-air` - Lighter variant (131K context)
- `glm-4.5-flash` - Faster variant (131K context)

Model availability may vary by region; check the platform docs for the latest.

## Notes

- Model IDs follow the pattern `{provider}/glm-{version}` (e.g., `zai/glm-4.7`, `zhipu/glm-4.7`)
- For detailed provider setup, see [/providers/zai](/providers/zai)
