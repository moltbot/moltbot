/**
 * GitHub Copilot usage tracking.
 *
 * Note: The official @github/copilot-sdk does not currently expose usage/quota APIs.
 * This module returns a placeholder indicating that usage tracking is not available.
 */

import { PROVIDER_LABELS } from "./provider-usage.shared.js";
import type { ProviderUsageSnapshot } from "./provider-usage.types.js";

export async function fetchCopilotUsage(
  _token: string,
  _timeoutMs: number,
  _fetchFn: typeof fetch,
): Promise<ProviderUsageSnapshot> {
  // The official SDK does not expose usage/quota APIs
  // Return a placeholder indicating unavailable status
  return {
    provider: "github-copilot",
    displayName: PROVIDER_LABELS["github-copilot"],
    windows: [],
    error: "Usage tracking not available via official SDK",
  };
}
