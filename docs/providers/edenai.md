---
summary: "Use Eden AI's unified API to access many models in Clawdbot"
read_when:
  - You want a European multi-provider API gateway
  - You want a single API key for many LLMs
---
# Eden AI

Eden AI provides a **unified API** that routes requests to many models behind a single
endpoint and API key. It is OpenAI-compatible and based in Europe.

## CLI setup

```bash
clawdbot onboard --auth-choice edenai-api-key
```

Or non-interactive:

```bash
clawdbot onboard --auth-choice apiKey --token-provider edenai --token "$EDENAI_API_KEY"
```

## Config snippet

```json5
{
  env: { EDENAI_API_KEY: "..." },
  agents: {
    defaults: {
      model: { primary: "edenai/anthropic/claude-sonnet-4-5" }
    }
  }
}
```

## Supported providers

Eden AI supports: Anthropic, OpenAI, Mistral, Google, and more.

## Example models

- `edenai/anthropic/claude-sonnet-4-5` - Claude Sonnet 4.5
- `edenai/openai/gpt-4o` - GPT-4o
- `edenai/openai/gpt-4o-mini` - GPT-4o Mini (cheaper)
- `edenai/mistral/mistral-large-latest` - Mistral Large
- `edenai/mistral/mistral-small-latest` - Mistral Small

## Expert models

Beyond LLMs, Eden AI provides access to specialized **expert models** optimized for specific tasks:

- **Video analysis** - person tracking, object tracking, text detection, explicit content detection
- **OCR** - document parsing, invoice extraction, ID recognition
- **Image generation** - text-to-image across multiple providers
- **Video generation** - text-to-video and image-to-video
- **Speech-to-text** - transcription and dictation
- **Text-to-speech** - voice synthesis
- **Content moderation** - explicit content detection, AI-generated content detection

Integration of these expert models into Clawdbot skills is coming soon.

## Notes

- Model refs are `edenai/<provider>/<model>` (e.g., `edenai/openai/gpt-4o`).
- For more model/provider options, see [/concepts/model-providers](/concepts/model-providers).
- Eden AI uses Bearer token authentication.

## Links

- [Eden AI website](https://www.edenai.co/)
- [Eden AI documentation](https://docs.edenai.co/)
- [Supported models](https://app.edenai.run/models)
- [Get your API key](https://app.edenai.run/admin/account/settings)
