import type { Command } from "commander";
import { createInterface } from "readline";

import {
  detectSuspiciousPatterns,
  wrapExternalContent,
  type ExternalContentSource,
} from "../security/external-content.js";
import { defaultRuntime } from "../runtime.js";
import { isRich, theme } from "../terminal/theme.js";

type WrapOptions = {
  source?: string;
  url?: string;
  stdin?: boolean;
  json?: boolean;
  noWarning?: boolean;
};

async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    const lines: string[] = [];
    const rl = createInterface({ input: process.stdin });
    rl.on("line", (line) => lines.push(line));
    rl.on("close", () => resolve(lines.join("\n")));
  });
}

async function fetchUrl(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

export function registerSecurityWrapCli(securityCmd: Command) {
  securityCmd
    .command("wrap")
    .description("Wrap external content with security boundaries for safe LLM processing")
    .option("--source <source>", "Content source label (email, webhook, api, or custom)", "api")
    .option("--url <url>", "Fetch content from URL")
    .option("--stdin", "Read content from stdin", false)
    .option("--no-warning", "Omit security warning header", false)
    .option("--json", "Output as JSON with metadata", false)
    .addHelpText(
      "after",
      `
Examples:
  echo '{"data": "test"}' | moltbot security wrap --stdin --source api
  moltbot security wrap --url https://api.example.com/data
  curl -s https://api.example.com | moltbot security wrap --stdin --source "external-api"

Use this when fetching external APIs in skills to protect against prompt injection.
`,
    )
    .action(async (opts: WrapOptions) => {
      const rich = isRich();

      // Determine content source
      let content: string;
      let sourceLabel = opts.source || "api";

      if (opts.url) {
        try {
          content = await fetchUrl(opts.url);
          sourceLabel = opts.source || opts.url;
        } catch (err) {
          defaultRuntime.error(
            `Error fetching URL: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
      } else if (opts.stdin || !process.stdin.isTTY) {
        content = await readStdin();
      } else {
        defaultRuntime.error("No input provided. Use --url or --stdin, or pipe content.");
        process.exit(1);
      }

      // Detect suspicious patterns
      const suspiciousPatterns = detectSuspiciousPatterns(content);
      if (suspiciousPatterns.length > 0) {
        const warn = rich
          ? theme.warn("⚠️  SUSPICIOUS PATTERNS DETECTED:")
          : "WARNING: SUSPICIOUS PATTERNS DETECTED:";
        defaultRuntime.error(warn);
        for (const pattern of suspiciousPatterns) {
          defaultRuntime.error(`  - ${pattern}`);
        }
        defaultRuntime.error("");
      }

      // Map source to type
      const sourceType: ExternalContentSource =
        sourceLabel === "email"
          ? "email"
          : sourceLabel === "webhook"
            ? "webhook"
            : sourceLabel === "api"
              ? "api"
              : "unknown";

      // Wrap content
      const wrapped = wrapExternalContent(content, {
        source: sourceType,
        sender: sourceLabel !== sourceType ? sourceLabel : undefined,
        includeWarning: opts.noWarning !== true,
      });

      if (opts.json) {
        const output = {
          wrapped,
          metadata: {
            source: sourceLabel,
            sourceType,
            timestamp: new Date().toISOString(),
            suspiciousPatterns: suspiciousPatterns.length > 0 ? suspiciousPatterns : undefined,
            contentLength: content.length,
            wrappedLength: wrapped.length,
          },
        };
        defaultRuntime.log(JSON.stringify(output, null, 2));
      } else {
        defaultRuntime.log(wrapped);
      }
    });
}
