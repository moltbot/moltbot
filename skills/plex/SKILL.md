---
name: plex
description: Control Plex Media Server - browse libraries, search, play media, manage playback.
homepage: https://plex.tv
metadata: {"clawdis":{"emoji":"🎬","requires":{"bins":["curl"],"env":["PLEX_TOKEN"]},"primaryEnv":"PLEX_TOKEN"}}
---

# Plex Media Server

Control Plex Media Server using the Plex API.

Server: `$PLEX_SERVER` (default: http://192.168.4.84:32400)
Token: `$PLEX_TOKEN`

## Common Commands

### Get Server Info
```bash
curl -s "$PLEX_SERVER/?X-Plex-Token=$PLEX_TOKEN"
```

### Browse Libraries
```bash
curl -s "$PLEX_SERVER/library/sections?X-Plex-Token=$PLEX_TOKEN"
```

### List Library Contents (use section key from above, e.g., 1 for Movies)
```bash
curl -s "$PLEX_SERVER/library/sections/1/all?X-Plex-Token=$PLEX_TOKEN"
```

### Search
```bash
curl -s "$PLEX_SERVER/search?query=SEARCH_TERM&X-Plex-Token=$PLEX_TOKEN"
```

### Get Recently Added
```bash
curl -s "$PLEX_SERVER/library/recentlyAdded?X-Plex-Token=$PLEX_TOKEN"
```

### Get On Deck (Continue Watching)
```bash
curl -s "$PLEX_SERVER/library/onDeck?X-Plex-Token=$PLEX_TOKEN"
```

### Get Active Sessions (What's Playing Now)
```bash
curl -s "$PLEX_SERVER/status/sessions?X-Plex-Token=$PLEX_TOKEN"
```

### List Available Clients/Players
```bash
curl -s "$PLEX_SERVER/clients?X-Plex-Token=$PLEX_TOKEN"
```

## Notes

- API returns XML by default; add `-H "Accept: application/json"` for JSON
- Library section keys (1, 2, 3...) vary by server setup - list sections first
- Media keys look like `/library/metadata/12345`
- Always confirm before starting playback on a device
