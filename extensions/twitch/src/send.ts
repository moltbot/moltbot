/**
 * Twitch message sending functions with dependency injection support.
 *
 * These functions are the primary interface for sending messages to Twitch.
 * They support dependency injection via the `deps` parameter for testability.
 */

import { DEFAULT_ACCOUNT_ID, getAccountConfig } from "./config.js";
import { TwitchClientManager } from "./twitch-client.js";
import type { CoreConfig } from "./types.js";
import { stripMarkdownForTwitch } from "./utils/markdown.js";
import {
	generateMessageId,
	isAccountConfigured,
	normalizeTwitchChannel,
} from "./utils/twitch.js";

/**
 * Result from sending a message to Twitch.
 */
export interface SendMessageResult {
	/** Whether the send was successful */
	ok: boolean;
	/** The message ID (generated for tracking) */
	messageId: string;
	/** Error message if the send failed */
	error?: string;
}

/**
 * Options for sending Twitch messages.
 */
export interface SendTwitchOptions {
	/** Account ID to use for sending */
	accountId?: string;
	/** Whether to enable verbose logging */
	verbose?: boolean;
	/** Abort signal for cancellation */
	signal?: AbortSignal;
}

/**
 * Client manager cache for reuse across calls.
 */
const clientManagerCache = new Map<string, TwitchClientManager>();

/**
 * Get or create a client manager for an account.
 *
 * @param accountId - The account ID
 * @param logger - Logger instance
 * @returns The client manager
 */
function getClientManager(
	accountId: string,
	logger: Console,
): TwitchClientManager {
	if (!clientManagerCache.has(accountId)) {
		clientManagerCache.set(
			accountId,
			new TwitchClientManager({
				info: (msg) => logger.info(`[twitch] ${msg}`),
				warn: (msg) => logger.warn(`[twitch] ${msg}`),
				error: (msg) => logger.error(`[twitch] ${msg}`),
				debug: (msg) => logger.debug(`[twitch] ${msg}`),
			}),
		);
	}
	const client = clientManagerCache.get(accountId);
	if (!client) {
		throw new Error(`Client manager not found for account: ${accountId}`);
	}
	return client;
}

/**
 * Send a text message to a Twitch channel.
 *
 * @param channel - The channel name (with or without # prefix)
 * @param text - The message text to send
 * @param options - Send options
 * @returns Result with message ID and status
 *
 * @example
 * const result = await sendMessageTwitch("#mychannel", "Hello Twitch!", {
 *   accountId: "default",
 * });
 */
export async function sendMessageTwitch(
	_channel: string,
	_text: string,
	options: SendTwitchOptions = {},
): Promise<SendMessageResult> {
	const { verbose = false, signal } = options;

	// Check for abort signal
	if (signal?.aborted) {
		return {
			ok: false,
			messageId: generateMessageId(),
			error: "Send operation aborted",
		};
	}

	try {
		// This would normally come from the Clawdbot config
		// For now, we'll require the config to be passed via a different mechanism
		// In the actual adapter, this comes from ChannelOutboundContext.cfg
		throw new Error(
			"sendMessageTwitch requires CoreConfig. " +
				"Use the outbound adapter via Clawdbot's channel system instead.",
		);
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		if (verbose) console.error(`[twitch] Send failed: ${errorMsg}`);
		return {
			ok: false,
			messageId: generateMessageId(),
			error: errorMsg,
		};
	}
}

/**
 * Internal send function used by the outbound adapter.
 *
 * This function has access to the full Clawdbot config and handles
 * account resolution, markdown stripping, and actual message sending.
 *
 * @param channel - The channel name
 * @param text - The message text
 * @param cfg - Full Clawdbot configuration
 * @param accountId - Account ID to use
 * @param stripMarkdown - Whether to strip markdown (default: true)
 * @param logger - Logger instance
 * @returns Result with message ID and status
 */
export async function sendMessageTwitchInternal(
	channel: string,
	text: string,
	cfg: CoreConfig,
	accountId: string = DEFAULT_ACCOUNT_ID,
	stripMarkdown: boolean = true,
	logger: Console = console,
): Promise<SendMessageResult> {
	// Resolve account
	const account = getAccountConfig(cfg, accountId);
	if (!account) {
		const availableIds = Object.keys(cfg.channels?.twitch?.accounts ?? {});
		return {
			ok: false,
			messageId: generateMessageId(),
			error: `Account not found: ${accountId}. Available accounts: ${availableIds.join(", ") || "none"}`,
		};
	}

	if (!isAccountConfigured(account)) {
		return {
			ok: false,
			messageId: generateMessageId(),
			error: `Account ${accountId} is not properly configured. Required: username, token, clientId`,
		};
	}

	// Normalize channel
	const normalizedChannel = channel || account.channel || account.username;
	if (!normalizedChannel) {
		return {
			ok: false,
			messageId: generateMessageId(),
			error: "No channel specified and no default channel in account config",
		};
	}

	// Strip markdown if enabled
	const cleanedText = stripMarkdown ? stripMarkdownForTwitch(text) : text;
	if (!cleanedText) {
		return {
			ok: true,
			messageId: "skipped",
		};
	}

	try {
		// Get client manager and send message
		const clientManager = getClientManager(accountId, logger);
		const result = await clientManager.sendMessage(
			account,
			normalizeTwitchChannel(normalizedChannel),
			cleanedText,
		);

		if (!result.ok) {
			return {
				ok: false,
				messageId: result.messageId ?? generateMessageId(),
				error: result.error ?? "Send failed",
			};
		}

		return {
			ok: true,
			messageId: result.messageId ?? generateMessageId(),
		};
	} catch (error) {
		const errorMsg = error instanceof Error ? error.message : String(error);
		logger.error(`[twitch] Failed to send message: ${errorMsg}`);
		return {
			ok: false,
			messageId: generateMessageId(),
			error: errorMsg,
		};
	}
}

/**
 * Send media to a Twitch channel.
 *
 * Note: Twitch chat doesn't support direct media uploads. This function
 * sends the media URL as text instead.
 *
 * @param channel - The channel name
 * @param text - Optional message text to accompany the media
 * @param mediaUrl - The media URL to send
 * @param options - Send options
 * @returns Result with message ID and status
 */
export async function sendMediaTwitch(
	channel: string,
	mediaUrl: string,
	text: string = "",
	options: SendTwitchOptions = {},
): Promise<SendMessageResult> {
	const combinedMessage = text ? `${text} ${mediaUrl}`.trim() : mediaUrl;
	return sendMessageTwitch(channel, combinedMessage, options);
}
