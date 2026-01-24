import { RefreshingAuthProvider, StaticAuthProvider } from "@twurple/auth";
import { ChatClient, LogLevel } from "@twurple/chat";
import type {
	ProviderLogger,
	TwitchAccountConfig,
	TwitchChatMessage,
} from "./types.js";

/**
 * Manages Twitch chat client connections
 */
export class TwitchClientManager {
	private clients = new Map<string, ChatClient>();
	private messageHandlers = new Map<
		string,
		(message: TwitchChatMessage) => void
	>();

	constructor(private logger: ProviderLogger) {}

	/**
	 * Get or create a chat client for an account
	 */
	async getClient(account: TwitchAccountConfig): Promise<ChatClient> {
		const key = this.getAccountKey(account);

		const existing = this.clients.get(key);
		if (existing) {
			return existing;
		}

		if (!account.clientId || !account.token) {
			this.logger.error(
				`[twitch] Missing Twitch client ID or token for account ${account.username}`,
			);
			throw new Error("Missing Twitch client ID or token");
		}

		// Normalize token - strip oauth: prefix if present (Twurple doesn't need it)
		const normalizedToken = account.token.startsWith("oauth:")
			? account.token.slice(6)
			: account.token;

		// Use RefreshingAuthProvider if clientSecret is provided (supports optional refresh tokens)
		let authProvider: StaticAuthProvider | RefreshingAuthProvider;
		if (account.clientSecret) {
			// Use RefreshingAuthProvider - can handle tokens with or without refresh tokens
			authProvider = new RefreshingAuthProvider({
				clientId: account.clientId,
				clientSecret: account.clientSecret,
			});

			// Use addUserForToken to figure out the user ID from the token
			// This works whether we have a refresh token or not
			(authProvider as RefreshingAuthProvider)
				.addUserForToken({
					accessToken: normalizedToken,
					refreshToken: account.refreshToken ?? null,
					expiresIn: account.expiresIn ?? null,
					obtainmentTimestamp: account.obtainmentTimestamp ?? Date.now(),
				})
				.then((userId) => {
					this.logger.info(
						`[twitch] Added user ${userId} to RefreshingAuthProvider for ${account.username}`,
					);
				})
				.catch((err) => {
					this.logger.error(
						`[twitch] Failed to add user to RefreshingAuthProvider: ${err instanceof Error ? err.message : String(err)}`,
					);
				});

			// Set up token refresh event listener (only fires if refreshToken is provided)
			(authProvider as RefreshingAuthProvider).onRefresh((userId, token) => {
				this.logger.info(
					`[twitch] Access token refreshed for user ${userId} (expires in ${token.expiresIn ? `${token.expiresIn}s` : "unknown"})`,
				);
			});

			// Set up token refresh failure listener
			(authProvider as RefreshingAuthProvider).onRefreshFailure(
				(userId, error) => {
					this.logger.error(
						`[twitch] Failed to refresh access token for user ${userId}: ${error.message}`,
					);
				},
			);

			const refreshStatus = account.refreshToken
				? "automatic token refresh enabled"
				: "token refresh disabled (no refresh token)";
			this.logger.info(
				`[twitch] Using RefreshingAuthProvider for ${account.username} (${refreshStatus})`,
			);
		} else {
			// Fall back to StaticAuthProvider for backward compatibility (no clientSecret)
			authProvider = new StaticAuthProvider(account.clientId, normalizedToken);
			this.logger.info(
				`[twitch] Using StaticAuthProvider for ${account.username} (no clientSecret provided)`,
			);
		}

		const channel = account.channel ?? account.username;

		// Create chat client
		const client = new ChatClient({
			authProvider,
			channels: [channel],
			rejoinChannelsOnReconnect: true,
			requestMembershipEvents: true,
			logger: {
				// minLevel: LogLevel.ERROR,
				custom: {
					log: (level, message) => {
						switch (level) {
							case LogLevel.CRITICAL:
								this.logger.error(`[twitch] ${message}`);
								break;
							case LogLevel.ERROR:
								this.logger.error(`[twitch] ${message}`);
								break;
							case LogLevel.WARNING:
								this.logger.warn(`[twitch] ${message}`);
								break;
							case LogLevel.INFO:
								this.logger.info(`[twitch] ${message}`);
								break;
							case LogLevel.DEBUG:
								this.logger.debug(`[twitch] ${message}`);
								break;
							case LogLevel.TRACE:
								this.logger.debug(`[twitch] ${message}`);
								break;
						}
					},
				},
			},
		});

		// Set up event handlers
		this.setupClientHandlers(client, account);

		// Connect
		client.connect();

		this.clients.set(key, client);
		this.logger.info(`[twitch] Connected to Twitch as ${account.username}`);

		return client;
	}

	/**
	 * Set up message and event handlers for a client
	 */
	private setupClientHandlers(
		client: ChatClient,
		account: TwitchAccountConfig,
	): void {
		const key = this.getAccountKey(account);

		// Handle incoming messages
		client.onMessage((channelName, _user, messageText, msg) => {
			const handler = this.messageHandlers.get(key);
			if (handler) {
				const normalizedChannel = channelName.startsWith("#")
					? channelName.slice(1)
					: channelName;
				handler({
					username: msg.userInfo.userName,
					displayName: msg.userInfo.displayName,
					userId: msg.userInfo.userId,
					message: messageText,
					channel: normalizedChannel,
					id: msg.id,
					timestamp: new Date(),
					isMod: msg.userInfo.isMod,
					isOwner: msg.userInfo.isBroadcaster,
					isVip: msg.userInfo.isVip,
					isSub: msg.userInfo.isSubscriber,
					chatType: "group",
				});
			}
		});

		// Handle whispers (DMs)
		client.onWhisper((_user, messageText, msg) => {
			const handler = this.messageHandlers.get(key);
			if (handler) {
				handler({
					username: msg.userInfo.userName,
					displayName: msg.userInfo.displayName,
					userId: msg.userInfo.userId,
					message: messageText,
					channel: msg.userInfo.userName,
					id: undefined, // Whisper doesn't have id property
					timestamp: new Date(),
					isMod: msg.userInfo.isMod,
					isOwner: msg.userInfo.isBroadcaster,
					isVip: msg.userInfo.isVip,
					isSub: msg.userInfo.isSubscriber,
					chatType: "direct",
				});
			}
		});

		this.logger.info(`[twitch] Set up handlers for ${key}`);
	}

	/**
	 * Set a message handler for an account
	 */
	onMessage(
		account: TwitchAccountConfig,
		handler: (message: TwitchChatMessage) => void,
	): void {
		const key = this.getAccountKey(account);
		this.messageHandlers.set(key, handler);
	}

	/**
	 * Disconnect a client
	 */
	async disconnect(account: TwitchAccountConfig): Promise<void> {
		const key = this.getAccountKey(account);
		const client = this.clients.get(key);

		if (client) {
			client.quit();
			this.clients.delete(key);
			this.messageHandlers.delete(key);
			this.logger.info(`[twitch] Disconnected ${key}`);
		}
	}

	/**
	 * Disconnect all clients
	 */
	async disconnectAll(): Promise<void> {
		for (const client of this.clients.values()) {
			client.quit();
		}
		this.clients.clear();
		this.messageHandlers.clear();
		this.logger.info("[twitch] Disconnected all clients");
	}

	/**
	 * Send a message to a channel
	 */
	async sendMessage(
		account: TwitchAccountConfig,
		channel: string,
		message: string,
	): Promise<{ ok: boolean; error?: string; messageId?: string }> {
		try {
			const client = await this.getClient(account);

			// Generate a message ID (Twurple's say() doesn't return the message ID, so we generate one)
			const messageId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

			// Send message (Twurple handles rate limiting)
			await client.say(channel, message);

			return { ok: true, messageId };
		} catch (error) {
			this.logger.error(
				`[twitch] Failed to send message: ${error instanceof Error ? error.message : String(error)}`,
			);
			return {
				ok: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Generate a unique key for an account
	 */
	public getAccountKey(account: TwitchAccountConfig): string {
		return `${account.username}:${account.channel ?? account.username}`;
	}

	/**
	 * Clear all clients and handlers (for testing)
	 */
	_clearForTest(): void {
		this.clients.clear();
		this.messageHandlers.clear();
	}
}
