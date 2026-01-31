# Zhipu GLM Support for OpenClaw

Zhipu GLM support has been added to OpenClaw! You can now use Zhipu AI's GLM models (智谱 AI).

## Supported Models

- **glm-4-flash** - GLM-4-Flash (default, fast and efficient)
- **glm-4v-flash** - GLM-4V-Flash (vision model, supports text + images)
- **glm-4-plus** - GLM-4-Plus (enhanced version)
- **glm-4-air** - GLM-4-Air (lightweight version)
- **glm-4-airx** - GLM-4-AirX (ultra-lightweight)
- **glm-4-7** - GLM-4-7 (7B parameters, 198K context)
- **glm-4-long** - GLM-4-Long (1M context window)

## Setup

### Option 1: Environment Variable

Set your Zhipu API key as an environment variable:

```bash
export ZHIPU_API_KEY="your-zhipu-api-key-here"
```

Then restart the OpenClaw gateway.

### Option 2: Manual Configuration

Add to your `~/.openclaw/config.json`:

```json
{
  "models": {
    "providers": {
      "zhipu": {
        "apiKey": "your-zhipu-api-key-here",
        "baseUrl": "https://open.bigmodel.cn/api/paas/v4",
        "api": "openai-completions"
      }
    }
  },
  "agents": {
    "defaults": {
      "model": "zhipu/glm-4-flash"
    }
  }
}
```

### Option 3: Auth Profile

Use the OpenClaw CLI to add a Zhipu auth profile:

```bash
openclaw auth add --provider zhipu --type api-key
```

Then enter your API key when prompted.

## Usage

Once configured, you can use Zhipu models by specifying the provider and model:

```bash
# Use GLM-4-Flash (text)
openclaw agent --model zhipu/glm-4-flash --message "Hello"

# Use GLM-4V-Flash (vision)
openclaw agent --model zhipu/glm-4v-flash --message "Describe this image" --image photo.jpg

# Use GLM-4-Plus
openclaw agent --model zhipu/glm-4-plus --message "Explain quantum computing"

# Use GLM-4-7 (7B model with 198K context)
openclaw agent --model zhipu/glm-4-7 --message "Analyze this long document"

# Use GLM-4-Long (1M context window!)
openclaw agent --model zhipu/glm-4-long --message "Summarize this entire book"
```

## API Key

Get your Zhipu API key from:
- Website: https://open.bigmodel.cn/
- Documentation: https://open.bigmodel.cn/dev/api

## Model Details

| Model ID | Name | Context Window | Max Tokens | Input Types |
|----------|------|----------------|------------|-------------|
| glm-4-flash | GLM-4-Flash | 128K | 8K | Text |
| glm-4v-flash | GLM-4V-Flash | 128K | 8K | Text, Image |
| glm-4-plus | GLM-4-Plus | 128K | 8K | Text |
| glm-4-air | GLM-4-Air | 128K | 8K | Text |
| glm-4-airx | GLM-4-AirX | 8K | 8K | Text |
| glm-4-7 | GLM-4-7 | 198K | 128K | Text |
| glm-4-long | GLM-4-Long | 1M | 128K | Text |

## Notes

- The Zhipu provider uses OpenAI-compatible API format
- All pricing information defaults to 0 (free tier or manual override in config)
- Vision model (glm-4v-flash) supports both text and image inputs
- Base URL: `https://open.bigmodel.cn/api/paas/v4`

---

**Added:** 2026-01-31
**Status:** ✅ Working
