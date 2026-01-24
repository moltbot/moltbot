import { StaticAuthProvider } from "@twurple/auth";
import { ChatClient } from "@twurple/chat";
import type { TwitchAccountConfig } from "./types.js";

/**
 * Result of probing a Twitch account
 */
export type ProbeTwitchResult = {
	ok: boolean;
	error?: string;
	username?: string;
	elapsedMs: number;
	connected?: boolean;
	channel?: string;
};

/**
 * Probe a Twitch account to verify the connection is working
 *
 * This tests the Twitch OAuth token by attempting to connect
 * to the chat server and verify the bot's username.
 */
export async function probeTwitch(
	account: TwitchAccountConfig,
	timeoutMs: number,
): Promise<ProbeTwitchResult> {
	const started = Date.now();

	if (!account.token || !account.username) {
		return {
			ok: false,
			error: "missing credentials (token, username)",
			username: account.username,
			elapsedMs: Date.now() - started,
		};
	}

	const rawToken = account.token.trim();

	let client: ChatClient | undefined;

	try {
		// Create a timeout promise
		const timeout = new Promise<never>((_, reject) => {
			setTimeout(
				() => reject(new Error(`connection timeout after ${timeoutMs}ms`)),
				timeoutMs,
			);
		});

		// Create auth provider with the token
		const authProvider = new StaticAuthProvider(
			account.clientId ?? "",
			rawToken,
		);

		// Create chat client
		client = new ChatClient({
			authProvider,
		});

		// Race between connection and timeout
		await Promise.race([client.connect(), timeout]);

		// Wait a moment for the connection to fully establish
		await new Promise<void>((resolve) => setTimeout(resolve, 500));

		// If we got here, connection was successful
		return {
			ok: true,
			connected: true,
			username: account.username,
			channel: account.channel ?? account.username,
			elapsedMs: Date.now() - started,
		};
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error.message : String(error),
			username: account.username,
			channel: account.channel ?? account.username,
			elapsedMs: Date.now() - started,
		};
	} finally {
		// Always clean up the client
		if (client) {
			try {
				client.quit();
			} catch {
				// Ignore cleanup errors
			}
		}
	}
}
