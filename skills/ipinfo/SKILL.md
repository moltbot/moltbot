---
name: ipinfo
description: Perform IP geolocation lookups using ipinfo.io API. Convert IP addresses to geographic data including city, region, country, postal code, timezone, and coordinates. Use when geolocating IPs, enriching IP data, or analyzing geographic distribution.
homepage: https://ipinfo.io
metadata:
  { "openclaw": { "emoji": "🌍", "requires": { "bins": ["curl"] }, "primaryEnv": "IPINFO_TOKEN" } }
---

# IPinfo Geolocation

Free IP geolocation API. No API key required for basic usage (50k requests/month), optional token for higher limits.

## Configuration

The `IPINFO_TOKEN` environment variable is **optional** - the skill works without it using the free tier. Configure it via the OpenClaw dashboard UI for higher rate limits, or set it manually:

- **Dashboard UI**: Configure `IPINFO_TOKEN` in the OpenClaw dashboard (optional)
- **Environment variable**: `export IPINFO_TOKEN="your-token"`
- **Query parameter**: `?token=YOUR_TOKEN` (for one-off requests)

## Quick Lookup

Single IP:

```bash
curl -s "https://ipinfo.io/8.8.8.8"
```

Current IP:

```bash
curl -s "https://ipinfo.io/json"
```

With token (optional, from environment):

```bash
curl -s "https://ipinfo.io/8.8.8.8?token=${IPINFO_TOKEN}"
```

Or pass token directly:

```bash
curl -s "https://ipinfo.io/8.8.8.8?token=YOUR_TOKEN"
```

## Response Format

JSON response includes:

- `ip`: IP address
- `hostname`: Reverse DNS hostname
- `city`: City name
- `region`: State/region
- `country`: Two-letter country code (ISO 3166-1 alpha-2)
- `postal`: Postal/ZIP code
- `timezone`: IANA timezone
- `loc`: Coordinates as "latitude,longitude"
- `org`: Organization/ASN information

## Extract Specific Fields

Using `jq`:

```bash
curl -s "https://ipinfo.io/8.8.8.8" | jq -r '.city, .country, .loc'
```

Country only:

```bash
curl -s "https://ipinfo.io/8.8.8.8" | jq -r '.country'
```

Parse coordinates:

```bash
curl -s "https://ipinfo.io/8.8.8.8" | jq -r '.loc' | tr ',' '\n'
```

## Batch Processing

Process multiple IPs:

```bash
for ip in 8.8.8.8 1.1.1.1 208.67.222.222; do
  if [ -n "$IPINFO_TOKEN" ]; then
    echo "$ip: $(curl -s "https://ipinfo.io/$ip?token=$IPINFO_TOKEN" | jq -r '.city, .country' | tr '\n' ', ')"
  else
    echo "$ip: $(curl -s "https://ipinfo.io/$ip" | jq -r '.city, .country' | tr '\n' ', ')"
  fi
done
```

## Python Usage

```python
import os
import requests

# Without token (free tier)
response = requests.get("https://ipinfo.io/8.8.8.8")
data = response.json()
print(f"{data['city']}, {data['country']}")
print(f"Coordinates: {data['loc']}")
```

With token from environment:

```python
import os
import requests

token = os.getenv("IPINFO_TOKEN")
if token:
    response = requests.get("https://ipinfo.io/8.8.8.8", params={"token": token})
else:
    response = requests.get("https://ipinfo.io/8.8.8.8")
data = response.json()
```

Or pass token directly:

```python
response = requests.get("https://ipinfo.io/8.8.8.8", params={"token": "YOUR_TOKEN"})
```

## Rate Limits

- Free tier: 50,000 requests/month, ~1 req/sec
- With token: Higher limits based on plan
- Configure `IPINFO_TOKEN` via OpenClaw dashboard UI or environment variable

## Common Use Cases

- Geolocate IP addresses
- Enrich IP lists with location data
- Filter IPs by country
- Calculate distances between IPs using coordinates
- Timezone detection for IPs
