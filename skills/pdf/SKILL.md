---
name: pdf
description: Read and extract text from PDF files.
homepage: https://poppler.freedesktop.org/
metadata: {"clawdis":{"emoji":"📄","requires":{"bins":["pdftotext"]}}}
---

# PDF Reader

Extract text content from PDF files using poppler's pdftotext.

## Read Entire PDF

```bash
pdftotext "path/to/file.pdf" -
```

The `-` outputs to stdout instead of a file.

## Read Specific Pages

```bash
# First page only
pdftotext -f 1 -l 1 "file.pdf" -

# Pages 2-5
pdftotext -f 2 -l 5 "file.pdf" -
```

## Preserve Layout

```bash
# Maintain original text layout/formatting
pdftotext -layout "file.pdf" -
```

## Get PDF Info

```bash
pdfinfo "file.pdf"
```

Shows page count, size, metadata, etc.

## Common Options

- `-f N` - First page to extract (default: 1)
- `-l N` - Last page to extract (default: last page)
- `-layout` - Preserve physical layout of text
- `-raw` - Keep strings in content stream order
- `-enc UTF-8` - Set output encoding (default: UTF-8)

## For Scanned/Image PDFs

If pdftotext returns empty (scanned document), use OCR:

```bash
# Check if tesseract is available
which tesseract

# OCR a scanned PDF (requires tesseract)
ocrmypdf input.pdf output.pdf
pdftotext output.pdf -
```

## Notes

- Works best on text-based PDFs (not scanned images)
- For scanned documents, OCR is required
- Output is plain text - formatting like tables may not align perfectly
