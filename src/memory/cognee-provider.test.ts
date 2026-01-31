import { describe, expect, it, vi } from "vitest";
import { CogneeMemoryProvider } from "./cognee-provider.js";
import type { ClawdbotConfig } from "../config/config.js";

const searchMock = vi.fn();

vi.mock("./cognee-client.js", () => {
  class CogneeClient {
    search = searchMock;
  }

  return { CogneeClient };
});

describe("CogneeMemoryProvider", () => {
  it("maps search results into memory snippets", async () => {
    const mockConfig: ClawdbotConfig = {
      agents: {
        defaults: {
          workspace: "/tmp/test-workspace",
        },
      },
    };
    searchMock.mockResolvedValue({
      results: [
        {
          id: "result-1",
          text: "A".repeat(800),
          score: 0.85,
          metadata: {
            path: "memory/test.md",
            source: "memory",
          },
        },
      ],
      query: "test query",
      searchType: "GRAPH_COMPLETION",
    });

    const provider = new CogneeMemoryProvider(mockConfig, "test-agent", ["memory"]);

    const results = await provider.search("test query");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      path: "memory/test.md",
      source: "memory",
      score: 0.85,
    });
    expect(results[0].snippet.length).toBeGreaterThan(700);
    expect(results[0].snippet.endsWith("...")).toBe(true);
  });

  it("defaults missing metadata to safe values", async () => {
    searchMock.mockResolvedValue({
      results: [
        {
          id: "result-2",
          text: "Short result",
          score: 0.2,
        },
      ],
      query: "missing metadata",
      searchType: "GRAPH_COMPLETION",
    });

    const mockConfig: ClawdbotConfig = {
      agents: {
        defaults: {
          workspace: "/tmp/test-workspace",
        },
      },
    };
    const provider = new CogneeMemoryProvider(mockConfig, "test-agent", ["memory"]);

    const results = await provider.search("missing metadata");

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      path: "unknown",
      source: "memory",
      score: 0.2,
      snippet: "Short result",
    });
  });
});
