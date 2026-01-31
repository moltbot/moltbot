import { describe, expect, it, vi, beforeAll } from "vitest";

const TEST_HEX_KEY = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TEST_PUBKEY = "f".repeat(64);

// Mock state store
vi.mock("./nostr-state-store.js", () => {
  return {
    readNostrBusState: vi.fn(async () => null),
    writeNostrBusState: vi.fn(async () => undefined),
    computeSinceTimestamp: vi.fn(() => 0),
    readNostrProfileState: vi.fn(async () => null),
    writeNostrProfileState: vi.fn(async () => undefined),
  };
});

describe("rust-nostr SDK integration", () => {
  it("loads WASM and initializes keys", async () => {
    const { initRustNostr, normalizePubkeyRust, pubkeyToNpubRust } = await import(
      "./nostr-bus-rust.js"
    );

    // Initialize WASM
    await initRustNostr();

    // Test pubkey normalization
    const normalized = normalizePubkeyRust(TEST_PUBKEY);
    expect(normalized).toBe(TEST_PUBKEY.toLowerCase());

    // Test npub conversion
    const npub = pubkeyToNpubRust(TEST_PUBKEY);
    expect(npub).toMatch(/^npub1/);

    // Round-trip
    const backToHex = normalizePubkeyRust(npub);
    expect(backToHex).toBe(TEST_PUBKEY.toLowerCase());
  });

  it("derives public key correctly from private key", async () => {
    const { initRustNostr } = await import("./nostr-bus-rust.js");
    const { Keys, SecretKey } = await import("@rust-nostr/nostr-sdk");

    await initRustNostr();

    // Derive public key directly (without starting the full bus)
    const secretKey = SecretKey.parse(TEST_HEX_KEY);
    const keys = new Keys(secretKey);
    const publicKey = keys.publicKey.toHex();

    // Public key should be derived correctly
    expect(publicKey).toHaveLength(64);
    expect(publicKey).toMatch(/^[0-9a-f]+$/);
  });

  it("bus handle interface is correctly typed", async () => {
    const { initRustNostr } = await import("./nostr-bus-rust.js");
    const { Keys, SecretKey, Client, NostrSigner } = await import("@rust-nostr/nostr-sdk");

    await initRustNostr();

    // Test that we can create the components without the full bus
    const secretKey = SecretKey.parse(TEST_HEX_KEY);
    const keys = new Keys(secretKey);
    const signer = NostrSigner.keys(keys);
    const client = new Client(signer);

    // Verify the client has the methods we need
    expect(typeof client.addRelay).toBe("function");
    expect(typeof client.connect).toBe("function");
    expect(typeof client.disconnect).toBe("function");
    expect(typeof client.subscribe).toBe("function");
    expect(typeof client.sendEventBuilder).toBe("function");

    // Verify signer has NIP-04 methods
    expect(typeof signer.nip04Encrypt).toBe("function");
    expect(typeof signer.nip04Decrypt).toBe("function");
  });
});

describe("rust-nostr key derivation", () => {
  it("derives expected public key from test private key", async () => {
    const { initRustNostr } = await import("./nostr-bus-rust.js");
    const { Keys, SecretKey } = await import("@rust-nostr/nostr-sdk");

    await initRustNostr();

    // rust-nostr - uses parse() for both hex and bech32
    const rustSecretKey = SecretKey.parse(TEST_HEX_KEY);
    const rustKeys = new Keys(rustSecretKey);
    const rustPubkey = rustKeys.publicKey.toHex();

    // Should be a valid 64-char hex pubkey
    expect(rustPubkey).toMatch(/^[0-9a-f]{64}$/);
    // The expected pubkey for this test key
    expect(rustPubkey).toBe("4646ae5047316b4230d0086c8acec687f00b1cd9d1dc634f6cb358ac0a9a8fff");
  });
});

describe("getPublicKeyFromPrivateRust integration", () => {
  it("derives correct public key from hex private key after WASM init", async () => {
    const { initRustNostr, getPublicKeyFromPrivateRust } = await import("./nostr-bus-rust.js");

    // Initialize WASM (same as startRustNostrBus does internally)
    await initRustNostr();

    // The critical assertion: getPublicKeyFromPrivateRust should work after init
    const publicKey = getPublicKeyFromPrivateRust(TEST_HEX_KEY);

    expect(publicKey).toMatch(/^[0-9a-f]{64}$/);
    expect(publicKey).toBe("4646ae5047316b4230d0086c8acec687f00b1cd9d1dc634f6cb358ac0a9a8fff");

    // Verify it matches direct derivation
    const { Keys, SecretKey } = await import("@rust-nostr/nostr-sdk");
    const secretKey = SecretKey.parse(TEST_HEX_KEY);
    const keys = new Keys(secretKey);
    expect(publicKey).toBe(keys.publicKey.toHex());
  });

  it("derives correct public key from nsec format private key", async () => {
    const { initRustNostr, getPublicKeyFromPrivateRust } = await import("./nostr-bus-rust.js");
    const { SecretKey } = await import("@rust-nostr/nostr-sdk");

    await initRustNostr();

    // Get the nsec format of our test key
    const secretKey = SecretKey.parse(TEST_HEX_KEY);
    const nsecKey = secretKey.toBech32();
    expect(nsecKey).toMatch(/^nsec1/);

    // Should derive the same public key regardless of input format
    const publicKey = getPublicKeyFromPrivateRust(nsecKey);
    expect(publicKey).toBe("4646ae5047316b4230d0086c8acec687f00b1cd9d1dc634f6cb358ac0a9a8fff");
  });

  it("throws error if WASM not initialized", async () => {
    // Reset module to get fresh state (simulate not initialized)
    vi.resetModules();
    const { getPublicKeyFromPrivateRust } = await import("./nostr-bus-rust.js");

    // Should throw because WASM not initialized
    expect(() => getPublicKeyFromPrivateRust(TEST_HEX_KEY)).toThrow("WASM not initialized");
  });
});
