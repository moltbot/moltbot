---
name: sonarr
description: Control Sonarr - search TV shows, manage series, monitor downloads.
homepage: https://sonarr.tv
metadata: {"clawdis":{"emoji":"📺","requires":{"bins":["curl"],"env":["SONARR_API_KEY"]},"primaryEnv":"SONARR_API_KEY"}}
---

# Sonarr

Control Sonarr TV show management.

Server: `$SONARR_SERVER` (default: http://192.168.4.84:8989)
API Key: `$SONARR_API_KEY`

## Common Commands

### Get All Series
```bash
curl -s -H "X-Api-Key: $SONARR_API_KEY" "$SONARR_SERVER/api/v3/series"
```

### Search for Series to Add
```bash
curl -s -H "X-Api-Key: $SONARR_API_KEY" "$SONARR_SERVER/api/v3/series/lookup?term=SERIES_NAME"
```

### Get Download Queue
```bash
curl -s -H "X-Api-Key: $SONARR_API_KEY" "$SONARR_SERVER/api/v3/queue"
```

### Get Calendar (Upcoming Episodes)
```bash
curl -s -H "X-Api-Key: $SONARR_API_KEY" "$SONARR_SERVER/api/v3/calendar"
```

### Get Wanted/Missing Episodes
```bash
curl -s -H "X-Api-Key: $SONARR_API_KEY" "$SONARR_SERVER/api/v3/wanted/missing"
```

### Get System Status
```bash
curl -s -H "X-Api-Key: $SONARR_API_KEY" "$SONARR_SERVER/api/v3/system/status"
```

### Get Disk Space
```bash
curl -s -H "X-Api-Key: $SONARR_API_KEY" "$SONARR_SERVER/api/v3/diskspace"
```

### Get Episodes for Series
```bash
curl -s -H "X-Api-Key: $SONARR_API_KEY" "$SONARR_SERVER/api/v3/episode?seriesId=SERIES_ID"
```

### Search for Episode Downloads (trigger search)
```bash
curl -s -X POST -H "X-Api-Key: $SONARR_API_KEY" -H "Content-Type: application/json" \
  -d '{"name":"EpisodeSearch","episodeIds":[EPISODE_ID]}' \
  "$SONARR_SERVER/api/v3/command"
```

## Notes

- API version is v3
- Series IDs are integers - use lookup to find them
- Always confirm before triggering searches or adding series
