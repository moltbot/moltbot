---
name: pptx
description: Parse PowerPoint files with rich extraction - text, structure, tables, and metadata. Outputs JSON or Markdown.
homepage: https://python-pptx.readthedocs.io
metadata:
  clawdbot:
    emoji: "📊"
    requires:
      bins: ["python3", "uv"]
---

# PowerPoint Parser

Extract structured content from PPTX files including text, tables, speaker notes, and metadata.

## Commands

### Extract to JSON (structured)
```bash
uv run skills/pptx/scripts/pptx_parser.py extract <file.pptx> --json
```

### Extract to Markdown (readable)
```bash
uv run skills/pptx/scripts/pptx_parser.py extract <file.pptx> --markdown
```

### Get Metadata Only
```bash
uv run skills/pptx/scripts/pptx_parser.py info <file.pptx>
```

### Extract Specific Slides
```bash
uv run skills/pptx/scripts/pptx_parser.py extract <file.pptx> --slides 1-5,10
```

## Output Structure (JSON)

```json
{
  "metadata": {
    "title": "Reference Guide",
    "author": "One Point",
    "slide_count": 38,
    "created": "2025-11-01"
  },
  "slides": [
    {
      "number": 1,
      "title": "Reference Guide: Carleton-Willard Village",
      "content": ["November 2025"],
      "notes": "Speaker notes here",
      "tables": []
    }
  ],
  "extracted": {
    "contacts": [...],
    "goals": [...],
    "timeline": [...],
    "key_metrics": [...]
  }
}
```

## Use Cases

- Parse One Point client reference guides
- Extract community data for CRM import
- Search across presentation content
- Generate summaries from slide content

## Integration

Combine with Twenty CRM skill to auto-populate community records:
```bash
uv run skills/pptx/scripts/pptx_parser.py extract file.pptx --json | \
  uv run skills/pptx/scripts/sync_to_twenty.py --community "Carleton-Willard"
```
