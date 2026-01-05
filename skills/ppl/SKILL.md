---
name: ppl
description: Personal CRM at ppl.gift (Monica CRM fork) - manage contacts, relationships, activities, notes, and reminders.
homepage: https://ppl.gift
metadata: {"clawdis":{"emoji":"👥","requires":{"bins":["uv"],"env":["PPL_API_TOKEN"]},"primaryEnv":"PPL_API_TOKEN"}}
---

# ppl.gift CRM

Personal relationship management CLI for David's Monica CRM instance at ppl.gift.

## Setup

- **API URL**: https://ppl.gift/api
- **Token**: `PPL_API_TOKEN` environment variable

## Commands

### List Contacts
```bash
uv run {baseDir}/scripts/ppl.py contacts              # List all contacts
uv run {baseDir}/scripts/ppl.py contacts -s           # Only starred contacts
uv run {baseDir}/scripts/ppl.py contacts -n 50        # Get 50 contacts
uv run {baseDir}/scripts/ppl.py contacts --json       # JSON output
```

### Get Contact Details
```bash
uv run {baseDir}/scripts/ppl.py contact <ID>
uv run {baseDir}/scripts/ppl.py contact 687400 --json
```

### Search Contacts
```bash
uv run {baseDir}/scripts/ppl.py search "Erin"
uv run {baseDir}/scripts/ppl.py search "Hurley" -n 5
```

### List Reminders
```bash
uv run {baseDir}/scripts/ppl.py reminders
uv run {baseDir}/scripts/ppl.py reminders --json
```

### List Activities
```bash
uv run {baseDir}/scripts/ppl.py activities
uv run {baseDir}/scripts/ppl.py activities -n 20
```

### List Notes
```bash
uv run {baseDir}/scripts/ppl.py notes
uv run {baseDir}/scripts/ppl.py notes -n 20
```

### Get Statistics
```bash
uv run {baseDir}/scripts/ppl.py stats
```

### Add a Note
```bash
uv run {baseDir}/scripts/ppl.py add-note --contact-id 687400 --body "Had coffee, discussed vacation plans"
uv run {baseDir}/scripts/ppl.py add-note --contact-id 687400 --body "Important!" --favorite
```

### Log an Activity
```bash
uv run {baseDir}/scripts/ppl.py add-activity --contacts 687400 --summary "Dinner at home"
uv run {baseDir}/scripts/ppl.py add-activity --contacts 687400,687401 --summary "Family game night" --date 2026-01-04
```

## Key Contacts

- **Erin Hurley** (ID: 687400) - Wife, starred ⭐
- **DB Hurley** (ID: 687464) - David himself (is_me: true)

## API Reference

Based on [Monica CRM API](https://www.monicahq.com/api). Available endpoints:
- `/contacts` - Contact management
- `/activities` - Activity logging
- `/notes` - Notes on contacts
- `/reminders` - Reminders/follow-ups
- `/calls` - Phone call logging
- `/journal` - Personal journal entries
- `/statistics` - Usage stats

## Deployment

- **Hosting**: Digital Ocean droplet
- **GitHub**: Auto-deploys on commit via webhook
- **Domain**: ppl.gift

## Steve's Workflow — Saving People Info

**This is the PRIMARY database for all people-related info.** When learning something about a person, save it here so David can see what I know.

### Note Categories (use emoji prefixes)
- 🍹 **COCKTAIL:** — Drink recipes, ratings, feedback
- 🎁 **GIFT IDEA:** — Gift suggestions
- 💡 **PREFERENCE:** — Likes, dislikes, preferences
- 📝 **NOTE:** — General observations, memories

### Quick Add via curl
```bash
curl -s -X POST \
  -H "Authorization: Bearer $PPL_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"contact_id": ID, "body": "NOTE TEXT", "is_favorited": false}' \
  "https://ppl.gift/api/notes"
```

### Erin's Cocktail Tracking
Track cocktails David makes for Erin with ratings:
```
🍹 COCKTAIL: [Name]
Recipe: [ingredients]
Rating: X/10
Notes: [her feedback]
```
