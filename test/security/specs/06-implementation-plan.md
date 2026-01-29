# Implementation Plan

## Current Status

### Phase 1: Foundation
- [x] Spec document (SPEC.md)
- [x] Harness scaffolding (gateway-client, assertions, llm-judge, cli-mocks)
- [x] Docker Compose setup
- [x] GitHub Actions workflow
- [x] Vitest configuration
- [x] Local .env with Anthropic API key
- [x] Install npm dependencies (@anthropic-ai/sdk, ws)
- [x] Discover actual gateway WebSocket protocol (Protocol v3)
- [x] Wire up gateway client to real protocol
- [x] LLM judge tested with mock data

### Phase 2: First Working Tests
- [x] Email injection test file (4 tests)
- [x] Enable tests (removed .skip)
- [ ] Run against live gateway (requires gateway running)
- [ ] Debug and iterate on real responses

### Phase 3: Expanded Coverage
- [x] WhatsApp injection tests (4 tests) - `channels/whatsapp-injection.e2e.test.ts`
- [x] Telegram injection tests (4 tests) - `channels/telegram-injection.e2e.test.ts`
- [ ] Calendar injection tests
- [ ] Trust boundary tests
- [ ] Exfiltration tests
- [ ] API injection tests
- [ ] Tool poisoning tests

### Phase 4: CLI Mocks
- [x] gog mock (Gmail, Calendar)
- [x] curl/wget mocks
- [x] GitHub CLI (gh) mock
- [x] Browser CLI mock
- [ ] himalaya (email) mock
- [ ] Generic HTTP mock server

### Phase 5: Reporting
- [x] HTML report generator
- [x] JSON report export
- [x] CSS dark theme dashboard
- [x] JavaScript interactivity (sort, filter, expand)
- [x] Sample report generation script
- [ ] Historical trend tracking
- [ ] CI integration with report artifacts

---

## Detailed Progress

### 1.1 Install Dependencies
```bash
pnpm add -D @anthropic-ai/sdk ws @types/ws
```
**Status:** Done

### 1.2 Discover Gateway Protocol
**Goal**: Understand the actual WebSocket message format.

**Completed:**
- [x] Read `src/gateway/` to find WebSocket handler
- [x] Check existing E2E tests for protocol examples
- [x] Document message types:
  - [x] Sending user messages (`agent` method)
  - [x] Receiving agent responses (`chat` events)
  - [x] Receiving tool call notifications (in content blocks)
  - [x] Authentication flow (`connect` handshake)

### 1.3 Wire Up Gateway Client
- [x] Update `harness/gateway-client.ts` to Protocol v3
- [x] Implement connection handshake
- [x] Implement request/response correlation
- [x] Implement chat event streaming

### 1.4 Validate LLM Judge
- [x] Test judge with mock "resisted" scenario
- [x] Test judge with mock "complied" scenario
- [x] Verify severity and evidence extraction

---

## Phase 2: First Working Test

### 2.1 Enable Email Injection Test
- [x] Remove `.skip` from `email-injection.e2e.test.ts`
- [x] Update to use new gateway client API

### 2.2 Run Against Local Gateway
```bash
# Terminal 1
moltbot gateway

# Terminal 2
npx vitest run --config vitest.security.config.ts
```
**Status:** Ready to run (requires gateway)

---

## Phase 3: Expand Coverage

### 3.1 Test Files

| File | Status | Tests |
|------|--------|-------|
| `email-injection.e2e.test.ts` | [x] Done | 4 |
| `channels/whatsapp-injection.e2e.test.ts` | [x] Done | 4 |
| `channels/telegram-injection.e2e.test.ts` | [x] Done | 4 |
| `calendar-injection.e2e.test.ts` | [ ] Pending | - |
| `trust-boundary.e2e.test.ts` | [ ] Pending | - |
| `exfiltration.e2e.test.ts` | [ ] Pending | - |
| `api-injection.e2e.test.ts` | [ ] Pending | - |
| `tool-poisoning.e2e.test.ts` | [ ] Pending | - |

### 3.2 CLI Mocks

| Mock | File | Status |
|------|------|--------|
| gog (Gmail/Calendar) | `mock-binary.ts` | [x] Done |
| curl/wget | `curl-mock.ts` | [x] Done |
| GitHub CLI | `github-mock.ts` | [x] Done |
| Browser CLI | `browser-mock.ts` | [x] Done |
| himalaya | - | [ ] Pending |

### 3.3 Poisoned Payloads

| Payload | Status |
|---------|--------|
| `poisonedGmailGet` | [x] Done |
| `poisonedCalendarList` | [x] Done |
| `poisonedWebpageResponse` | [x] Done |
| `poisonedJsonApiResponse` | [x] Done |
| `poisonedMarkdownResponse` | [x] Done |
| `poisonedScriptResponse` | [x] Done |
| `poisonedRssFeedResponse` | [x] Done |
| `poisonedRedirectResponse` | [x] Done |
| `poisonedIssue` | [x] Done |
| `poisonedPullRequest` | [x] Done |
| `poisonedReviewComment` | [x] Done |
| `poisonedCommit` | [x] Done |
| `poisonedRelease` | [x] Done |
| `poisonedPageContent` | [x] Done |
| `poisonedXssPage` | [x] Done |
| `poisonedSearchResults` | [x] Done |
| `poisonedFormPage` | [x] Done |
| `poisonedScreenshotOcr` | [x] Done |
| `poisonedPdfContent` | [x] Done |
| `poisonedDomContent` | [x] Done |
| `poisonedLoginPage` | [x] Done |

---

## Phase 4: Hardening

### 4.1 Edge Cases
- [ ] Multi-turn attacks
- [ ] Timing-based detection
- [ ] Fuzzing with generated payloads

### 4.2 Reporting
- [x] Generate HTML report after test run
- [x] Generate JSON report for CI integration
- [ ] Track historical pass/fail rates
- [ ] Regression alerts

### 4.3 Documentation
- [x] README.md with current status
- [x] Spec files (00-07)
- [ ] Add to main docs site
- [ ] Contribution guide for new test cases

---

## Summary

| Category | Done | Pending |
|----------|------|---------|
| Test Files | 3 | 5 |
| Test Cases | 12 | ~20 |
| CLI Mocks | 4 | 1 |
| Poisoned Payloads | 22 | ~5 |
| Report Features | 5 | 2 |
