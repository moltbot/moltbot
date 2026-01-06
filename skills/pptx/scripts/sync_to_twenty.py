#!/usr/bin/env python3
"""
Sync parsed PPTX community data to Twenty CRM

Usage:
    pptx_parser.py parse-community file.pptx | sync_to_twenty.py
    sync_to_twenty.py --file community_data.json
    sync_to_twenty.py --community "Carleton-Willard" --update-only
"""

import argparse
import json
import os
import sys
from datetime import datetime
from typing import Optional

import requests


class TwentyCRM:
    """Twenty CRM API client"""
    
    def __init__(self, api_url: str, api_token: str):
        self.api_url = api_url.rstrip("/")
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }
    
    def _request(self, method: str, endpoint: str, data: dict = None) -> dict:
        """Make API request"""
        url = f"{self.api_url}/rest/{endpoint}"
        resp = requests.request(method, url, headers=self.headers, json=data)
        
        if resp.status_code >= 400:
            raise Exception(f"API error {resp.status_code}: {resp.text}")
        
        return resp.json() if resp.text else {}
    
    def search_companies(self, name: str) -> list:
        """Search for companies by name"""
        # Twenty REST API filter syntax
        resp = self._request("GET", f"companies?filter[name][like]=%{name}%")
        return resp.get("data", {}).get("companies", [])
    
    def get_company(self, company_id: str) -> dict:
        """Get company by ID"""
        resp = self._request("GET", f"companies/{company_id}")
        return resp.get("data", {}).get("company", {})
    
    def create_company(self, data: dict) -> dict:
        """Create a new company"""
        resp = self._request("POST", "companies", data)
        return resp.get("data", {}).get("createCompany", {})
    
    def update_company(self, company_id: str, data: dict) -> dict:
        """Update existing company"""
        resp = self._request("PATCH", f"companies/{company_id}", data)
        return resp.get("data", {}).get("updateCompany", {})
    
    def search_people(self, name: str = None, email: str = None) -> list:
        """Search for people"""
        filters = []
        if name:
            filters.append(f"filter[name][like]=%{name}%")
        if email:
            filters.append(f"filter[email][eq]={email}")
        
        query = "&".join(filters) if filters else ""
        resp = self._request("GET", f"people?{query}")
        return resp.get("data", {}).get("people", [])
    
    def create_person(self, data: dict) -> dict:
        """Create a new person/contact"""
        resp = self._request("POST", "people", data)
        return resp.get("data", {}).get("createPerson", {})
    
    def create_note(self, body: str, target_id: str = None, target_type: str = None) -> dict:
        """Create a note, optionally linked to a target"""
        data = {"body": body}
        if target_id and target_type:
            # Twenty uses activityTargets to link notes
            data["activityTargets"] = [{
                "targetObjectNameSingular": target_type,
                "targetObjectRecordId": target_id
            }]
        
        resp = self._request("POST", "notes", data)
        return resp.get("data", {}).get("createNote", {})


def sync_community_to_twenty(community_data: dict, crm: TwentyCRM, dry_run: bool = False) -> dict:
    """
    Sync parsed community data to Twenty CRM
    
    Creates/updates:
    - Company record for the community
    - People records for contacts
    - Notes for market analysis, goals, etc.
    """
    results = {
        "company": None,
        "contacts_created": [],
        "contacts_updated": [],
        "notes_created": [],
        "errors": []
    }
    
    community_name = community_data.get("name", "Unknown Community")
    
    if dry_run:
        print(f"[DRY RUN] Would sync: {community_name}")
        print(json.dumps(community_data, indent=2))
        return results
    
    # 1. Find or create company
    print(f"Searching for company: {community_name}")
    existing = crm.search_companies(community_name)
    
    company_data = {
        "name": community_name,
        "address": community_data.get("address", ""),
        "domainName": "",  # Could extract from email domains
    }
    
    if existing:
        company_id = existing[0].get("id")
        print(f"Found existing company: {company_id}")
        company = crm.update_company(company_id, company_data)
        results["company"] = {"id": company_id, "action": "updated"}
    else:
        print(f"Creating new company: {community_name}")
        company = crm.create_company(company_data)
        company_id = company.get("id")
        results["company"] = {"id": company_id, "action": "created"}
    
    if not company_id:
        results["errors"].append("Failed to create/find company")
        return results
    
    # 2. Create/update contacts
    for contact in community_data.get("contacts", []):
        email = contact.get("email")
        name = contact.get("name", "")
        title = contact.get("title", "")
        
        if not email:
            continue
        
        # Check if person exists
        existing_people = crm.search_people(email=email)
        
        person_data = {
            "email": email,
            "name": name,
            "jobTitle": title,
            "companyId": company_id
        }
        
        if existing_people:
            print(f"Contact already exists: {email}")
            results["contacts_updated"].append({"email": email, "name": name})
        else:
            print(f"Creating contact: {name} ({email})")
            try:
                crm.create_person(person_data)
                results["contacts_created"].append({"email": email, "name": name})
            except Exception as e:
                results["errors"].append(f"Failed to create {email}: {str(e)}")
    
    # 3. Create notes for various sections
    notes_to_create = []
    
    # One Point Team note
    team = community_data.get("one_point_team", [])
    if team:
        team_lines = ["## One Point Team\n"]
        for member in team:
            team_lines.append(f"- **{member.get('name', '')}**: {member.get('role', '')}")
        notes_to_create.append(("One Point Team", "\n".join(team_lines)))
    
    # Goals note
    goals = community_data.get("goals", [])
    if goals:
        goals_text = "## Client Goals\n\n" + "\n\n".join(goals)
        notes_to_create.append(("Client Goals", goals_text))
    
    # Market Analysis note
    market = community_data.get("market_analysis", {})
    demand = market.get("demand_summary", [])
    if demand:
        market_text = "## Market Analysis\n\n" + "\n\n---\n\n".join(demand[:5])  # Limit to first 5
        notes_to_create.append(("Market Analysis Summary", market_text))
    
    # Development note
    dev = community_data.get("development", {})
    dev_parts = []
    if dev.get("vulnerabilities"):
        dev_parts.append("### Vulnerabilities\n" + "\n".join(dev["vulnerabilities"][:2]))
    if dev.get("opportunities"):
        dev_parts.append("### Opportunities\n" + "\n".join(dev["opportunities"][:2]))
    if dev.get("objectives"):
        dev_parts.append("### Objectives\n" + "\n".join(dev["objectives"][:2]))
    if dev_parts:
        dev_text = "## Development Analysis\n\n" + "\n\n".join(dev_parts)
        notes_to_create.append(("Development Analysis", dev_text))
    
    # Presentations log note
    presentations = community_data.get("presentations", [])
    if presentations:
        pres_lines = ["## Presentations Log\n"]
        for p in presentations:
            pres_lines.append(f"- {p.get('date', 'Unknown date')} (Slide {p.get('slide', '?')})")
        notes_to_create.append(("Presentations Log", "\n".join(pres_lines)))
    
    # Next Steps note
    next_steps = community_data.get("next_steps", [])
    if next_steps:
        steps_text = "## Next Steps\n\n" + "\n\n".join(next_steps)
        notes_to_create.append(("Next Steps", steps_text))
    
    # Create all notes
    for note_title, note_body in notes_to_create:
        full_body = f"# {community_name}: {note_title}\n\n{note_body}\n\n---\n*Auto-imported from PPTX on {datetime.now().strftime('%Y-%m-%d %H:%M')}*"
        try:
            print(f"Creating note: {note_title}")
            crm.create_note(full_body, target_id=company_id, target_type="company")
            results["notes_created"].append(note_title)
        except Exception as e:
            results["errors"].append(f"Failed to create note '{note_title}': {str(e)}")
    
    return results


def main():
    parser = argparse.ArgumentParser(description="Sync community data to Twenty CRM")
    parser.add_argument("--file", help="JSON file with community data")
    parser.add_argument("--dry-run", action="store_true", help="Don't actually create records")
    parser.add_argument("--community", help="Filter to specific community name")
    
    args = parser.parse_args()
    
    # Get Twenty credentials
    api_url = os.environ.get("TWENTY_API_URL")
    api_token = os.environ.get("TWENTY_API_TOKEN")
    
    if not api_url or not api_token:
        print("Error: TWENTY_API_URL and TWENTY_API_TOKEN required", file=sys.stderr)
        sys.exit(1)
    
    # Load data from file or stdin
    if args.file:
        with open(args.file) as f:
            data = json.load(f)
    else:
        data = json.load(sys.stdin)
    
    # Filter if requested
    if args.community and data.get("name") != args.community:
        print(f"Skipping: {data.get('name')} (filter: {args.community})")
        return
    
    # Initialize CRM client
    crm = TwentyCRM(api_url, api_token)
    
    # Sync
    results = sync_community_to_twenty(data, crm, dry_run=args.dry_run)
    
    # Output results
    print("\n" + "=" * 50)
    print("SYNC RESULTS")
    print("=" * 50)
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
