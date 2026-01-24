import type {
	CoreConfig,
	TwitchAccountConfig,
	TwitchPluginConfig,
} from "./types.js";

/**
 * Default account ID for Twitch
 */
export const DEFAULT_ACCOUNT_ID = "default";

/**
 * Get account config from core config
 */
export function getAccountConfig(
	coreConfig: unknown,
	accountId: string,
): TwitchAccountConfig | null {
	if (!coreConfig || typeof coreConfig !== "object") {
		return null;
	}

	const cfg = coreConfig as Record<string, unknown>;
	const channels = cfg.channels as Record<string, unknown> | undefined;
	const twitch = channels?.twitch as Record<string, unknown> | undefined;
	const accounts = twitch?.accounts as Record<string, unknown> | undefined;

	if (!accounts || !accounts[accountId]) {
		return null;
	}

	return accounts[accountId] as TwitchAccountConfig | null;
}

/**
 * Parse plugin config
 */
export function parsePluginConfig(value: unknown): TwitchPluginConfig {
	if (!value || typeof value !== "object") {
		return { stripMarkdown: true };
	}

	const raw = value as Record<string, unknown>;
	return {
		stripMarkdown:
			typeof raw.stripMarkdown === "boolean" ? raw.stripMarkdown : true,
	};
}

/**
 * List all configured account IDs
 */
export function listAccountIds(cfg: CoreConfig): string[] {
	const accounts = (cfg as Record<string, unknown>).channels as
		| Record<string, unknown>
		| undefined;
	const twitch = accounts?.twitch as Record<string, unknown> | undefined;
	const accountMap = twitch?.accounts as Record<string, unknown> | undefined;

	if (!accountMap) {
		return [];
	}

	return Object.keys(accountMap);
}
