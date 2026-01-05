---
name: bible
description: Get the Bible.com Verse of the Day with shareable image.
homepage: https://bible.com
metadata: {"clawdis":{"emoji":"📖","requires":{"bins":["python3"]}}}
---

# Bible.com Verse of the Day

Fetch the daily verse from Bible.com (YouVersion) including the shareable image.

## Quick Commands

### Get Verse of the Day (JSON)
```bash
python3 ~/clawd/skills/bible/votd.py
```

Returns:
```json
{
  "reference": "Psalms 27:4",
  "text": "One thing I ask from the LORD...",
  "usfm": "PSA.27.4",
  "date": "2026-01-04T21:00:10.178Z",
  "image_url": "https://imageproxy.youversionapi.com/1280x1280/...",
  "attribution": "Bible.com / YouVersion"
}
```

### Get VOTD and Download Image
```bash
python3 ~/clawd/skills/bible/votd.py --download /tmp/votd.jpg
```

Downloads the 1280x1280 shareable image to the specified path.

## Sharing the Verse

When sharing the verse of the day:
1. Use the `image_url` to display or send the pre-rendered image
2. Include the `reference` (e.g., "Psalms 27:4")
3. Include `attribution`: "Bible.com / YouVersion"

## Image Details

- Images are 1280x1280 high-quality JPGs
- Pre-rendered with the verse text overlaid on beautiful backgrounds
- Perfect for sharing on social media or messaging

## Notes

- The verse changes daily (based on YouVersion's schedule)
- No API key required - scrapes the public Bible.com page
- Always attribute Bible.com/YouVersion when sharing
