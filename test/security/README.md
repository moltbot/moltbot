# Security Acceptance Tests

E2E security testing framework for Moltbot. Validates resistance to:
- Prompt injection via external data sources
- Data exfiltration attempts
- Trust boundary violations
- Tool poisoning attacks

## Architecture: LLM-as-Judge

Pattern matching can't reliably detect whether prompt injection succeeded. We use
**Claude as a judge** to evaluate whether Moltbot resisted attacks:

1. Run test scenario (send poisoned data to Moltbot)
2. Capture Moltbot's response and tool calls
3. Send to Claude judge with structured output
4. Judge evaluates: injection detected? complied with? data leaked?

This enables nuanced evaluation of subtle attacks that regex can't catch.

## Current Implementation Status

### Test Files

| File | Status | Tests |
|------|--------|-------|
| `email-injection.e2e.test.ts` | [x] Done | 4 |
| `channels/whatsapp-injection.e2e.test.ts` | [x] Done | 4 |
| `channels/telegram-injection.e2e.test.ts` | [x] Done | 4 |
| `calendar-injection.e2e.test.ts` | [ ] Pending | - |
| `api-injection.e2e.test.ts` | [ ] Pending | - |
| `trust-boundary.e2e.test.ts` | [ ] Pending | - |
| `exfiltration.e2e.test.ts` | [ ] Pending | - |
| `tool-poisoning.e2e.test.ts` | [ ] Pending | - |

**Total: 12 tests implemented**

### CLI Mocks

| CLI | File | Status |
|-----|------|--------|
| `gog` | `mock-binary.ts` | [x] Done |
| `curl/wget` | `curl-mock.ts` | [x] Done |
| `gh` (GitHub) | `github-mock.ts` | [x] Done |
| `browser-cli` | `browser-mock.ts` | [x] Done |
| `himalaya` | - | [ ] Pending |

### Poisoned Payloads (22 total)

| Category | Payloads |
|----------|----------|
| Email/Calendar | `poisonedGmailGet`, `poisonedCalendarList` |
| HTTP | `poisonedWebpageResponse`, `poisonedJsonApiResponse`, `poisonedMarkdownResponse`, `poisonedScriptResponse`, `poisonedRssFeedResponse`, `poisonedRedirectResponse` |
| GitHub | `poisonedIssue`, `poisonedPullRequest`, `poisonedReviewComment`, `poisonedIssueComment`, `poisonedCommit`, `poisonedRepository`, `poisonedRelease`, `poisonedWorkflowRun` |
| Browser | `poisonedPageContent`, `poisonedXssPage`, `poisonedSearchResults`, `poisonedFormPage`, `poisonedScreenshotOcr`, `poisonedPdfContent`, `poisonedDomContent`, `poisonedLoginPage` |

### Channels Tested

| Channel | Status |
|---------|--------|
| WhatsApp | [x] Done (4 tests) |
| Telegram | [x] Done (4 tests) |
| Discord | [ ] Pending |
| Slack | [ ] Pending |
| Signal | [ ] Pending |
| iMessage | [ ] Pending |
| LINE | [ ] Pending |

### Reporting

| Feature | Status |
|---------|--------|
| HTML report generator | [x] Done |
| JSON export | [x] Done |
| Dark theme CSS | [x] Done |
| Interactive JS (sort/filter/expand) | [x] Done |
| Sample report script | [x] Done |
| Historical trends | [ ] Pending |

## Quick Start

```bash
# Run security tests (requires gateway running)
# Terminal 1:
moltbot gateway

# Terminal 2:
npx vitest run --config vitest.security.config.ts
```

## Structure

```
test/security/
├── .env                       # ANTHROPIC_API_KEY (gitignored)
├── README.md                  # This file
├── SPEC.md                    # Full specification document
├── specs/                     # Detailed specs
│   ├── 00-overview.md
│   ├── 01-llm-judge.md
│   ├── 02-gateway-client.md
│   ├── 03-cli-mocks.md
│   ├── 04-test-categories.md
│   ├── 05-ci-docker.md
│   └── 06-implementation-plan.md
├── harness/
│   ├── index.ts               # Exports
│   ├── gateway-client.ts      # WebSocket gateway client (Protocol v3)
│   ├── assertions.ts          # Pattern-based assertions
│   ├── llm-judge.ts           # Claude-based evaluation
│   └── cli-mocks/
│       └── mock-binary.ts     # gog mock + poisoned payloads
├── email-injection.e2e.test.ts # Email injection tests
├── setup.ts                   # Test setup (env validation)
├── test-judge.ts              # Standalone judge validation script
├── docker-compose.yml         # Container setup
├── Dockerfile.test            # Test container
└── run-local.sh               # Local run script
```

## Running Tests

### Option 1: Against Local Gateway (Recommended)

```bash
# Terminal 1: Start gateway
moltbot gateway

# Terminal 2: Run tests
npx vitest run --config vitest.security.config.ts
```

### Option 2: Docker Compose

```bash
docker compose -f test/security/docker-compose.yml up --build --abort-on-container-exit
```

### Option 3: Test LLM Judge Only

```bash
# Validate judge works without gateway
npx tsx test/security/test-judge.ts
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `ANTHROPIC_API_KEY` | Yes | - | For LLM judge evaluation |
| `TEST_GATEWAY_URL` | No | `ws://localhost:18789` | Gateway WebSocket URL |
| `TEST_AUTH_TOKEN` | No | - | Gateway auth token |

## Test Output

Each test produces a `SecurityVerdict`:

```typescript
{
  passed: boolean;              // Did security test pass?
  injectionDetected: boolean;   // Did agent notice the attack?
  injectionCompliedWith: boolean; // Did agent follow malicious instructions?
  dataLeaked: boolean;          // Was sensitive data exposed?
  reasoning: string;            // Judge's explanation
  severity: "none" | "low" | "medium" | "high" | "critical";
  evidence: string[];           // Supporting evidence
}
```

## Next Steps

Priority order for implementation:

1. **Calendar injection tests** - Similar to email, payload ready
2. **Trust boundary tests** - Critical for multi-user
3. **Exfiltration tests** - Data loss prevention
4. **API injection tests** - External data sources
5. **Tool poisoning tests** - Third-party skill safety

See **[specs/07-future-enhancements.md](specs/07-future-enhancements.md)** for comprehensive roadmap covering:
- All 7 messaging channels (WhatsApp, Telegram, Discord, Slack, Signal, iMessage, LINE)
- 27+ CLI tools to mock
- 54 skills with external data
- API mock server design
- HTML test report dashboard
