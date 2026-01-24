import { describe, expect, it } from "vitest";

import { getAccountConfig, parsePluginConfig } from "./config.js";

describe("parsePluginConfig", () => {
	it("parses valid config with stripMarkdown true", () => {
		const result = parsePluginConfig({ stripMarkdown: true });
		expect(result.stripMarkdown).toBe(true);
	});

	it("parses valid config with stripMarkdown false", () => {
		const result = parsePluginConfig({ stripMarkdown: false });
		expect(result.stripMarkdown).toBe(false);
	});

	it("defaults to stripMarkdown true when not specified", () => {
		const result = parsePluginConfig({});
		expect(result.stripMarkdown).toBe(true);
	});

	it("handles undefined config", () => {
		const result = parsePluginConfig(
			undefined as unknown as Record<string, unknown>,
		);
		expect(result).toEqual({ stripMarkdown: true }); // Returns defaults when value is falsy
	});

	it("handles null config", () => {
		const result = parsePluginConfig(
			null as unknown as Record<string, unknown>,
		);
		expect(result).toEqual({ stripMarkdown: true }); // Returns defaults when value is null
	});
});

describe("getAccountConfig", () => {
	const mockCoreConfig = {
		channels: {
			twitch: {
				accounts: {
					default: {
						username: "testbot",
						token: "oauth:test123",
					},
				},
			},
		},
	};

	it("returns account config for valid account ID", () => {
		const result = getAccountConfig(mockCoreConfig, "default");

		expect(result).not.toBeNull();
		expect(result?.username).toBe("testbot");
	});

	it("returns null for non-existent account ID", () => {
		const result = getAccountConfig(mockCoreConfig, "nonexistent");

		expect(result).toBeNull();
	});

	it("returns null when core config is null", () => {
		const result = getAccountConfig(null, "default");

		expect(result).toBeNull();
	});

	it("returns null when core config is undefined", () => {
		const result = getAccountConfig(undefined, "default");

		expect(result).toBeNull();
	});

	it("returns null when channels are not defined", () => {
		const result = getAccountConfig({}, "default");

		expect(result).toBeNull();
	});

	it("returns null when twitch is not defined", () => {
		const result = getAccountConfig({ channels: {} }, "default");

		expect(result).toBeNull();
	});

	it("returns null when accounts are not defined", () => {
		const result = getAccountConfig({ channels: { twitch: {} } }, "default");

		expect(result).toBeNull();
	});
});
