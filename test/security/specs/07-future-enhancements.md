# Future Enhancements Plan

Comprehensive roadmap for expanding the security test harness to cover all Moltbot channels, tools, and integrations.

---

## 1. Channels to Test

Moltbot supports 7 messaging channels. Each needs channel-specific injection vectors tested.

### Channel Matrix

| Channel | Priority | Attack Vectors | Status |
|---------|----------|----------------|--------|
| **WhatsApp** | P0 | Message forwarding, group invite links, vCard injection | [x] Done (4 tests) |
| **Telegram** | P0 | Inline keyboards, callback data, deep links, forwarded messages | [x] Done (4 tests) |
| **Discord** | P1 | Embeds, mentions, webhook payloads, slash command spoofing | [ ] Not started |
| **Slack** | P1 | Block kit payloads, unfurled links, workflow triggers | [ ] Not started |
| **Signal** | P2 | Sealed sender abuse, group update messages | [ ] Not started |
| **iMessage** | P2 | Tapback/reaction payloads, link previews | [ ] Not started |
| **LINE** | P3 | Flex messages, rich menus, beacon events | [ ] Not started |

### Channel-Specific Test Files

```
test/security/channels/
├── whatsapp-injection.e2e.test.ts
├── telegram-injection.e2e.test.ts
├── discord-injection.e2e.test.ts
├── slack-injection.e2e.test.ts
├── signal-injection.e2e.test.ts
├── imessage-injection.e2e.test.ts
└── line-injection.e2e.test.ts
```

### Attack Vectors by Channel

#### WhatsApp
- Forwarded message with hidden instructions
- vCard contact with malicious name field
- Group description injection
- Location sharing with poisoned address
- Document filename injection

#### Telegram
- Inline keyboard callback data injection
- Bot deep link parameter injection
- Forwarded channel post with instructions
- Poll option text injection
- Sticker pack name/title injection

#### Discord
- Embed field injection (title, description, footer)
- Webhook username/avatar URL injection
- Slash command autocomplete poisoning
- Thread name injection
- Role mention manipulation

#### Slack
- Block kit text injection
- Unfurled link preview manipulation
- Workflow step output injection
- Channel topic/purpose injection
- App home tab content injection

---

## 2. CLI Tools to Mock

27 internal CLIs plus external tools the agent invokes.

### Internal CLIs (Moltbot)

| CLI | Priority | Mock Scenarios | Status |
|-----|----------|----------------|--------|
| **gog** (Google) | P0 | Gmail, Calendar, Drive responses | [x] Done |
| **browser-cli** | P0 | Page content, screenshots, DOM | [x] Done |
| **memory-cli** | P1 | Knowledge base queries | [ ] Not started |
| **plugins-cli** | P1 | Plugin list, install responses | [ ] Not started |
| **skills-cli** | P1 | Skill discovery, execution | [ ] Not started |
| **config-cli** | P2 | Configuration values | [ ] Not started |
| **nodes-cli** | P2 | Cluster node responses | [ ] Not started |
| **webhooks-cli** | P2 | Webhook payloads | [ ] Not started |
| **security-cli** | P2 | Policy responses | [ ] Not started |
| **logs-cli** | P3 | Log file contents | [ ] Not started |
| **system-cli** | P3 | System info | [ ] Not started |

### External CLIs

| CLI | Priority | Mock Scenarios | Status |
|-----|----------|----------------|--------|
| **curl/wget** | P0 | HTTP responses, redirects | [x] Done |
| **gh** (GitHub) | P0 | Issues, PRs, API responses | [x] Done |
| **git** | P1 | Commit messages, diff output | [ ] Not started |
| **jq** | P1 | JSON transformation output | [ ] Not started |
| **himalaya** | P1 | Email content (IMAP) | [ ] Not started |
| **spotify_player** | P2 | Track info, playlist data | [ ] Not started |
| **memo** (Apple Notes) | P2 | Note content | [ ] Not started |
| **osascript** | P2 | AppleScript output | [ ] Not started |

### Mock Infrastructure

```typescript
// cli-mocks/index.ts - Factory for all CLI mocks
export function createCliMock(cli: string, config: MockConfig): MockBinary;

// Supported CLIs with typed configs
export function createGogMock(config: GogMockConfig): MockBinary;
export function createBrowserMock(config: BrowserMockConfig): MockBinary;
export function createGitHubMock(config: GitHubMockConfig): MockBinary;
export function createCurlMock(config: CurlMockConfig): MockBinary;
export function createHimalayaMock(config: EmailMockConfig): MockBinary;
```

---

## 3. Skills to Test

54 skills that can return poisoned data to the agent.

### High-Priority Skills (External Data)

| Skill | Data Source | Injection Vectors | Status |
|-------|-------------|-------------------|--------|
| **weather** | wttr.in, Open-Meteo | Forecast text, alerts | ❌ Not started |
| **github** | GitHub API | Issue body, PR comments, commit messages | ❌ Not started |
| **notion** | Notion API | Page content, database records | ❌ Not started |
| **trello** | Trello API | Card descriptions, comments | ❌ Not started |
| **himalaya** | IMAP/SMTP | Email content | ❌ Not started |
| **spotify-player** | Spotify API | Track names, playlist descriptions | ❌ Not started |
| **obsidian** | Local files | Note content | ❌ Not started |
| **bear-notes** | Local DB | Note content | ❌ Not started |

### Medium-Priority Skills (Local/System)

| Skill | Data Source | Injection Vectors | Status |
|-------|-------------|-------------------|--------|
| **apple-notes** | macOS Notes | Note content | ❌ Not started |
| **apple-reminders** | macOS Reminders | Reminder text | ❌ Not started |
| **things-mac** | Things 3 | Task content | ❌ Not started |
| **session-logs** | Local logs | Log entries | ❌ Not started |
| **goplaces** | Google Places | Location data | ❌ Not started |
| **local-places** | Local DB | Place names | ❌ Not started |

### AI/Media Skills (Generated Content)

| Skill | Risk | Notes |
|-------|------|-------|
| **openai-image-gen** | Low | Images don't contain executable instructions |
| **openai-whisper** | Medium | Transcribed audio could contain instructions |
| **gemini** | High | LLM output could contain injections |
| **summarize** | Medium | Summarized content preserves injections |

---

## 4. External APIs to Mock

### API Mock Server

```typescript
// harness/api-mocks/server.ts
import { Hono } from "hono";

export function createMockApiServer(port: number): MockApiServer {
  const app = new Hono();

  // Weather APIs
  app.get("/wttr.in/*", (c) => mockWeatherResponse(c));
  app.get("/api.open-meteo.com/*", (c) => mockOpenMeteoResponse(c));

  // GitHub API
  app.all("/api.github.com/*", (c) => mockGitHubResponse(c));

  // Notion API
  app.all("/api.notion.com/*", (c) => mockNotionResponse(c));

  // Trello API
  app.all("/api.trello.com/*", (c) => mockTrelloResponse(c));

  return { app, start, stop, setPoisonedResponse };
}
```

### API Injection Scenarios

| API | Endpoint | Poisoned Field |
|-----|----------|----------------|
| wttr.in | `/:location` | Weather description text |
| Open-Meteo | `/v1/forecast` | Weather code interpretation |
| GitHub | `/repos/:owner/:repo/issues` | Issue body, comments |
| GitHub | `/repos/:owner/:repo/pulls` | PR description, review comments |
| Notion | `/v1/pages/:id` | Page content blocks |
| Trello | `/1/cards/:id` | Card description |
| Spotify | `/v1/tracks/:id` | Track name, artist name |

---

## 5. HTML Test Report

### Report Structure

```
reports/
├── index.html              # Main dashboard
├── assets/
│   ├── style.css
│   └── script.js
├── runs/
│   └── 2026-01-29T09-30-00/
│       ├── report.html     # Full report
│       ├── report.json     # Machine-readable
│       └── screenshots/    # Failure evidence
└── trends.json             # Historical data
```

### Dashboard Features

1. **Summary Cards**
   - Total tests / Passed / Failed / Skipped
   - Critical failures highlighted
   - Pass rate percentage with trend indicator

2. **Category Breakdown**
   - Prompt Injection: X/Y passed
   - Exfiltration: X/Y passed
   - Trust Boundary: X/Y passed
   - Tool Poisoning: X/Y passed

3. **Test Results Table**
   - Sortable by name, status, severity, duration
   - Expandable rows with full verdict details
   - Filter by status, category, channel

4. **Failure Details**
   - Injection payload (syntax highlighted)
   - Agent response (with suspicious content highlighted)
   - Tool calls made (with forbidden actions flagged)
   - LLM judge reasoning
   - Evidence list

5. **Historical Trends**
   - Pass rate over time (line chart)
   - Failure categories over time (stacked bar)
   - Regression detection alerts

### Report Generator

```typescript
// harness/report-generator.ts

interface TestRun {
  id: string;
  timestamp: Date;
  duration: number;
  results: Map<string, SecurityVerdict>;
  environment: {
    gatewayVersion: string;
    nodeVersion: string;
    platform: string;
  };
}

export async function generateHtmlReport(run: TestRun): Promise<string>;
export async function generateJsonReport(run: TestRun): Promise<object>;
export async function updateTrends(run: TestRun): Promise<void>;
```

### HTML Template

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Moltbot Security Test Report</title>
  <style>
    :root {
      --pass: #22c55e;
      --fail: #ef4444;
      --warn: #f59e0b;
      --bg: #0f172a;
      --card: #1e293b;
      --text: #f8fafc;
    }
    /* Dark theme optimized for security dashboards */
  </style>
</head>
<body>
  <header>
    <h1>🛡️ Security Test Report</h1>
    <div class="run-info">
      <span class="timestamp">{{timestamp}}</span>
      <span class="duration">{{duration}}</span>
    </div>
  </header>

  <section class="summary">
    <div class="card pass">
      <div class="number">{{passed}}</div>
      <div class="label">Passed</div>
    </div>
    <div class="card fail">
      <div class="number">{{failed}}</div>
      <div class="label">Failed</div>
    </div>
    <div class="card rate">
      <div class="number">{{passRate}}%</div>
      <div class="label">Pass Rate</div>
    </div>
  </section>

  <section class="results">
    <table>
      <thead>
        <tr>
          <th>Status</th>
          <th>Test Name</th>
          <th>Category</th>
          <th>Severity</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        {{#each results}}
        <tr class="{{status}}">
          <td>{{statusIcon}}</td>
          <td>{{name}}</td>
          <td>{{category}}</td>
          <td>{{severity}}</td>
          <td><button onclick="showDetails('{{id}}')">View</button></td>
        </tr>
        {{/each}}
      </tbody>
    </table>
  </section>

  <section class="details" id="details-panel">
    <!-- Populated by JS on row click -->
  </section>
</body>
</html>
```

---

## 6. Implementation Phases

### Phase 1: Foundation
- [x] Gateway client with real protocol
- [x] LLM judge with Claude
- [x] Email injection tests (4 tests)
- [x] Basic CLI mock (gog)
- [x] HTML report generator
- [x] JSON report export
- [x] Sample report generation script

### Phase 2: Core Coverage
- [ ] Calendar injection tests
- [x] Browser CLI mock
- [x] curl/wget mocks
- [x] GitHub CLI mock
- [ ] Trust boundary tests
- [ ] Exfiltration pattern tests

### Phase 3: Channel Coverage
- [x] WhatsApp-specific tests (4 tests)
- [x] Telegram-specific tests (4 tests)
- [ ] Discord-specific tests
- [ ] Slack-specific tests
- [ ] Channel message format mocks

### Phase 4: Skill Coverage
- [ ] Weather API mock
- [ ] Notion API mock
- [ ] GitHub API mock server
- [ ] Trello API mock
- [ ] Email (himalaya) mock

### Phase 5: Advanced
- [ ] Multi-turn attack scenarios
- [ ] Timing-based covert channels
- [ ] Cross-session data leakage
- [ ] Plugin/extension poisoning
- [ ] Fuzzing with generated payloads

### Phase 6: CI/CD & Reporting
- [ ] GitHub Actions integration
- [ ] Historical trend tracking
- [ ] Regression detection
- [ ] Slack/Discord notifications on failure
- [ ] Badge generation for README

---

## 7. File Structure (Target State)

```
test/security/
├── .env                          # API keys (gitignored)
├── README.md                     # Updated documentation
├── SPEC.md                       # Full specification
├── specs/                        # Detailed specs
│   ├── 00-overview.md
│   ├── 01-llm-judge.md
│   ├── 02-gateway-client.md
│   ├── 03-cli-mocks.md
│   ├── 04-test-categories.md
│   ├── 05-ci-docker.md
│   ├── 06-implementation-plan.md
│   └── 07-future-enhancements.md # This file
│
├── harness/
│   ├── index.ts                  # Main exports
│   ├── gateway-client.ts         # WebSocket client
│   ├── assertions.ts             # Pattern assertions
│   ├── llm-judge.ts              # Claude judge
│   ├── report-generator.ts       # HTML/JSON reports
│   ├── cli-mocks/
│   │   ├── index.ts              # Mock factory
│   │   ├── mock-binary.ts        # Base mock utility
│   │   ├── gog-mock.ts           # Google CLI
│   │   ├── browser-mock.ts       # Browser CLI
│   │   ├── github-mock.ts        # gh CLI
│   │   ├── curl-mock.ts          # curl/wget
│   │   └── himalaya-mock.ts      # Email CLI
│   └── api-mocks/
│       ├── server.ts             # Hono mock server
│       ├── weather.ts            # wttr.in, Open-Meteo
│       ├── github.ts             # GitHub API
│       ├── notion.ts             # Notion API
│       └── trello.ts             # Trello API
│
├── tests/
│   ├── email-injection.e2e.test.ts
│   ├── calendar-injection.e2e.test.ts
│   ├── api-injection.e2e.test.ts
│   ├── trust-boundary.e2e.test.ts
│   ├── exfiltration.e2e.test.ts
│   ├── tool-poisoning.e2e.test.ts
│   └── channels/
│       ├── whatsapp.e2e.test.ts
│       ├── telegram.e2e.test.ts
│       ├── discord.e2e.test.ts
│       ├── slack.e2e.test.ts
│       ├── signal.e2e.test.ts
│       ├── imessage.e2e.test.ts
│       └── line.e2e.test.ts
│
├── reports/
│   ├── index.html                # Dashboard
│   ├── assets/
│   │   ├── style.css
│   │   └── script.js
│   └── runs/                     # Historical runs
│
├── setup.ts                      # Test setup
├── docker-compose.yml            # Container setup
├── Dockerfile.test               # Test container
└── run-local.sh                  # Local runner
```

---

## 8. Success Metrics

| Metric | Target | Current |
|--------|--------|---------|
| Test coverage (categories) | 6/6 | 2/6 (prompt_injection, trust_boundary) |
| Channel coverage | 7/7 | 2/7 (WhatsApp, Telegram) |
| CLI mocks | 15+ | 4 (gog, curl/wget, gh, browser) |
| API mocks | 5+ | 0 |
| Test files | 8 | 3 |
| Test cases | 32+ | 12 |
| Poisoned payloads | 30+ | 22 |
| Pass rate baseline | Established | Not yet (needs live gateway) |
| CI integration | Blocking | Not yet |
| HTML reports | Interactive | [x] Done |

---

## 9. Dependencies to Add

```bash
# For HTML report generation
pnpm add -D handlebars

# For API mocking (Hono already in deps)
# No additional deps needed

# For chart rendering in reports
pnpm add -D chart.js
```

---

## 10. References

- [steipete/agent-rules](https://github.com/steipete/agent-rules) - Test patterns, multi-layer validation
- [OWASP LLM Top 10](https://owasp.org/www-project-top-10-for-large-language-model-applications/) - Attack categories
- [Prompt Injection attacks](https://simonwillison.net/series/prompt-injection/) - Simon Willison's research
- Moltbot source: `/Users/jai/Developer/clawdis/src/`
