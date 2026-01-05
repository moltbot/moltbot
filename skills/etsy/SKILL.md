---
name: etsy
description: Manage Etsy shop listings, search products, and view stats via Etsy Open API v3.
homepage: https://developer.etsy.com/documentation/
metadata: {"clawdis":{"emoji":"🛒","requires":{"bins":["uv"],"env":["ETSY_API_KEY","ETSY_SHOP_ID"]},"primaryEnv":"ETSY_API_KEY"}}
---

# Etsy Shop CLI

Manage Etsy shops via the Open API v3.

## Setup

1. Get an API key from [Etsy Developer Portal](https://www.etsy.com/developers/your-apps)
2. Find your Shop ID (it's in your shop URL or API response)
3. Set environment variables:
   - `ETSY_API_KEY` - Your Etsy API key (keystring)
   - `ETSY_SHOP_ID` - Your shop's numeric ID

## Commands

### Get Shop Info
```bash
uv run {baseDir}/scripts/etsy.py shop
uv run {baseDir}/scripts/etsy.py shop --json
```

### List Active Listings
```bash
uv run {baseDir}/scripts/etsy.py listings
uv run {baseDir}/scripts/etsy.py listings -n 25        # Get 25 listings
uv run {baseDir}/scripts/etsy.py listings --json       # JSON output
```

### Search Listings
```bash
uv run {baseDir}/scripts/etsy.py search "christmas pattern"
uv run {baseDir}/scripts/etsy.py search "vintage" -n 5
uv run {baseDir}/scripts/etsy.py search "floral" --json
```

### Get Specific Listing
```bash
uv run {baseDir}/scripts/etsy.py listing <LISTING_ID>
uv run {baseDir}/scripts/etsy.py listing 1234567890 --json
```

### Get Shop Stats
```bash
uv run {baseDir}/scripts/etsy.py stats
uv run {baseDir}/scripts/etsy.py stats --json
```

## Environment Variables

Configure in `~/.clawdis/clawdis.json`:
```json
{
  "skills": {
    "entries": {
      "etsy": {
        "env": {
          "ETSY_API_KEY": "your-etsy-api-keystring",
          "ETSY_SHOP_ID": "12345678"
        }
      }
    }
  }
}
```

## Configured Shops

### Patterns4Printing (Lisbeth)
```bash
ETSY_API_KEY=$ETSY_API_KEY_P4P ETSY_SHOP_ID=$ETSY_SHOP_ID_P4P uv run {baseDir}/scripts/etsy.py shop
```

### Custom Canvas Curators (Avery Thompson)
```bash
ETSY_API_KEY=$ETSY_API_KEY_CCC ETSY_SHOP_ID=$ETSY_SHOP_ID_CCC uv run {baseDir}/scripts/etsy.py shop
```

## Environment Variables

Configured in `~/.clawdis/clawdis.json`:
- `ETSY_API_KEY_P4P` / `ETSY_SHOP_ID_P4P` — Patterns4Printing (Lisbeth)
- `ETSY_API_KEY_CCC` / `ETSY_SHOP_ID_CCC` — Custom Canvas Curators (Avery)
- Default `ETSY_API_KEY` / `ETSY_SHOP_ID` — Points to P4P

## API Limits

- Etsy API has rate limits (varies by endpoint)
- Most endpoints return max 100 results per request
- Some stats/analytics endpoints require OAuth2 (not just API key)

## Notes

- API key authentication works for public shop data
- Private data (orders, receipts, finances) requires OAuth2 flow
- Prices returned in cents (divided by 100 in display)
