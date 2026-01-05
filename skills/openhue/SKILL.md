---
name: openhue
description: Control Philips Hue lights/scenes via the OpenHue CLI or direct API.
homepage: https://www.openhue.io/cli
metadata: {"clawdis":{"emoji":"💡","requires":{"bins":["openhue","curl"]}}}
---

# Philips Hue Control

Control Hue lights and scenes via the Hue Bridge.

## Configuration

- Bridge IP: `192.168.4.95`
- API Key: `wBofLHrogQ4ocqfuhuZ671nLsaRWBqjO3jOEjDcJ`
- Config file: `~/.openhue/config.yaml`

## OpenHue CLI (preferred)

### Read
- `openhue get light --json`
- `openhue get room --json`
- `openhue get scene --json`

### Write
- Turn on: `openhue set light <id-or-name> --on`
- Turn off: `openhue set light <id-or-name> --off`
- Brightness: `openhue set light <id> --on --brightness 50`
- Color: `openhue set light <id> --on --rgb #3399FF`
- Scene: `openhue set scene <scene-id>`

## Direct API Fallback (if CLI fails)

Use these curl commands if openhue CLI has connection issues:

### Get all lights
```bash
curl -k -s "https://192.168.4.95/clip/v2/resource/light" -H "hue-application-key: wBofLHrogQ4ocqfuhuZ671nLsaRWBqjO3jOEjDcJ"
```

### Get all rooms
```bash
curl -k -s "https://192.168.4.95/clip/v2/resource/room" -H "hue-application-key: wBofLHrogQ4ocqfuhuZ671nLsaRWBqjO3jOEjDcJ"
```

### Turn light on
```bash
curl -k -s -X PUT "https://192.168.4.95/clip/v2/resource/light/<LIGHT_ID>" \
  -H "hue-application-key: wBofLHrogQ4ocqfuhuZ671nLsaRWBqjO3jOEjDcJ" \
  -H "Content-Type: application/json" \
  -d '{"on":{"on":true}}'
```

### Turn light off
```bash
curl -k -s -X PUT "https://192.168.4.95/clip/v2/resource/light/<LIGHT_ID>" \
  -H "hue-application-key: wBofLHrogQ4ocqfuhuZ671nLsaRWBqjO3jOEjDcJ" \
  -H "Content-Type: application/json" \
  -d '{"on":{"on":false}}'
```

### Set brightness (0-100)
```bash
curl -k -s -X PUT "https://192.168.4.95/clip/v2/resource/light/<LIGHT_ID>" \
  -H "hue-application-key: wBofLHrogQ4ocqfuhuZ671nLsaRWBqjO3jOEjDcJ" \
  -H "Content-Type: application/json" \
  -d '{"on":{"on":true},"dimming":{"brightness":50}}'
```

## Rooms

- Master Suite (bedroom lights)
- Kate's Room
- Living Room
- And others...

## Notes

- Always use `-k` flag with curl (self-signed cert)
- Light IDs are UUIDs from the API response
- If openhue CLI fails with "no route to host", use the curl fallback
