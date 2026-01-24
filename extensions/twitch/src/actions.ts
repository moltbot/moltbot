/**
 * Twitch message actions adapter.
 *
 * Handles tool-based actions for Twitch, such as sending messages.
 */

import { DEFAULT_ACCOUNT_ID, getAccountConfig } from "./config.js";
import { twitchOutbound } from "./outbound.js";
import type {
	ChannelMessageActionAdapter,
	ChannelMessageActionContext,
} from "./types.js";

/**
 * Read a string parameter from action arguments.
 *
 * @param args - Action arguments
 * @param key - Parameter key
 * @param options - Options for reading the parameter
 * @returns The parameter value or undefined if not found
 */
function readStringParam(
	args: Record<string, unknown>,
	key: string,
	options: { required?: boolean; trim?: boolean } = {},
): string | undefined {
	const value = args[key];
	if (value === undefined || value === null) {
		if (options.required) {
			throw new Error(`Missing required parameter: ${key}`);
		}
		return undefined;
	}

	const str = String(value);
	return options.trim !== false ? str.trim() : str;
}

/**
 * Twitch message actions adapter.
 *
 * Supports the "send" action for sending messages to Twitch channels.
 */
export const twitchMessageActions: ChannelMessageActionAdapter = {
	/**
	 * List available actions for this channel.
	 *
	 * Currently supports:
	 * - "send" - Send a message to a Twitch channel
	 *
	 * @param params - Parameters including config
	 * @returns Array of available action names
	 */
	listActions: () => {
		// TODO: Add action gate pattern for configurable actions
		const actions = new Set<string>(["send"]);
		return Array.from(actions);
	},

	/**
	 * Check if an action is supported.
	 *
	 * @param params - Action to check
	 * @returns true if the action is supported
	 */
	supportsAction: ({ action }) => {
		return action === "send";
	},

	/**
	 * Extract tool send parameters from action arguments.
	 *
	 * Parses and validates the "to" and "message" parameters for sending.
	 *
	 * @param params - Arguments from the tool call
	 * @returns Parsed send parameters or null if invalid
	 *
	 * @example
	 * const result = twitchMessageActions.extractToolSend!({
	 *   args: { to: "#mychannel", message: "Hello!" }
	 * });
	 * // Returns: { to: "#mychannel", message: "Hello!" }
	 */
	extractToolSend: ({ args }) => {
		try {
			const to = readStringParam(args, "to", { required: true });
			const message = readStringParam(args, "message", { required: true });

			if (!to || !message) {
				return null;
			}

			return { to, message };
		} catch {
			return null;
		}
	},

	/**
	 * Handle an action execution.
	 *
	 * Processes the "send" action to send messages to Twitch.
	 *
	 * @param ctx - Action context including action type, parameters, and config
	 * @returns Tool result with content or null if action not supported
	 *
	 * @example
	 * const result = await twitchMessageActions.handleAction!({
	 *   action: "send",
	 *   params: { message: "Hello Twitch!", to: "#mychannel" },
	 *   cfg: clawdbotConfig,
	 *   accountId: "default",
	 * });
	 */
	handleAction: async (
		ctx: ChannelMessageActionContext,
	): Promise<{ content: Array<{ type: string; text: string }> } | null> => {
		if (ctx.action === "send") {
			const message = readStringParam(ctx.params, "message", {
				required: true,
			});
			const to = readStringParam(ctx.params, "to", { required: false });
			const accountId = ctx.accountId ?? DEFAULT_ACCOUNT_ID;

			const account = getAccountConfig(ctx.cfg, accountId);
			if (!account) {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								ok: false,
								error: `Account not found: ${accountId}. Available accounts: ${Object.keys(ctx.cfg.channels?.twitch?.accounts ?? {}).join(", ") || "none"}`,
							}),
						},
					],
				};
			}

			// Use the channel from account config if not specified
			const targetChannel = to || account.channel || account.username;

			if (!targetChannel) {
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								ok: false,
								error:
									"No channel specified and no default channel in account config",
							}),
						},
					],
				};
			}

			try {
				if (!twitchOutbound.sendText) {
					return {
						content: [
							{
								type: "text",
								text: JSON.stringify({
									ok: false,
									error: "sendText not implemented",
								}),
							},
						],
					};
				}

				const result = await twitchOutbound.sendText({
					cfg: ctx.cfg,
					to: targetChannel,
					text: message ?? "",
					accountId,
				});

				return {
					content: [
						{
							type: "text",
							text: JSON.stringify(result),
						},
					],
				};
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : String(error);
				return {
					content: [
						{
							type: "text",
							text: JSON.stringify({
								ok: false,
								error: errorMsg,
							}),
						},
					],
				};
			}
		}

		// Action not supported
		return null;
	},
};
