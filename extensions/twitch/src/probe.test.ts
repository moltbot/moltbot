import { beforeEach, describe, expect, it, vi } from "vitest";
import { probeTwitch } from "./probe.js";
import type { TwitchAccountConfig } from "./types.js";

// Mock Twurple modules - Vitest v4 compatible mocking
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockQuit = vi.fn().mockResolvedValue(undefined);

vi.mock("@twurple/chat", () => ({
	ChatClient: class {
		connect = mockConnect;
		quit = mockQuit;
	},
}));

vi.mock("@twurple/auth", () => ({
	StaticAuthProvider: class {},
}));

describe("probeTwitch", () => {
	const mockAccount: TwitchAccountConfig = {
		username: "testbot",
		token: "oauth:test123456789",
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns error when username is missing", async () => {
		const account = { ...mockAccount, username: "" as unknown as string };
		const result = await probeTwitch(account, 5000);

		expect(result.ok).toBe(false);
		expect(result.error).toContain("missing credentials");
		expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
	});

	it("returns error when token is missing", async () => {
		const account = { ...mockAccount, token: "" as unknown as string };
		const result = await probeTwitch(account, 5000);

		expect(result.ok).toBe(false);
		expect(result.error).toContain("missing credentials");
	});

	it("attempts connection regardless of token prefix", async () => {
		// Note: probeTwitch doesn't validate token format - it tries to connect with whatever token is provided
		// The actual connection would fail in production with an invalid token
		const account = { ...mockAccount, token: "raw_token_no_prefix" };
		const result = await probeTwitch(account, 5000);

		// With mock, connection succeeds even without oauth: prefix
		expect(result.ok).toBe(true);
	});

	it("successfully connects with valid credentials", async () => {
		const result = await probeTwitch(mockAccount, 5000);

		expect(result.ok).toBe(true);
		expect(result.connected).toBe(true);
		expect(result.username).toBe("testbot");
		expect(result.channel).toBe("testbot"); // defaults to username
		expect(result.elapsedMs).toBeGreaterThan(0);
	});

	it("uses custom channel when specified", async () => {
		const account: TwitchAccountConfig = {
			...mockAccount,
			channel: "customchannel",
		};

		const result = await probeTwitch(account, 5000);

		expect(result.ok).toBe(true);
		expect(result.channel).toBe("customchannel");
	});

	it("times out when connection takes too long", async () => {
		mockConnect.mockImplementationOnce(() => new Promise(() => {})); // Never resolves

		const result = await probeTwitch(mockAccount, 100);

		expect(result.ok).toBe(false);
		expect(result.error).toContain("timeout");

		// Reset mock
		mockConnect.mockResolvedValue(undefined);
	});

	it("cleans up client even on failure", async () => {
		mockConnect.mockRejectedValueOnce(new Error("Connection failed"));

		const result = await probeTwitch(mockAccount, 5000);

		expect(result.ok).toBe(false);
		expect(result.error).toContain("Connection failed");
		expect(mockQuit).toHaveBeenCalled();

		// Reset mocks
		mockConnect.mockResolvedValue(undefined);
	});

	it("measures elapsed time", async () => {
		const result = await probeTwitch(mockAccount, 5000);

		expect(result.ok).toBe(true);
		expect(result.elapsedMs).toBeGreaterThan(0);
	});

	it("handles connection errors gracefully", async () => {
		mockConnect.mockRejectedValueOnce(new Error("Network error"));

		const result = await probeTwitch(mockAccount, 5000);

		expect(result.ok).toBe(false);
		expect(result.error).toContain("Network error");

		// Reset mock
		mockConnect.mockResolvedValue(undefined);
	});

	it("trims token before validation", async () => {
		const account: TwitchAccountConfig = {
			...mockAccount,
			token: "  oauth:test123456789  ",
		};

		const result = await probeTwitch(account, 5000);

		expect(result.ok).toBe(true);
	});

	it("handles non-Error objects in catch block", async () => {
		mockConnect.mockRejectedValueOnce("String error");

		const result = await probeTwitch(mockAccount, 5000);

		expect(result.ok).toBe(false);
		expect(result.error).toBe("String error");

		// Reset mock
		mockConnect.mockResolvedValue(undefined);
	});
});
