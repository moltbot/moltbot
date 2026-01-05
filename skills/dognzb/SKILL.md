---
name: dognzb
description: Search DOGnzb Usenet indexer for NZBs - find movies, TV shows, and other content.
homepage: https://dognzb.cr
metadata: {"clawdis":{"emoji":"🐕","requires":{"bins":["curl"],"env":["DOGNZB_API_KEY"]},"primaryEnv":"DOGNZB_API_KEY"}}
---

# DOGnzb

Search DOGnzb Usenet indexer for NZB files.

Server: `https://api.dognzb.cr`
API Key: `$DOGNZB_API_KEY`

## Common Commands

### Search for Content
```bash
curl -s "https://api.dognzb.cr/api?t=search&q=SEARCH_TERM&apikey=$DOGNZB_API_KEY&o=json"
```

### Search Movies
```bash
curl -s "https://api.dognzb.cr/api?t=movie&q=MOVIE_NAME&apikey=$DOGNZB_API_KEY&o=json"
```

### Search TV Shows
```bash
curl -s "https://api.dognzb.cr/api?t=tvsearch&q=SHOW_NAME&apikey=$DOGNZB_API_KEY&o=json"
```

### Search TV by Season/Episode
```bash
curl -s "https://api.dognzb.cr/api?t=tvsearch&q=SHOW_NAME&season=1&ep=5&apikey=$DOGNZB_API_KEY&o=json"
```

### Search by IMDB ID
```bash
curl -s "https://api.dognzb.cr/api?t=movie&imdbid=tt1234567&apikey=$DOGNZB_API_KEY&o=json"
```

### Search by TVDB ID
```bash
curl -s "https://api.dognzb.cr/api?t=tvsearch&tvdbid=123456&apikey=$DOGNZB_API_KEY&o=json"
```

### Get NZB Download Link
```bash
# From search results, use the guid to construct download URL:
# https://api.dognzb.cr/api?t=get&id=GUID&apikey=$DOGNZB_API_KEY
```

### Get Categories
```bash
curl -s "https://api.dognzb.cr/api?t=caps&apikey=$DOGNZB_API_KEY&o=json"
```

## Category IDs

Common categories for filtering searches:
- 2000: Movies
- 2010: Movies/Foreign
- 2020: Movies/Other
- 2030: Movies/SD
- 2040: Movies/HD
- 2045: Movies/UHD
- 2050: Movies/BluRay
- 2060: Movies/3D
- 5000: TV
- 5020: TV/Foreign
- 5030: TV/SD
- 5040: TV/HD
- 5045: TV/UHD
- 5050: TV/Other
- 5060: TV/Sport
- 5070: TV/Anime
- 5080: TV/Documentary

### Search with Category Filter
```bash
curl -s "https://api.dognzb.cr/api?t=search&q=TERM&cat=2040&apikey=$DOGNZB_API_KEY&o=json"
```

## Notes

- Always use `&o=json` for JSON output (default is XML)
- Results include title, size, category, and download guid
- Can send NZB directly to SABnzbd using the download URL
- Rate limits may apply - don't spam searches
