#!/usr/bin/env python3
"""
PowerPoint Parser - Rich extraction from PPTX files

Usage:
    pptx_parser.py extract <file> [--json|--markdown] [--slides RANGE]
    pptx_parser.py info <file>
    pptx_parser.py parse-community <file> [--json]
"""

import argparse
import json
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from pptx import Presentation
from pptx.util import Inches, Pt


def extract_text_from_shape(shape) -> str:
    """Extract text from a shape, handling text frames"""
    if not shape.has_text_frame:
        return ""
    
    paragraphs = []
    for paragraph in shape.text_frame.paragraphs:
        text = "".join(run.text for run in paragraph.runs).strip()
        if text:
            paragraphs.append(text)
    
    return "\n".join(paragraphs)


def extract_table(shape) -> list:
    """Extract table data as list of rows"""
    if not shape.has_table:
        return []
    
    table = shape.table
    rows = []
    for row in table.rows:
        cells = []
        for cell in row.cells:
            cells.append(cell.text.strip())
        rows.append(cells)
    
    return rows


def extract_slide(slide, slide_num: int) -> dict:
    """Extract all content from a single slide"""
    result = {
        "number": slide_num,
        "title": "",
        "content": [],
        "tables": [],
        "notes": ""
    }
    
    # Extract title
    if slide.shapes.title:
        result["title"] = slide.shapes.title.text.strip()
    
    # Extract content from all shapes
    for shape in slide.shapes:
        # Skip title shape (already extracted)
        if shape == slide.shapes.title:
            continue
        
        # Tables
        if shape.has_table:
            table_data = extract_table(shape)
            if table_data:
                result["tables"].append(table_data)
        
        # Text
        text = extract_text_from_shape(shape)
        if text and text != result["title"]:
            result["content"].append(text)
    
    # Speaker notes
    if slide.has_notes_slide:
        notes_frame = slide.notes_slide.notes_text_frame
        if notes_frame:
            result["notes"] = notes_frame.text.strip()
    
    return result


def extract_presentation(pptx_path: str, slide_range: Optional[str] = None) -> dict:
    """Extract full presentation content"""
    prs = Presentation(pptx_path)
    
    # Parse slide range if provided
    selected_slides = None
    if slide_range:
        selected_slides = set()
        for part in slide_range.split(","):
            if "-" in part:
                start, end = part.split("-")
                selected_slides.update(range(int(start), int(end) + 1))
            else:
                selected_slides.add(int(part))
    
    # Metadata
    core_props = prs.core_properties
    metadata = {
        "title": core_props.title or "",
        "author": core_props.author or "",
        "subject": core_props.subject or "",
        "created": core_props.created.isoformat() if core_props.created else None,
        "modified": core_props.modified.isoformat() if core_props.modified else None,
        "slide_count": len(prs.slides)
    }
    
    # Extract slides
    slides = []
    for i, slide in enumerate(prs.slides, 1):
        if selected_slides and i not in selected_slides:
            continue
        slides.append(extract_slide(slide, i))
    
    return {
        "metadata": metadata,
        "slides": slides,
        "source_file": str(Path(pptx_path).name)
    }


def parse_community_data(data: dict) -> dict:
    """
    Parse extracted PPTX data to identify community-specific information.
    Looks for patterns common in One Point reference guides.
    """
    community = {
        "name": "",
        "address": "",
        "contacts": [],
        "one_point_team": [],
        "goals": [],
        "engagement": {
            "phase": "",
            "start_date": "",
            "fee": "",
            "timeline": []
        },
        "market_analysis": {
            "pma_description": "",
            "demographics": [],
            "demand_summary": []
        },
        "development": {
            "objectives": [],
            "vulnerabilities": [],
            "opportunities": []
        },
        "presentations": [],
        "next_steps": []
    }
    
    all_text = ""
    for slide in data.get("slides", []):
        slide_text = f"{slide.get('title', '')} {' '.join(slide.get('content', []))}"
        all_text += slide_text + "\n"
        
        title = slide.get("title", "").lower()
        content = slide.get("content", [])
        content_text = " ".join(content)
        
        # Extract community name (usually in title slide)
        if slide["number"] == 1:
            # Look for pattern like "Reference Guide: Community Name"
            match = re.search(r'(?:Reference\s*Guide[:\s]*)?([A-Z][A-Za-z\s\-]+(?:Village|Community|Center|Home|Living))', 
                            slide.get("title", "") + " " + content_text)
            if match:
                community["name"] = match.group(1).strip()
        
        # Extract contacts (look for email patterns)
        emails = re.findall(r'(\S+@\S+\.\S+)', content_text)
        for email in emails:
            # Try to find name before email
            name_match = re.search(rf'([A-Z][a-z]+\s+[A-Z][a-z]+)[,\s]+(?:\w+\s+)?{re.escape(email)}', content_text)
            contact = {"email": email}
            if name_match:
                contact["name"] = name_match.group(1)
            # Look for title
            title_match = re.search(rf'([A-Z][A-Z]+|CEO|CFO|COO|President|Director)[,\s]+{re.escape(email)}', content_text)
            if title_match:
                contact["title"] = title_match.group(1)
            if contact not in community["contacts"]:
                community["contacts"].append(contact)
        
        # Extract One Point team
        if "onepoint" in title.replace(" ", "").lower() or "team" in title.lower():
            # Look for role patterns
            roles = re.findall(r'([A-Z][a-z]+)(?:\s*[&]\s*[A-Z][a-z]+)?:\s*([A-Za-z\s]+?)(?=\n|[A-Z][a-z]+:|$)', content_text)
            for name, role in roles:
                community["one_point_team"].append({"name": name.strip(), "role": role.strip()})
        
        # Extract goals
        if "goal" in title.lower():
            for item in content:
                if len(item) > 10:  # Filter out short items
                    community["goals"].append(item)
        
        # Extract engagement info
        if "engagement" in title.lower() or "phase" in title.lower():
            # Look for fee
            fee_match = re.search(r'\$[\d,]+', content_text)
            if fee_match:
                community["engagement"]["fee"] = fee_match.group(0)
            # Look for phase
            phase_match = re.search(r'Phase\s*[\dAB]+[^.]*', content_text)
            if phase_match:
                community["engagement"]["phase"] = phase_match.group(0)
        
        # Extract market/demand info
        if "market" in title.lower() or "demand" in title.lower():
            for item in content:
                if len(item) > 20:
                    community["market_analysis"]["demand_summary"].append(item)
        
        # Extract development objectives
        if "development" in title.lower() or "objective" in title.lower() or "site" in title.lower():
            for item in content:
                if "vulnerabilit" in item.lower():
                    community["development"]["vulnerabilities"].append(item)
                elif "opportunit" in item.lower():
                    community["development"]["opportunities"].append(item)
                elif len(item) > 15:
                    community["development"]["objectives"].append(item)
        
        # Extract presentations/meetings
        date_matches = re.findall(r'((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})', content_text)
        for date in date_matches:
            if date not in [p.get("date") for p in community["presentations"]]:
                community["presentations"].append({"date": date, "slide": slide["number"]})
        
        # Extract next steps
        if "next step" in title.lower():
            for item in content:
                if len(item) > 10:
                    community["next_steps"].append(item)
    
    # Try to extract address
    addr_match = re.search(r'(\d+\s+[A-Za-z\s]+(?:Rd|Road|St|Street|Ave|Avenue|Dr|Drive|Ln|Lane|Way|Blvd)[^,]*,\s*[A-Za-z\s]+,\s*[A-Z]{2}\s+\d{5})', all_text)
    if addr_match:
        community["address"] = addr_match.group(1)
    
    return community


def to_markdown(data: dict) -> str:
    """Convert extracted data to readable Markdown"""
    lines = []
    
    meta = data.get("metadata", {})
    lines.append(f"# {meta.get('title') or data.get('source_file', 'Presentation')}")
    lines.append("")
    if meta.get("author"):
        lines.append(f"**Author:** {meta['author']}")
    lines.append(f"**Slides:** {meta.get('slide_count', 0)}")
    lines.append("")
    lines.append("---")
    lines.append("")
    
    for slide in data.get("slides", []):
        lines.append(f"## Slide {slide['number']}: {slide.get('title', 'Untitled')}")
        lines.append("")
        
        for content in slide.get("content", []):
            lines.append(content)
            lines.append("")
        
        for table in slide.get("tables", []):
            if table:
                # Create markdown table
                lines.append("| " + " | ".join(table[0]) + " |")
                lines.append("| " + " | ".join(["---"] * len(table[0])) + " |")
                for row in table[1:]:
                    lines.append("| " + " | ".join(row) + " |")
                lines.append("")
        
        if slide.get("notes"):
            lines.append(f"*Notes: {slide['notes']}*")
            lines.append("")
        
        lines.append("---")
        lines.append("")
    
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description="PowerPoint Parser")
    subparsers = parser.add_subparsers(dest="command", required=True)
    
    # extract command
    extract_p = subparsers.add_parser("extract", help="Extract content from PPTX")
    extract_p.add_argument("file", help="PPTX file path")
    extract_p.add_argument("--json", action="store_true", help="Output JSON")
    extract_p.add_argument("--markdown", action="store_true", help="Output Markdown")
    extract_p.add_argument("--slides", help="Slide range (e.g., 1-5,10)")
    
    # info command
    info_p = subparsers.add_parser("info", help="Get PPTX metadata")
    info_p.add_argument("file", help="PPTX file path")
    
    # parse-community command
    comm_p = subparsers.add_parser("parse-community", help="Parse as One Point community doc")
    comm_p.add_argument("file", help="PPTX file path")
    comm_p.add_argument("--json", action="store_true", help="Output JSON")
    
    args = parser.parse_args()
    
    if not Path(args.file).exists():
        print(f"Error: File not found: {args.file}", file=sys.stderr)
        sys.exit(1)
    
    if args.command == "extract":
        data = extract_presentation(args.file, args.slides if hasattr(args, 'slides') else None)
        
        if args.markdown:
            print(to_markdown(data))
        else:
            # Default to JSON
            print(json.dumps(data, indent=2, default=str))
    
    elif args.command == "info":
        data = extract_presentation(args.file)
        print(json.dumps(data["metadata"], indent=2, default=str))
    
    elif args.command == "parse-community":
        data = extract_presentation(args.file)
        community = parse_community_data(data)
        print(json.dumps(community, indent=2, default=str))


if __name__ == "__main__":
    main()
