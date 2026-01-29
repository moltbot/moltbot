/**
 * HTML/JSON Report Generator for Security Test Harness
 *
 * Generates interactive HTML reports and machine-readable JSON exports
 * for security test runs.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import type { SecurityVerdict } from "./llm-judge.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Represents a complete test run with all results and metadata
 */
export interface TestRun {
  id: string;
  timestamp: Date;
  duration: number;
  results: Map<string, TestResult>;
  environment: {
    gatewayVersion: string;
    nodeVersion: string;
    platform: string;
  };
}

/**
 * Extended test result combining verdict with test metadata
 */
export interface TestResult {
  testName: string;
  category: "prompt_injection" | "exfiltration" | "trust_boundary" | "tool_poisoning";
  verdict: SecurityVerdict;
  injectionPayload: string;
  userCommand: string;
  agentResponse: string;
  toolCalls: Array<{ tool: string; args: Record<string, unknown>; result?: unknown }>;
  duration: number;
}

/**
 * JSON-serializable representation of a test run
 */
export interface TestRunJson {
  id: string;
  timestamp: string;
  duration: number;
  summary: {
    total: number;
    passed: number;
    failed: number;
    passRate: number;
    byCategory: Record<string, { passed: number; failed: number }>;
    bySeverity: Record<string, number>;
  };
  results: Array<{
    testName: string;
    category: string;
    passed: boolean;
    severity: string;
    injectionDetected: boolean;
    injectionCompliedWith: boolean;
    dataLeaked: boolean;
    reasoning: string;
    evidence: string[];
    injectionPayload: string;
    userCommand: string;
    agentResponse: string;
    toolCalls: Array<{ tool: string; args: Record<string, unknown>; result?: unknown }>;
    duration: number;
  }>;
  environment: {
    gatewayVersion: string;
    nodeVersion: string;
    platform: string;
  };
}

/**
 * Compute summary statistics from test results
 */
function computeSummary(results: Map<string, TestResult>): TestRunJson["summary"] {
  const allResults = [...results.values()];
  const passed = allResults.filter((r) => r.verdict.passed).length;
  const failed = allResults.length - passed;

  const byCategory: Record<string, { passed: number; failed: number }> = {};
  const bySeverity: Record<string, number> = {
    none: 0,
    low: 0,
    medium: 0,
    high: 0,
    critical: 0,
  };

  for (const result of allResults) {
    if (!byCategory[result.category]) {
      byCategory[result.category] = { passed: 0, failed: 0 };
    }
    if (result.verdict.passed) {
      byCategory[result.category].passed++;
    } else {
      byCategory[result.category].failed++;
      bySeverity[result.verdict.severity]++;
    }
  }

  return {
    total: allResults.length,
    passed,
    failed,
    passRate: allResults.length > 0 ? Math.round((passed / allResults.length) * 100) : 0,
    byCategory,
    bySeverity,
  };
}

/**
 * Generate a JSON report from a test run
 */
export function generateJsonReport(run: TestRun): TestRunJson {
  const summary = computeSummary(run.results);

  const results = [...run.results.entries()].map(([_name, result]) => ({
    testName: result.testName,
    category: result.category,
    passed: result.verdict.passed,
    severity: result.verdict.severity,
    injectionDetected: result.verdict.injectionDetected,
    injectionCompliedWith: result.verdict.injectionCompliedWith,
    dataLeaked: result.verdict.dataLeaked,
    reasoning: result.verdict.reasoning,
    evidence: result.verdict.evidence,
    injectionPayload: result.injectionPayload,
    userCommand: result.userCommand,
    agentResponse: result.agentResponse,
    toolCalls: result.toolCalls,
    duration: result.duration,
  }));

  return {
    id: run.id,
    timestamp: run.timestamp.toISOString(),
    duration: run.duration,
    summary,
    results,
    environment: run.environment,
  };
}

/**
 * Escape HTML special characters to prevent XSS
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Format duration in human-readable form
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60000);
  const secs = Math.round((ms % 60000) / 1000);
  return `${mins}m ${secs}s`;
}

/**
 * Generate category breakdown HTML
 */
function generateCategoryBreakdown(
  byCategory: Record<string, { passed: number; failed: number }>,
): string {
  const categoryLabels: Record<string, string> = {
    prompt_injection: "Prompt Injection",
    exfiltration: "Exfiltration",
    trust_boundary: "Trust Boundary",
    tool_poisoning: "Tool Poisoning",
  };

  return Object.entries(byCategory)
    .map(([cat, stats]) => {
      const total = stats.passed + stats.failed;
      const rate = total > 0 ? Math.round((stats.passed / total) * 100) : 0;
      const label = categoryLabels[cat] || cat;
      return `
        <div class="category-row">
          <span class="category-name">${escapeHtml(label)}</span>
          <span class="category-stats">${stats.passed}/${total} (${rate}%)</span>
          <div class="category-bar">
            <div class="category-bar-fill ${stats.failed > 0 ? "has-failures" : ""}" style="width: ${rate}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

/**
 * Generate results table rows HTML
 */
function generateResultsRows(results: TestRunJson["results"]): string {
  return results
    .map((result, index) => {
      const statusIcon = result.passed ? "pass-icon" : "fail-icon";
      const statusText = result.passed ? "PASS" : "FAIL";
      const severityClass = `severity-${result.severity}`;

      return `
        <tr class="result-row ${result.passed ? "passed" : "failed"}" data-index="${index}" data-category="${result.category}" data-status="${result.passed ? "passed" : "failed"}">
          <td class="status-cell">
            <span class="status-icon ${statusIcon}">${result.passed ? "&#10003;" : "&#10007;"}</span>
            <span class="status-text">${statusText}</span>
          </td>
          <td class="name-cell">${escapeHtml(result.testName)}</td>
          <td class="category-cell">${escapeHtml(result.category)}</td>
          <td class="severity-cell"><span class="severity-badge ${severityClass}">${result.severity}</span></td>
          <td class="duration-cell">${formatDuration(result.duration)}</td>
          <td class="actions-cell">
            <button class="expand-btn" onclick="toggleDetails(${index})">View Details</button>
          </td>
        </tr>
        <tr class="details-row" id="details-${index}" style="display: none;">
          <td colspan="6">
            <div class="details-content">
              <div class="detail-section">
                <h4>Verdict Summary</h4>
                <div class="verdict-flags">
                  <span class="flag ${result.injectionDetected ? "flag-good" : "flag-bad"}">
                    Injection Detected: ${result.injectionDetected ? "Yes" : "No"}
                  </span>
                  <span class="flag ${!result.injectionCompliedWith ? "flag-good" : "flag-bad"}">
                    Complied with Injection: ${result.injectionCompliedWith ? "Yes" : "No"}
                  </span>
                  <span class="flag ${!result.dataLeaked ? "flag-good" : "flag-bad"}">
                    Data Leaked: ${result.dataLeaked ? "Yes" : "No"}
                  </span>
                </div>
              </div>

              <div class="detail-section">
                <h4>Injection Payload</h4>
                <div class="code-block">
                  <button class="copy-btn" onclick="copyToClipboard(this, 'payload-${index}')">Copy</button>
                  <pre id="payload-${index}">${escapeHtml(result.injectionPayload)}</pre>
                </div>
              </div>

              <div class="detail-section">
                <h4>User Command</h4>
                <div class="code-block user-command">
                  <pre>${escapeHtml(result.userCommand)}</pre>
                </div>
              </div>

              <div class="detail-section">
                <h4>Agent Response</h4>
                <div class="code-block agent-response">
                  <button class="copy-btn" onclick="copyToClipboard(this, 'response-${index}')">Copy</button>
                  <pre id="response-${index}">${escapeHtml(result.agentResponse)}</pre>
                </div>
              </div>

              <div class="detail-section">
                <h4>Tool Calls</h4>
                <div class="code-block tool-calls">
                  <button class="copy-btn" onclick="copyToClipboard(this, 'toolcalls-${index}')">Copy</button>
                  <pre id="toolcalls-${index}">${escapeHtml(JSON.stringify(result.toolCalls, null, 2))}</pre>
                </div>
              </div>

              <div class="detail-section">
                <h4>Judge Reasoning</h4>
                <div class="reasoning-block">
                  <p>${escapeHtml(result.reasoning)}</p>
                </div>
              </div>

              ${
                result.evidence.length > 0
                  ? `
              <div class="detail-section">
                <h4>Evidence</h4>
                <ul class="evidence-list">
                  ${result.evidence.map((e) => `<li>${escapeHtml(e)}</li>`).join("")}
                </ul>
                <button class="copy-btn" onclick="copyEvidence(${index})">Copy All Evidence</button>
              </div>
              `
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

/**
 * Generate the complete HTML report
 */
export async function generateHtmlReport(run: TestRun): Promise<string> {
  const json = generateJsonReport(run);
  const { summary } = json;

  // Load CSS and JS assets
  let cssContent: string;
  let jsContent: string;

  try {
    cssContent = await readFile(join(__dirname, "../reports/assets/style.css"), "utf-8");
  } catch {
    // Fallback if assets not found - use inline minimal styles
    cssContent = getInlineCss();
  }

  try {
    jsContent = await readFile(join(__dirname, "../reports/assets/script.js"), "utf-8");
  } catch {
    jsContent = getInlineJs();
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Security Test Report - ${escapeHtml(run.id)}</title>
  <style>
${cssContent}
  </style>
</head>
<body>
  <header class="report-header">
    <div class="header-content">
      <h1>Security Test Report</h1>
      <div class="run-info">
        <span class="run-id">Run: ${escapeHtml(run.id)}</span>
        <span class="timestamp">${run.timestamp.toLocaleString()}</span>
        <span class="duration">Duration: ${formatDuration(run.duration)}</span>
      </div>
    </div>
  </header>

  <main class="report-main">
    <section class="summary-section">
      <div class="summary-cards">
        <div class="card card-total">
          <div class="card-number">${summary.total}</div>
          <div class="card-label">Total Tests</div>
        </div>
        <div class="card card-passed">
          <div class="card-number">${summary.passed}</div>
          <div class="card-label">Passed</div>
        </div>
        <div class="card card-failed">
          <div class="card-number">${summary.failed}</div>
          <div class="card-label">Failed</div>
        </div>
        <div class="card card-rate">
          <div class="card-number">${summary.passRate}%</div>
          <div class="card-label">Pass Rate</div>
        </div>
      </div>

      ${
        summary.failed > 0
          ? `
      <div class="severity-breakdown">
        <h3>Failure Severity</h3>
        <div class="severity-badges">
          ${summary.bySeverity.critical > 0 ? `<span class="severity-badge severity-critical">Critical: ${summary.bySeverity.critical}</span>` : ""}
          ${summary.bySeverity.high > 0 ? `<span class="severity-badge severity-high">High: ${summary.bySeverity.high}</span>` : ""}
          ${summary.bySeverity.medium > 0 ? `<span class="severity-badge severity-medium">Medium: ${summary.bySeverity.medium}</span>` : ""}
          ${summary.bySeverity.low > 0 ? `<span class="severity-badge severity-low">Low: ${summary.bySeverity.low}</span>` : ""}
        </div>
      </div>
      `
          : ""
      }

      <div class="category-breakdown">
        <h3>Category Breakdown</h3>
        ${generateCategoryBreakdown(summary.byCategory)}
      </div>
    </section>

    <section class="results-section">
      <div class="results-header">
        <h2>Test Results</h2>
        <div class="filter-controls">
          <select id="status-filter" onchange="filterResults()">
            <option value="all">All Status</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>
          <select id="category-filter" onchange="filterResults()">
            <option value="all">All Categories</option>
            <option value="prompt_injection">Prompt Injection</option>
            <option value="exfiltration">Exfiltration</option>
            <option value="trust_boundary">Trust Boundary</option>
            <option value="tool_poisoning">Tool Poisoning</option>
          </select>
        </div>
      </div>

      <table class="results-table" id="results-table">
        <thead>
          <tr>
            <th class="sortable" onclick="sortTable(0)">Status</th>
            <th class="sortable" onclick="sortTable(1)">Test Name</th>
            <th class="sortable" onclick="sortTable(2)">Category</th>
            <th class="sortable" onclick="sortTable(3)">Severity</th>
            <th class="sortable" onclick="sortTable(4)">Duration</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${generateResultsRows(json.results)}
        </tbody>
      </table>
    </section>

    <section class="environment-section">
      <h3>Environment</h3>
      <div class="env-info">
        <span>Gateway: ${escapeHtml(run.environment.gatewayVersion)}</span>
        <span>Node: ${escapeHtml(run.environment.nodeVersion)}</span>
        <span>Platform: ${escapeHtml(run.environment.platform)}</span>
      </div>
    </section>
  </main>

  <footer class="report-footer">
    <p>Generated by Moltbot Security Test Harness</p>
  </footer>

  <script>
    // Embed test data for JS operations
    const testData = ${JSON.stringify(json.results)};
${jsContent}
  </script>
</body>
</html>`;

  return html;
}

/**
 * Save report files to output directory
 */
export async function saveReport(run: TestRun, outputDir: string): Promise<void> {
  // Create output directory structure
  const runDir = join(outputDir, "runs", run.id.replace(/[:.]/g, "-"));
  await mkdir(runDir, { recursive: true });

  // Generate and save HTML report
  const htmlContent = await generateHtmlReport(run);
  await writeFile(join(runDir, "report.html"), htmlContent, "utf-8");

  // Generate and save JSON report
  const jsonContent = generateJsonReport(run);
  await writeFile(join(runDir, "report.json"), JSON.stringify(jsonContent, null, 2), "utf-8");

  // Update trends file
  await updateTrends(run, outputDir);
}

/**
 * Update historical trends data
 */
async function updateTrends(run: TestRun, outputDir: string): Promise<void> {
  const trendsPath = join(outputDir, "trends.json");
  let trends: Array<{
    id: string;
    timestamp: string;
    passed: number;
    failed: number;
    passRate: number;
  }> = [];

  try {
    const existing = await readFile(trendsPath, "utf-8");
    trends = JSON.parse(existing);
  } catch {
    // File doesn't exist yet
  }

  const summary = computeSummary(run.results);
  trends.push({
    id: run.id,
    timestamp: run.timestamp.toISOString(),
    passed: summary.passed,
    failed: summary.failed,
    passRate: summary.passRate,
  });

  // Keep last 100 runs
  if (trends.length > 100) {
    trends = trends.slice(-100);
  }

  await writeFile(trendsPath, JSON.stringify(trends, null, 2), "utf-8");
}

/**
 * Inline CSS fallback when assets not available
 */
function getInlineCss(): string {
  return `
    :root {
      --pass: #22c55e;
      --fail: #ef4444;
      --warn: #f59e0b;
      --bg: #0f172a;
      --card: #1e293b;
      --text: #f8fafc;
    }
    body { background: var(--bg); color: var(--text); font-family: system-ui; margin: 0; padding: 20px; }
    .card { background: var(--card); padding: 20px; border-radius: 8px; }
    .card-passed { border-left: 4px solid var(--pass); }
    .card-failed { border-left: 4px solid var(--fail); }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #334155; }
    .passed { background: rgba(34, 197, 94, 0.1); }
    .failed { background: rgba(239, 68, 68, 0.1); }
  `;
}

/**
 * Inline JS fallback when assets not available
 */
function getInlineJs(): string {
  return `
    function toggleDetails(index) {
      const row = document.getElementById('details-' + index);
      row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
    }
    function copyToClipboard(btn, id) {
      const text = document.getElementById(id).textContent;
      navigator.clipboard.writeText(text);
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = 'Copy', 2000);
    }
    function copyEvidence(index) {
      const evidence = testData[index].evidence.join('\\n');
      navigator.clipboard.writeText(evidence);
    }
    function filterResults() {
      const status = document.getElementById('status-filter').value;
      const category = document.getElementById('category-filter').value;
      document.querySelectorAll('.result-row').forEach(row => {
        const matchStatus = status === 'all' || row.dataset.status === status;
        const matchCategory = category === 'all' || row.dataset.category === category;
        row.style.display = matchStatus && matchCategory ? '' : 'none';
        const detailsRow = document.getElementById('details-' + row.dataset.index);
        if (detailsRow) detailsRow.style.display = 'none';
      });
    }
    function sortTable(col) {
      const table = document.getElementById('results-table');
      const rows = Array.from(table.querySelectorAll('tbody .result-row'));
      const sorted = rows.sort((a, b) => {
        const aVal = a.cells[col].textContent;
        const bVal = b.cells[col].textContent;
        return aVal.localeCompare(bVal);
      });
      const tbody = table.querySelector('tbody');
      sorted.forEach(row => {
        const detailsRow = document.getElementById('details-' + row.dataset.index);
        tbody.appendChild(row);
        if (detailsRow) tbody.appendChild(detailsRow);
      });
    }
  `;
}

/**
 * Create a new test run ID based on timestamp
 */
export function createTestRunId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}

/**
 * Create a TestRun from JudgeInput and SecurityVerdict pairs
 */
export function createTestRun(
  results: Array<{
    input: {
      testName: string;
      testCategory: "prompt_injection" | "exfiltration" | "trust_boundary" | "tool_poisoning";
      injectionPayload: string;
      userCommand: string;
      agentResponse: string;
      toolCalls: Array<{ tool: string; args: Record<string, unknown>; result?: unknown }>;
    };
    verdict: SecurityVerdict;
    duration: number;
  }>,
  totalDuration: number,
  environment?: Partial<TestRun["environment"]>,
): TestRun {
  const resultMap = new Map<string, TestResult>();

  for (const { input, verdict, duration } of results) {
    resultMap.set(input.testName, {
      testName: input.testName,
      category: input.testCategory,
      verdict,
      injectionPayload: input.injectionPayload,
      userCommand: input.userCommand,
      agentResponse: input.agentResponse,
      toolCalls: input.toolCalls,
      duration,
    });
  }

  return {
    id: createTestRunId(),
    timestamp: new Date(),
    duration: totalDuration,
    results: resultMap,
    environment: {
      gatewayVersion: environment?.gatewayVersion ?? "unknown",
      nodeVersion: environment?.nodeVersion ?? process.version,
      platform: environment?.platform ?? process.platform,
    },
  };
}
