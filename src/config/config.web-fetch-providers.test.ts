import { describe, expect, it } from "vitest";

import { validateConfigObject } from "./config.js";

describe("web fetch providers config", () => {
  it("accepts exa content extraction config", () => {
    const res = validateConfigObject({
      tools: {
        web: {
          fetch: {
            enabled: true,
            exa: {
              enabled: true,
              apiKey: "test-key",
              contents: true,
              maxChars: 2000,
              timeoutSeconds: 30,
            },
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("accepts firecrawl config", () => {
    const res = validateConfigObject({
      tools: {
        web: {
          fetch: {
            enabled: true,
            firecrawl: {
              enabled: true,
              apiKey: "test-key",
              baseUrl: "https://api.firecrawl.dev",
              onlyMainContent: true,
              maxAgeMs: 86400000,
              timeoutSeconds: 60,
            },
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("accepts both exa and firecrawl config", () => {
    const res = validateConfigObject({
      tools: {
        web: {
          fetch: {
            enabled: true,
            readability: true,
            exa: {
              enabled: true,
              apiKey: "exa-key",
              contents: true,
              maxChars: 1500,
            },
            firecrawl: {
              enabled: true,
              apiKey: "firecrawl-key",
              onlyMainContent: true,
            },
          },
        },
      },
    });

    expect(res.ok).toBe(true);
  });

  it("rejects invalid exa maxChars", () => {
    const res = validateConfigObject({
      tools: {
        web: {
          fetch: {
            exa: {
              maxChars: -100,
            },
          },
        },
      },
    });

    expect(res.ok).toBe(false);
  });

  it("rejects invalid firecrawl maxAgeMs", () => {
    const res = validateConfigObject({
      tools: {
        web: {
          fetch: {
            firecrawl: {
              maxAgeMs: -1000,
            },
          },
        },
      },
    });

    expect(res.ok).toBe(false);
  });
});
