---
name: sabnzbd
description: Control SABnzbd - monitor downloads, manage queue, check history.
homepage: https://sabnzbd.org
metadata: {"clawdis":{"emoji":"📥","requires":{"bins":["curl"],"env":["SABNZBD_API_KEY"]},"primaryEnv":"SABNZBD_API_KEY"}}
---

# SABnzbd

Control SABnzbd download manager.

Server: `$SABNZBD_SERVER` (default: http://192.168.4.84:8080)
API Key: `$SABNZBD_API_KEY`

## Common Commands

### Get Queue Status
```bash
curl -s "$SABNZBD_SERVER/api?mode=queue&output=json&apikey=$SABNZBD_API_KEY"
```

### Get Download History
```bash
curl -s "$SABNZBD_SERVER/api?mode=history&output=json&apikey=$SABNZBD_API_KEY"
```

### Get Speed/Status Summary
```bash
curl -s "$SABNZBD_SERVER/api?mode=qstatus&output=json&apikey=$SABNZBD_API_KEY"
```

### Pause Downloads
```bash
curl -s "$SABNZBD_SERVER/api?mode=pause&output=json&apikey=$SABNZBD_API_KEY"
```

### Resume Downloads
```bash
curl -s "$SABNZBD_SERVER/api?mode=resume&output=json&apikey=$SABNZBD_API_KEY"
```

### Get Server Stats
```bash
curl -s "$SABNZBD_SERVER/api?mode=server_stats&output=json&apikey=$SABNZBD_API_KEY"
```

### Set Speed Limit (KB/s, 0 = unlimited)
```bash
curl -s "$SABNZBD_SERVER/api?mode=config&name=speedlimit&value=5000&output=json&apikey=$SABNZBD_API_KEY"
```

## Notes

- Always use `output=json` for parseable responses
- NZO_ID is the unique identifier for each download job
- Speed is shown in bytes/second in API responses
