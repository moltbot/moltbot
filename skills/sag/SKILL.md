---
name: sag
description: ElevenLabs text-to-speech with mac-style say UX. Send voice notes via Telegram.
homepage: https://sag.sh
metadata: {"openclaw":{"emoji":"🗣️","requires":{"bins":["sag"],"env":["ELEVENLABS_API_KEY"]},"primaryEnv":"ELEVENLABS_API_KEY","install":[{"id":"brew","kind":"brew","formula":"steipete/tap/sag","bins":["sag"],"label":"Install sag (brew)"}]}}
---

# SAG - ElevenLabs TTS CLI

**The way to send Elie voice notes.** Simple, fast, high quality.

## Quick Start

```bash
# Basic voice note (female voice by ID, 1.4x faster)
sag -v "EXAVITQu4vr4xnSDxMaL" -o /tmp/voice.opus "Hey Elie, quick update on the project."

# List available voices
sag voices
```

## Send to Elie (Telegram)

```bash
# Generate voice (1.4x faster = --rate 200)
# Use VOICE ID for reliable matching (names can fail)
sag -v "EXAVITQu4vr4xnSDxMaL" --rate 200 -o /tmp/voice.opus "Your message here"

# Send via message tool
message action=send media=/tmp/voice.opus target=733180662
```

## Speed Options

| Speed | Rate Flag | Use Case |
|-------|-----------|----------|
| Normal | `--rate 100` | Default |
| **1.4x faster** | `--rate 200` | **Elie's preferred** |
| 2x faster | `--rate 300` | Quick updates |

```bash
# Elie's preferred: Sarah (voice ID), 1.4x faster
sag -v "EXAVITQu4vr4xnSDxMaL" --rate 200 -o /tmp/voice.opus "Quick update: [short pause] All systems operational."
```

## Available Female Voices (by ID)

| Voice ID | Name | Style |
|----------|------|-------|
| `EXAVITQu4vr4xnSDxMaL` | **Sarah** | Mature, Reassuring, Confident ✅ **Default** |
| `FGY2WhTYpPnrIDTdsKH5` | Laura | Enthusiast, Quirky |
| `Xb7hH8MSUJpSbSDYk0k2` | Alice | Clear, Engaging Educator |

**Always use VOICE ID** — names can fail due to fuzzy matching.

## Audio Tags (v3 only)

Add at start of lines for expression:

```
[whispers]   [shouts]   [sings]
[laughs]     [sighs]    [excited]
[sarcastic]  [curious]  [crying]
[short pause] [long pause]
```

Example:
```bash
sag "[whispers] I found something interesting. [short pause] Look at this data."
```

## Best Practices

1. **Keep messages under 2 minutes** — longer = longer generation time
2. **Add pauses** — `[short pause]` for breathing room
3. **Exaggerate emotion** — ElevenLabs v3 is expressive
4. **SSML-free** — use `[pause]` tags instead of `<break>`

## Elie's Preferred (1.4x faster, Female voice by ID)

```bash
# Quick update voice note (Sarah, voice ID, 1.4x faster)
sag -v "EXAVITQu4vr4xnSDxMaL" --rate 200 -o /tmp/voice.opus "Quick update: [short pause] All systems operational."

# Report style (Laura, female)
sag -v "FGY2WhTYpPnrIDTdsKH5" --rate 200 -o /tmp/report.opus "Daily report: [short pause] Three critical signals detected."
```

## Troubleshooting

- **Slow generation?** Use `--model eleven_flash_v2_5` for speed
- **Wrong pronunciation?** Add hyphens: "elie-HAB-ib" not "Elie Habib"
- **Not working?** Check `echo $ELEVENLABS_API_KEY` is set
