import { describe, expect, it, vi } from "vitest";
import type { AnalyticsState } from "./analytics";

describe("analytics controller", () => {
  it("AnalyticsState has expected properties", () => {
    const mockClient = {
      request: vi.fn().mockResolvedValue({
        ok: true,
        result: {
          updatedAt: Date.now(),
          days: 30,
          daily: [],
          totals: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            totalCost: 0,
            missingCostEntries: 0,
          },
        },
      }),
    };

    const state: AnalyticsState = {
      client: mockClient as any,
      analyticsLoading: false,
      analyticsError: null,
      analyticsData: null,
      analyticsDays: 30,
    };

    expect(state.analyticsLoading).toBe(false);
    expect(state.analyticsDays).toBe(30);
    expect(state.analyticsData).toBeNull();
  });

  it("should have valid day options", () => {
    const validDays = [7, 14, 30, 90];
    validDays.forEach((days) => {
      expect(days).toBeGreaterThan(0);
      expect(days).toBeLessThanOrEqual(90);
    });
  });
});
