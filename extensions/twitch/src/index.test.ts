/**
 * Tests for the Twitch plugin
 *
 * Tests cover:
 * - Plugin metadata and capabilities
 * - Configuration parsing
 * - Account resolution
 * - Adapter functionality
 */

import { describe, expect, it, vi } from "vitest";

import {
	collectTwitchStatusIssues,
	twitchMessageActions,
	twitchOutbound,
	twitchPlugin,
} from "./index.js";

// Mock Clawdbot's internal modules
const _mockRegisterChannel = vi.fn();

vi.mock("clawdbot", () => ({
	default: {
		helpers: {},
	},
}));

describe("Twitch Plugin", () => {
	describe("Plugin Metadata", () => {
		it("should have correct plugin ID", () => {
			expect(twitchPlugin.id).toBe("twitch");
		});

		it("should have correct metadata", () => {
			expect(twitchPlugin.meta.id).toBe("twitch");
			expect(twitchPlugin.meta.label).toBe("Twitch");
			expect(twitchPlugin.meta.selectionLabel).toBe("Twitch (Chat)");
			expect(twitchPlugin.meta.docsPath).toBe("/channels/twitch");
			expect(twitchPlugin.meta.blurb).toBe("Twitch chat integration");
			expect(twitchPlugin.meta.aliases).toContain("twitch-chat");
		});

		it("should have correct capabilities", () => {
			expect(twitchPlugin.capabilities.chatTypes).toEqual(["group", "direct"]);
		});
	});

	describe("Plugin Config", () => {
		const mockCoreConfig = {
			channels: {
				twitch: {
					accounts: {
						default: {
							username: "testbot",
							token: "oauth:test123",
							clientId: "test-client-id",
						},
					},
				},
			},
		};

		it("should list account IDs", () => {
			const ids = twitchPlugin.config.listAccountIds(mockCoreConfig);
			expect(ids).toContain("default");
		});

		it("should resolve account config", () => {
			const account = twitchPlugin.config.resolveAccount(
				mockCoreConfig,
				"default",
			);
			expect(account).not.toBeNull();
			expect(account?.username).toBe("testbot");
		});

		it("should return default account ID", () => {
			const defaultId = twitchPlugin.config.defaultAccountId?.();
			expect(defaultId).toBe("default");
		});

		it("should check if account is configured", () => {
			const isConfigured = twitchPlugin.config.isConfigured?.(
				null,
				mockCoreConfig,
			);
			expect(isConfigured).toBe(true);
		});

		it("should check if account is enabled", () => {
			const account = twitchPlugin.config.resolveAccount(
				mockCoreConfig,
				"default",
			);
			const isEnabled = twitchPlugin.config.isEnabled?.(account ?? undefined);
			expect(isEnabled).toBe(true);
		});

		it("should describe account", () => {
			const account = twitchPlugin.config.resolveAccount(
				mockCoreConfig,
				"default",
			);
			const description = twitchPlugin.config.describeAccount?.(
				account ?? undefined,
			);
			expect(description?.accountId).toBe("default");
			expect(description?.configured).toBe(true);
			expect(description?.enabled).toBe(true);
		});
	});

	describe("Outbound Adapter", () => {
		it("should have correct delivery mode", () => {
			expect(twitchOutbound.deliveryMode).toBe("direct");
		});

		it("should have text chunk limit", () => {
			expect(twitchOutbound.textChunkLimit).toBe(500);
		});

		it("should have a chunker function", () => {
			expect(twitchOutbound.chunker).toBeDefined();
			expect(typeof twitchOutbound.chunker).toBe("function");
		});

		it("should have resolveTarget function", () => {
			expect(twitchOutbound.resolveTarget).toBeDefined();
			expect(typeof twitchOutbound.resolveTarget).toBe("function");
		});

		it("should have sendText function", () => {
			expect(twitchOutbound.sendText).toBeDefined();
			expect(typeof twitchOutbound.sendText).toBe("function");
		});

		it("should have sendMedia function", () => {
			expect(twitchOutbound.sendMedia).toBeDefined();
			expect(typeof twitchOutbound.sendMedia).toBe("function");
		});
	});

	describe("Actions Adapter", () => {
		it("should have listActions function", () => {
			expect(twitchMessageActions.listActions).toBeDefined();
			expect(typeof twitchMessageActions.listActions).toBe("function");
		});

		it("should list available actions", () => {
			const actions = twitchMessageActions.listActions?.({ cfg: {} });
			expect(actions).toContain("send");
		});

		it("should support send action", () => {
			const supported = twitchMessageActions.supportsAction?.({
				action: "send",
			});
			expect(supported).toBe(true);
		});

		it("should not support unknown actions", () => {
			const supported = twitchMessageActions.supportsAction?.({
				action: "unknown",
			});
			expect(supported).toBe(false);
		});
	});

	describe("Status Adapter", () => {
		it("should have status adapter", () => {
			expect(twitchPlugin.status).toBeDefined();
		});

		it("should have default runtime", () => {
			expect(twitchPlugin.status?.defaultRuntime).toBeDefined();
			expect(twitchPlugin.status?.defaultRuntime?.accountId).toBe("default");
		});

		it("should have buildAccountSnapshot function", () => {
			expect(twitchPlugin.status?.buildAccountSnapshot).toBeDefined();
			expect(typeof twitchPlugin.status?.buildAccountSnapshot).toBe("function");
		});

		it("should have collectStatusIssues function", () => {
			expect(twitchPlugin.status?.collectStatusIssues).toBeDefined();
			expect(typeof twitchPlugin.status?.collectStatusIssues).toBe("function");
		});
	});

	describe("Status Issues Collection", () => {
		it("should detect unconfigured accounts", () => {
			const snapshots = [
				{
					accountId: "default",
					configured: false,
					enabled: true,
					running: false,
				},
			];
			const issues = collectTwitchStatusIssues(snapshots);
			expect(issues.length).toBeGreaterThan(0);
			expect(issues[0]?.kind).toBe("config");
		});
	});

	describe("Gateway Adapter", () => {
		it("should have gateway adapter", () => {
			expect(twitchPlugin.gateway).toBeDefined();
		});

		it("should have startAccount function", () => {
			expect(twitchPlugin.gateway?.startAccount).toBeDefined();
			expect(typeof twitchPlugin.gateway?.startAccount).toBe("function");
		});

		it("should have stopAccount function", () => {
			expect(twitchPlugin.gateway?.stopAccount).toBeDefined();
			expect(typeof twitchPlugin.gateway?.stopAccount).toBe("function");
		});
	});
});

describe("Twitch Utilities", () => {
	describe("Markdown Stripping", () => {
		it("should be exported", async () => {
			const { stripMarkdownForTwitch } = await import("./utils/markdown.js");
			expect(stripMarkdownForTwitch).toBeDefined();
			expect(typeof stripMarkdownForTwitch).toBe("function");
		});

		it("should strip bold markdown", async () => {
			const { stripMarkdownForTwitch } = await import("./utils/markdown.js");
			const result = stripMarkdownForTwitch("**bold** text");
			expect(result).toBe("bold text");
		});

		it("should strip links", async () => {
			const { stripMarkdownForTwitch } = await import("./utils/markdown.js");
			const result = stripMarkdownForTwitch("[link](https://example.com)");
			expect(result).toBe("link");
		});
	});

	describe("Twitch Utilities", () => {
		it("should normalize channel names", async () => {
			const { normalizeTwitchChannel } = await import("./utils/twitch.js");
			expect(normalizeTwitchChannel("#TwitchChannel")).toBe("twitchchannel");
			expect(normalizeTwitchChannel("MyChannel")).toBe("mychannel");
		});
	});
});
