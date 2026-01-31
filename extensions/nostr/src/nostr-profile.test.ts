import { describe, expect, it, vi, beforeEach } from "vitest";
import { loadWasmAsync, Keys, SecretKey } from "@rust-nostr/nostr-sdk";
import {
  profileToContent,
  contentToProfile,
  validateProfile,
  sanitizeProfileForDisplay,
  type ProfileContent,
} from "./nostr-profile.js";
import type { NostrProfile } from "./config-schema.js";

// Test private key (DO NOT use in production - this is a known test key)
const TEST_HEX_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

// WASM must be initialized before key operations
let TEST_PUBKEY: string;
beforeEach(async () => {
  await loadWasmAsync();
  const secretKey = SecretKey.parse(TEST_HEX_KEY);
  const keys = new Keys(secretKey);
  TEST_PUBKEY = keys.publicKey.toHex();
});

// ============================================================================
// Profile Content Conversion Tests
// ============================================================================

describe("profileToContent", () => {
  it("converts full profile to NIP-01 content format", () => {
    const profile: NostrProfile = {
      name: "testuser",
      displayName: "Test User",
      about: "A test user for unit testing",
      picture: "https://example.com/avatar.png",
      banner: "https://example.com/banner.png",
      website: "https://example.com",
      nip05: "testuser@example.com",
      lud16: "testuser@walletofsatoshi.com",
    };

    const content = profileToContent(profile);

    expect(content.name).toBe("testuser");
    expect(content.display_name).toBe("Test User");
    expect(content.about).toBe("A test user for unit testing");
    expect(content.picture).toBe("https://example.com/avatar.png");
    expect(content.banner).toBe("https://example.com/banner.png");
    expect(content.website).toBe("https://example.com");
    expect(content.nip05).toBe("testuser@example.com");
    expect(content.lud16).toBe("testuser@walletofsatoshi.com");
  });

  it("omits undefined fields from content", () => {
    const profile: NostrProfile = {
      name: "minimaluser",
    };

    const content = profileToContent(profile);

    expect(content.name).toBe("minimaluser");
    expect("display_name" in content).toBe(false);
    expect("about" in content).toBe(false);
    expect("picture" in content).toBe(false);
  });

  it("handles empty profile", () => {
    const profile: NostrProfile = {};
    const content = profileToContent(profile);
    expect(Object.keys(content)).toHaveLength(0);
  });
});

describe("contentToProfile", () => {
  it("converts NIP-01 content to profile format", () => {
    const content: ProfileContent = {
      name: "testuser",
      display_name: "Test User",
      about: "A test user",
      picture: "https://example.com/avatar.png",
      nip05: "test@example.com",
    };

    const profile = contentToProfile(content);

    expect(profile.name).toBe("testuser");
    expect(profile.displayName).toBe("Test User");
    expect(profile.about).toBe("A test user");
    expect(profile.picture).toBe("https://example.com/avatar.png");
    expect(profile.nip05).toBe("test@example.com");
  });

  it("handles empty content", () => {
    const content: ProfileContent = {};
    const profile = contentToProfile(content);
    expect(
      Object.keys(profile).filter((k) => profile[k as keyof NostrProfile] !== undefined),
    ).toHaveLength(0);
  });

  it("round-trips profile data", () => {
    const original: NostrProfile = {
      name: "roundtrip",
      displayName: "Round Trip Test",
      about: "Testing round-trip conversion",
    };

    const content = profileToContent(original);
    const restored = contentToProfile(content);

    expect(restored.name).toBe(original.name);
    expect(restored.displayName).toBe(original.displayName);
    expect(restored.about).toBe(original.about);
  });
});

// ============================================================================
// Profile Validation Tests
// ============================================================================

describe("validateProfile", () => {
  it("validates a correct profile", () => {
    const profile = {
      name: "validuser",
      about: "A valid user",
      picture: "https://example.com/pic.png",
    };

    const result = validateProfile(profile);

    expect(result.valid).toBe(true);
    expect(result.profile).toBeDefined();
    expect(result.errors).toBeUndefined();
  });

  it("rejects profile with invalid URL", () => {
    const profile = {
      name: "invalidurl",
      picture: "http://insecure.example.com/pic.png", // HTTP not HTTPS
    };

    const result = validateProfile(profile);

    expect(result.valid).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => e.includes("https://"))).toBe(true);
  });

  it("rejects profile with javascript: URL", () => {
    const profile = {
      name: "xssattempt",
      picture: "javascript:alert('xss')",
    };

    const result = validateProfile(profile);

    expect(result.valid).toBe(false);
  });

  it("rejects profile with data: URL", () => {
    const profile = {
      name: "dataurl",
      picture: "data:image/png;base64,abc123",
    };

    const result = validateProfile(profile);

    expect(result.valid).toBe(false);
  });

  it("rejects name exceeding 256 characters", () => {
    const profile = {
      name: "a".repeat(257),
    };

    const result = validateProfile(profile);

    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.includes("256"))).toBe(true);
  });

  it("rejects about exceeding 2000 characters", () => {
    const profile = {
      about: "a".repeat(2001),
    };

    const result = validateProfile(profile);

    expect(result.valid).toBe(false);
    expect(result.errors!.some((e) => e.includes("2000"))).toBe(true);
  });

  it("accepts empty profile", () => {
    const result = validateProfile({});
    expect(result.valid).toBe(true);
  });

  it("rejects null input", () => {
    const result = validateProfile(null);
    expect(result.valid).toBe(false);
  });

  it("rejects non-object input", () => {
    const result = validateProfile("not an object");
    expect(result.valid).toBe(false);
  });
});

// ============================================================================
// Sanitization Tests
// ============================================================================

describe("sanitizeProfileForDisplay", () => {
  it("escapes HTML in name field", () => {
    const profile: NostrProfile = {
      name: "<script>alert('xss')</script>",
    };

    const sanitized = sanitizeProfileForDisplay(profile);

    expect(sanitized.name).toBe("&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;");
  });

  it("escapes HTML in about field", () => {
    const profile: NostrProfile = {
      about: 'Check out <img src="x" onerror="alert(1)">',
    };

    const sanitized = sanitizeProfileForDisplay(profile);

    expect(sanitized.about).toBe(
      "Check out &lt;img src=&quot;x&quot; onerror=&quot;alert(1)&quot;&gt;",
    );
  });

  it("preserves URLs without modification", () => {
    const profile: NostrProfile = {
      picture: "https://example.com/pic.png",
      website: "https://example.com",
    };

    const sanitized = sanitizeProfileForDisplay(profile);

    expect(sanitized.picture).toBe("https://example.com/pic.png");
    expect(sanitized.website).toBe("https://example.com");
  });

  it("handles undefined fields", () => {
    const profile: NostrProfile = {
      name: "test",
    };

    const sanitized = sanitizeProfileForDisplay(profile);

    expect(sanitized.name).toBe("test");
    expect(sanitized.about).toBeUndefined();
    expect(sanitized.picture).toBeUndefined();
  });

  it("escapes ampersands", () => {
    const profile: NostrProfile = {
      name: "Tom & Jerry",
    };

    const sanitized = sanitizeProfileForDisplay(profile);

    expect(sanitized.name).toBe("Tom &amp; Jerry");
  });

  it("escapes quotes", () => {
    const profile: NostrProfile = {
      about: 'Say "hello" to everyone',
    };

    const sanitized = sanitizeProfileForDisplay(profile);

    expect(sanitized.about).toBe("Say &quot;hello&quot; to everyone");
  });
});

// ============================================================================
// Edge Cases
// ============================================================================

describe("edge cases", () => {
  it("handles emoji in profile fields", () => {
    const profile: NostrProfile = {
      name: "🤖 Bot",
      about: "I am a 🤖 robot! 🎉",
    };

    const content = profileToContent(profile);
    expect(content.name).toBe("🤖 Bot");
    expect(content.about).toBe("I am a 🤖 robot! 🎉");

    // Verify JSON round-trip preserves emojis
    const json = JSON.stringify(content);
    const parsed = JSON.parse(json) as ProfileContent;
    expect(parsed.name).toBe("🤖 Bot");
  });

  it("handles unicode in profile fields", () => {
    const profile: NostrProfile = {
      name: "日本語ユーザー",
      about: "Привет мир! 你好世界!",
    };

    const content = profileToContent(profile);
    expect(content.name).toBe("日本語ユーザー");
    expect(content.about).toBe("Привет мир! 你好世界!");
  });

  it("handles newlines in about field", () => {
    const profile: NostrProfile = {
      about: "Line 1\nLine 2\nLine 3",
    };

    const content = profileToContent(profile);
    expect(content.about).toBe("Line 1\nLine 2\nLine 3");

    // Verify JSON round-trip preserves newlines
    const json = JSON.stringify(content);
    const parsed = JSON.parse(json) as ProfileContent;
    expect(parsed.about).toBe("Line 1\nLine 2\nLine 3");
  });

  it("handles maximum length fields", () => {
    const profile: NostrProfile = {
      name: "a".repeat(256),
      about: "b".repeat(2000),
    };

    const result = validateProfile(profile);
    expect(result.valid).toBe(true);

    const content = profileToContent(profile);
    expect(content.name?.length).toBe(256);
    expect(content.about?.length).toBe(2000);
  });
});
