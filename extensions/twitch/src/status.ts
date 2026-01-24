/**
 * Twitch status issues collector.
 *
 * Detects and reports configuration issues for Twitch accounts.
 */

import { getAccountConfig } from "./config.js";
import type { ChannelAccountSnapshot, ChannelStatusIssue } from "./types.js";
import { isAccountConfigured } from "./utils/twitch.js";

/**
 * Collect status issues for Twitch accounts.
 *
 * Analyzes account snapshots and detects configuration problems,
 * authentication issues, and other potential problems.
 *
 * @param accounts - Array of account snapshots to analyze
 * @param getCfg - Optional function to get full config for additional checks
 * @returns Array of detected status issues
 *
 * @example
 * const issues = collectTwitchStatusIssues(accountSnapshots);
 * if (issues.length > 0) {
 *   console.warn("Twitch configuration issues detected:");
 *   issues.forEach(issue => console.warn(`- ${issue.message}`));
 * }
 */
export function collectTwitchStatusIssues(
	accounts: ChannelAccountSnapshot[],
	getCfg?: () => unknown,
): ChannelStatusIssue[] {
	const issues: ChannelStatusIssue[] = [];

	for (const entry of accounts) {
		const accountId = entry.accountId;

		// Skip if not a Twitch account
		if (!accountId) continue;

		// Get full account config if available
		let account: ReturnType<typeof getAccountConfig> | null = null;
		if (getCfg) {
			try {
				const cfg = getCfg() as {
					channels?: { twitch?: { accounts?: Record<string, unknown> } };
				};
				account = getAccountConfig(cfg, accountId);
			} catch {
				// Ignore config access errors
			}
		}

		// Check 1: Account not configured
		if (!entry.configured) {
			issues.push({
				channel: "twitch",
				accountId,
				kind: "config",
				message: "Twitch account is not properly configured",
				fix: "Add required fields: username, token, and clientId to your account configuration",
			});
			continue; // Skip further checks if not configured
		}

		// Check 2: Account disabled
		if (entry.enabled === false) {
			issues.push({
				channel: "twitch",
				accountId,
				kind: "config",
				message: "Twitch account is disabled",
				fix: "Set enabled: true in your account configuration to enable this account",
			});
			continue; // Skip further checks if disabled
		}

		// Checks that require account config
		if (account && isAccountConfigured(account)) {
			// Check 3: Missing clientId
			if (!account.clientId) {
				issues.push({
					channel: "twitch",
					accountId,
					kind: "config",
					message: "Twitch client ID is required",
					fix: "Add clientId to your Twitch account configuration (from Twitch Developer Portal)",
				});
			}

			// Check 4: Token format warning (normalized, but may indicate config issue)
			if (account.token?.startsWith("oauth:")) {
				issues.push({
					channel: "twitch",
					accountId,
					kind: "config",
					message: "Token contains 'oauth:' prefix (will be stripped)",
					fix: "The 'oauth:' prefix is optional. You can use just the token value, or keep it as-is (it will be normalized automatically).",
				});
			}

			// Check 5: clientSecret provided without refreshToken
			if (account.clientSecret && !account.refreshToken) {
				issues.push({
					channel: "twitch",
					accountId,
					kind: "config",
					message: "clientSecret provided without refreshToken",
					fix: "For automatic token refresh, provide both clientSecret and refreshToken. Otherwise, clientSecret is not needed.",
				});
			}

			// Check 6: Access control warnings
			if (account.allowFrom && account.allowFrom.length === 0) {
				issues.push({
					channel: "twitch",
					accountId,
					kind: "config",
					message: "allowFrom is configured but empty",
					fix: "Either add user IDs to allowFrom, remove the allowFrom field, or use allowedRoles instead.",
				});
			}

			// Check 7: Invalid role combinations
			if (
				account.allowedRoles?.includes("all") &&
				account.allowFrom &&
				account.allowFrom.length > 0
			) {
				issues.push({
					channel: "twitch",
					accountId,
					kind: "intent",
					message:
						"allowedRoles is set to 'all' but allowFrom is also configured",
					fix: "When allowedRoles is 'all', the allowFrom list is not needed. Remove allowFrom or set allowedRoles to specific roles.",
				});
			}
		}

		// Check 8: Runtime errors
		if (entry.lastError) {
			issues.push({
				channel: "twitch",
				accountId,
				kind: "runtime",
				message: `Last error: ${entry.lastError}`,
				fix: "Check your token validity and network connection. Ensure the bot has the required OAuth scopes.",
			});
		}

		// Check 9: Account never connected successfully
		if (
			entry.configured &&
			!entry.running &&
			!entry.lastStartAt &&
			!entry.lastInboundAt &&
			!entry.lastOutboundAt
		) {
			issues.push({
				channel: "twitch",
				accountId,
				kind: "runtime",
				message: "Account has never connected successfully",
				fix: "Start the Twitch gateway to begin receiving messages. Check logs for connection errors.",
			});
		}

		// Check 10: Long-running connection may need reconnection
		if (entry.running && entry.lastStartAt) {
			const uptime = Date.now() - entry.lastStartAt;
			const daysSinceStart = uptime / (1000 * 60 * 60 * 24);
			if (daysSinceStart > 7) {
				issues.push({
					channel: "twitch",
					accountId,
					kind: "runtime",
					message: `Connection has been running for ${Math.floor(daysSinceStart)} days`,
					fix: "Consider restarting the connection periodically to refresh the connection. Twitch tokens may expire after long periods.",
				});
			}
		}
	}

	return issues;
}
