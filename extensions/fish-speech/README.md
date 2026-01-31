# @openclaw/fish-speech

Fish-Speech TTS provider plugin for OpenClaw with voice cloning support.

## Features

- **Self-hosted Fish-Speech** server support
- **Fish Audio cloud** API support
- **Voice cloning** via reference audio
- **OpenAI-compatible adapter** for immediate use
- Configurable temperature, speed, and volume
- Support for MP3, Opus, WAV, and PCM output

## Installation

```bash
openclaw plugins install @openclaw/fish-speech
```

Or add to your `openclaw.json`:

```json5
{
  plugins: {
    entries: {
      "fish-speech": {
        enabled: true,
        config: {
          baseUrl: "http://192.168.1.4:8080"
        }
      }
    }
  }
}
```

## Quick Start

### Option 1: OpenAI-Compatible Adapter (Works Now)

Until OpenClaw core adds TTS provider plugin support, use the included adapter:

```bash
# Start the adapter
FISH_SPEECH_URL=http://192.168.1.4:8080 npx @openclaw/fish-speech adapter

# Configure OpenClaw to use it
export OPENAI_TTS_BASE_URL=http://localhost:8881/v1
```

Then use TTS normally:
```
/tts provider openai
/tts on
```

### Option 2: Native Plugin (Requires Core Support)

Once OpenClaw supports `registerTtsProvider`:

```json5
{
  messages: {
    tts: {
      auto: "always",
      provider: "fish-speech"
    }
  },
  plugins: {
    entries: {
      "fish-speech": {
        enabled: true,
        config: {
          baseUrl: "http://192.168.1.4:8080",
          temperature: 0.7,
          speed: 1.0
        }
      }
    }
  }
}
```

## Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | string | `http://localhost:8080` | Fish-Speech API URL |
| `apiKey` | string | - | Fish Audio cloud API key |
| `model` | string | `speech-1.6` | Model to use |
| `referenceId` | string | - | Voice reference ID for cloning |
| `temperature` | number | `0.7` | Sampling temperature (0-1) |
| `speed` | number | `1.0` | Speech speed (0.5-2.0) |
| `volume` | number | `1.0` | Volume (0.1-2.0) |
| `chunkLength` | number | `200` | Text chunk size (100-300) |
| `normalize` | boolean | `true` | Enable text normalization |

## Voice Cloning

### Using Fish Audio Cloud

1. Find or create a voice model at [fish.audio](https://fish.audio)
2. Copy the model ID
3. Configure:

```json5
{
  plugins: {
    entries: {
      "fish-speech": {
        config: {
          baseUrl: "https://api.fish.audio",
          apiKey: "${FISH_AUDIO_API_KEY}",
          referenceId: "7f92f8af-your-voice-id"
        }
      }
    }
  }
}
```

### Using Self-Hosted Server

1. Prepare reference audio (10-60 seconds, WAV format)
2. Upload to your Fish-Speech server:
   ```bash
   scp voice.wav server:/path/to/fish-speech/references/
   ```
3. Create a model reference (see Fish-Speech docs)
4. Use the reference ID in config

## Deploying Fish-Speech

### Docker (Recommended)

```yaml
# docker-compose.yml
services:
  fish-speech:
    image: fishaudio/fish-speech:latest-server-cuda
    container_name: fish-speech-tts
    restart: unless-stopped
    runtime: nvidia
    environment:
      - NVIDIA_VISIBLE_DEVICES=all
      - API_PORT=8080
    ports:
      - "8080:8080"
    volumes:
      - ./checkpoints:/app/checkpoints
      - ./references:/app/references
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

**Requirements:**
- NVIDIA GPU with 11GB+ VRAM
- CUDA drivers
- Docker with nvidia-container-toolkit

### Without Docker

See [Fish-Speech documentation](https://github.com/fishaudio/fish-speech).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `FISH_SPEECH_URL` | Fish-Speech server URL |
| `FISH_AUDIO_API_KEY` | Fish Audio cloud API key |
| `FISH_SPEECH_API_KEY` | Alternative API key var |
| `ADAPTER_PORT` | OpenAI adapter port (default: 8881) |

## Troubleshooting

### Connection Refused

1. Check if Fish-Speech is running:
   ```bash
   curl http://your-server:8080/health
   ```

2. Check firewall rules

3. For Docker, ensure the port is exposed

### Out of Memory

Fish-Speech requires 11-12GB VRAM. Options:
- Use a GPU with more VRAM
- Reduce batch size in Fish-Speech config
- Use Fish Audio cloud instead

### Poor Quality Output

- Use higher quality reference audio (clean, 10-30s)
- Adjust temperature (lower = more stable)
- Try different chunk_length values

## API Reference

### TTS Endpoint

**POST** `/v1/tts`

```json
{
  "text": "Hello, world!",
  "format": "mp3",
  "reference_id": "optional-voice-id",
  "temperature": 0.7,
  "speed": 1.0
}
```

### OpenAI-Compatible Endpoint

**POST** `/v1/audio/speech`

```json
{
  "input": "Hello, world!",
  "voice": "alloy",
  "model": "tts-1",
  "response_format": "mp3"
}
```

## Contributing

See the [OpenClaw contributing guide](https://docs.openclaw.ai/contributing).

## License

MIT - see [LICENSE](./LICENSE)

## Links

- [Fish-Speech GitHub](https://github.com/fishaudio/fish-speech)
- [Fish Audio](https://fish.audio)
- [Fish-Speech Docs](https://docs.fish.audio)
- [OpenClaw Docs](https://docs.openclaw.ai)
