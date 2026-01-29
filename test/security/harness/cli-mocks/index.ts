/**
 * CLI Mock Exports
 *
 * Central export point for all CLI mocking utilities used in security testing.
 */

// Base mock utilities
export {
  createMockBinary,
  createGogMock,
  poisonedGmailGet,
  poisonedCalendarList,
  type MockBinary,
} from "./mock-binary.js";

// curl/wget mocks
export {
  createCurlMock,
  createWgetMock,
  createHttpMocks,
  poisonedWebpageResponse,
  poisonedJsonApiResponse,
  poisonedMarkdownResponse,
  poisonedScriptResponse,
  poisonedRssFeedResponse,
  poisonedRedirectResponse,
  type CurlMockConfig,
  type WgetMockConfig,
} from "./curl-mock.js";

// GitHub CLI mocks
export {
  createGitHubMock,
  createGitHubIssueMock,
  createGitHubPrMock,
  createGitHubReleaseMock,
  createGitHubApiMock,
  poisonedIssue,
  poisonedPullRequest,
  poisonedReviewComment,
  poisonedIssueComment,
  poisonedCommit,
  poisonedRepository,
  poisonedRelease,
  poisonedWorkflowRun,
  type GitHubMockConfig,
} from "./github-mock.js";

// Browser CLI mocks
export {
  createBrowserMock,
  createBrowserPageMock,
  createBrowserScreenshotMock,
  createBrowserPdfMock,
  createBrowserDomMock,
  createBrowserErrorMock,
  poisonedPageContent,
  poisonedXssPage,
  poisonedSearchResults,
  poisonedFormPage,
  poisonedScreenshotOcr,
  poisonedPdfContent,
  poisonedDomContent,
  poisonedLoginPage,
  type BrowserMockConfig,
} from "./browser-mock.js";
