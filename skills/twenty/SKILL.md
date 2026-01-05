---
name: twenty
description: Twenty CRM CLI - Team CRM for One Point Partners. Manage companies, people, opportunities, tasks, and custom objects.
homepage: https://twenty.com
metadata: {"clawdis":{"emoji":"🏢","requires":{"bins":["uv"],"env":["TWENTY_API_TOKEN"]},"primaryEnv":"TWENTY_API_TOKEN"}}
---

# Twenty CRM

Team CRM CLI for One Point Partners using Twenty (open-source CRM).

## Setup

- **API URL**: `https://api.mollified.app` (One Point's Mollified/Twenty instance)
- **Token**: Set `TWENTY_API_TOKEN` environment variable (generate in Twenty Settings → Developers → API Keys)

## Commands

### Companies
```bash
uv run {baseDir}/scripts/twenty.py companies              # List companies
uv run {baseDir}/scripts/twenty.py companies -n 50        # Get 50 companies
uv run {baseDir}/scripts/twenty.py company <ID>           # Get company details
uv run {baseDir}/scripts/twenty.py company <ID> --json    # JSON output
```

### People (Contacts)
```bash
uv run {baseDir}/scripts/twenty.py people                 # List people
uv run {baseDir}/scripts/twenty.py people -n 50           # Get 50 people
uv run {baseDir}/scripts/twenty.py person <ID>            # Get person details
```

### Opportunities (Deals)
```bash
uv run {baseDir}/scripts/twenty.py opportunities          # List opportunities
uv run {baseDir}/scripts/twenty.py opportunity <ID>       # Get opportunity details
```

### Tasks
```bash
uv run {baseDir}/scripts/twenty.py tasks                  # List tasks
uv run {baseDir}/scripts/twenty.py add-task --title "Follow up" --due 2026-01-10
```

### Notes
```bash
uv run {baseDir}/scripts/twenty.py notes                  # List notes
uv run {baseDir}/scripts/twenty.py add-note --body "Meeting notes from call"
```

### Custom Objects
```bash
uv run {baseDir}/scripts/twenty.py custom projects        # Query custom 'projects' object
uv run {baseDir}/scripts/twenty.py custom engagements     # Query 'engagements' object
uv run {baseDir}/scripts/twenty.py custom <object> --json # JSON output
```

### Search
```bash
uv run {baseDir}/scripts/twenty.py search "Acme"          # Search people & companies
```

## Custom Objects for One Point

Twenty supports custom objects. Common ones for One Point might include:
- `projects` — Active consulting projects
- `engagements` — Advisory engagements  
- `proposals` — Proposals in progress
- `timeEntries` — Time tracking

Query them with: `twenty.py custom <objectNamePlural>`

## API Reference

Twenty uses a REST API. Endpoints:
- `/rest/companies` - Companies
- `/rest/people` - People/Contacts
- `/rest/opportunities` - Deals/Opportunities
- `/rest/tasks` - Tasks
- `/rest/notes` - Notes
- `/rest/<customObject>` - Custom objects

Auth: Bearer token in header.

Docs: https://twenty.com/developers

## Team Use Case

This is the **shared knowledge layer** for the One Point team:
- All team members can read/write
- Track clients, projects, opportunities
- Coordinate on engagements
- Shared task management

Personal data (email, calendar) stays in per-user OAuth — Twenty is for team-wide CRM data.
