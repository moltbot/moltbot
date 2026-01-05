---
name: radarr
description: Control Radarr - search movies, manage library, monitor downloads.
homepage: https://radarr.video
metadata: {"clawdis":{"emoji":"🎥","requires":{"bins":["curl"],"env":["RADARR_API_KEY"]},"primaryEnv":"RADARR_API_KEY"}}
---

# Radarr

Control Radarr movie management.

Server: `$RADARR_SERVER` (default: http://192.168.4.84:7878)
API Key: `$RADARR_API_KEY`

## Common Commands

### Get All Movies
```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" "$RADARR_SERVER/api/v3/movie"
```

### Search for Movie to Add
```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" "$RADARR_SERVER/api/v3/movie/lookup?term=MOVIE_NAME"
```

### Get Download Queue
```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" "$RADARR_SERVER/api/v3/queue"
```

### Get Calendar (Upcoming Releases)
```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" "$RADARR_SERVER/api/v3/calendar"
```

### Get Missing Movies (Wanted)
```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" "$RADARR_SERVER/api/v3/wanted/missing"
```

### Get System Status
```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" "$RADARR_SERVER/api/v3/system/status"
```

### Get Disk Space
```bash
curl -s -H "X-Api-Key: $RADARR_API_KEY" "$RADARR_SERVER/api/v3/diskspace"
```

### Search for Movie Downloads (trigger search)
```bash
curl -s -X POST -H "X-Api-Key: $RADARR_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"MoviesSearch","movieIds":[MOVIE_ID]}' \
  "$RADARR_SERVER/api/v3/command"
```

## Notes

- API version is v3
- Movie IDs are integers - use lookup to find them
- Always confirm before triggering searches or adding movies
