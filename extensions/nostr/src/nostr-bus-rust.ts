/**
 * Nostr Bus implementation using @rust-nostr/nostr-sdk (WASM)
 *
 * This is an experimental alternative to the nostr-tools based implementation.
 * Key differences:
 * - Uses Rust-compiled WASM for crypto operations
 * - Higher-level Client abstraction with built-in relay pool
 * - NIP-17 private DMs support (uses NIP-44 encryption + NIP-59 gift wrap)
 *
 * Note: This requires calling loadWasmAsync() before any other operations.
 */

import {
  loadWasmAsync,
  Keys,
  Client,
  NostrSigner,
  Filter,
  Kind,
  EventBuilder,
  Tag,
  Timestamp,
  PublicKey,
  SecretKey,
  Metadata,
  RelayMessage,
  type Event as NostrEvent,
  type AbortHandle,
} from "@rust-nostr/nostr-sdk";

import {
  readNostrBusState,
  writeNostrBusState,
  computeSinceTimestamp,
  readNostrProfileState,
  writeNostrProfileState,
} from "./nostr-state-store.js";
import type { NostrProfile } from "./config-schema.js";
import type { ProfilePublishResult } from "./nostr-profile.js";
import { createSeenTracker, type SeenTracker } from "./seen-tracker.js";
import {
  createMetrics,
  createNoopMetrics,
  type NostrMetrics,
  type MetricsSnapshot,
  type MetricEvent,
} from "./metrics.js";

export const DEFAULT_RELAYS = ["wss://relay.damus.io", "wss://nos.lol"];

// ============================================================================
// Constants
// ============================================================================

const STARTUP_LOOKBACK_SEC = 120;
const MAX_PERSISTED_EVENT_IDS = 5000;
const STATE_PERSIST_DEBOUNCE_MS = 5000;

// Typing indicator configuration
// Kind 20001 is a community convention for typing indicators (not yet a formal NIP).
// Using 20xxx range as it's reserved for ephemeral events per NIP-16.
const TYPING_KIND = 20001;
const TYPING_TTL_SEC = 30;
const TYPING_THROTTLE_MS = 5000;

// ============================================================================
// Types
// ============================================================================

export interface RustNostrBusOptions {
  /** Private key in hex or nsec format */
  privateKey: string;
  /** WebSocket relay URLs (defaults to damus + nos.lol) */
  relays?: string[];
  /** Account ID for state persistence (optional, defaults to pubkey prefix) */
  accountId?: string;
  /** Called when a DM is received */
  onMessage: (
    pubkey: string,
    text: string,
    reply: (text: string) => Promise<void>,
    eventId: string,
  ) => Promise<void>;
  /** Called on errors (optional) */
  onError?: (error: Error, context: string) => void;
  /** Called on connection status changes (optional) */
  onConnect?: (relay: string) => void;
  /** Called on disconnection (optional) */
  onDisconnect?: (relay: string) => void;
  /** Called on EOSE (end of stored events) for initial sync (optional) */
  onEose?: (relay: string) => void;
  /** Called on each metric event (optional) */
  onMetric?: (event: MetricEvent) => void;
  /** Maximum entries in seen tracker (default: 100,000) */
  maxSeenEntries?: number;
  /** Seen tracker TTL in ms (default: 1 hour) */
  seenTtlMs?: number;
}

export interface RustNostrBusHandle {
  /** Stop the bus and close connections */
  close: () => Promise<void>;
  /** Get the bot's public key */
  publicKey: string;
  /** Send a DM to a pubkey (NIP-04 encrypted) */
  sendDm: (toPubkey: string, text: string) => Promise<void>;
  /** Get current metrics snapshot */
  getMetrics: () => MetricsSnapshot;
  /** Send typing indicator start (kind 20001) */
  sendTypingStart: (toPubkey: string) => Promise<void>;
  /** Send typing indicator stop (kind 20001) */
  sendTypingStop: (toPubkey: string) => Promise<void>;
  /** Publish a profile (kind:0) to all relays */
  publishProfile: (profile: NostrProfile) => Promise<ProfilePublishResult>;
  /** Get the last profile publish state */
  getProfileState: () => Promise<{
    lastPublishedAt: number | null;
    lastPublishedEventId: string | null;
    lastPublishResults: Record<string, "ok" | "failed" | "timeout"> | null;
  }>;
}

/**
 * Nostr relay message types (per NIP-01)
 * The JSON format is ["TYPE", ...args]
 */
type RelayMessageType = "EVENT" | "EOSE" | "OK" | "NOTICE" | "CLOSED" | "AUTH" | "COUNT";

/**
 * Parse the type from a RelayMessage
 * Returns the message type string or null if parsing fails
 */
function parseRelayMessageType(message: RelayMessage): RelayMessageType | null {
  try {
    const json = message.asJson();
    const parsed: unknown = JSON.parse(json);
    if (Array.isArray(parsed) && typeof parsed[0] === "string") {
      return parsed[0] as RelayMessageType;
    }
    return null;
  } catch {
    return null;
  }
}

// Track WASM initialization
let wasmInitialized = false;

/**
 * Initialize the WASM module (must be called once before using rust-nostr)
 */
export async function initRustNostr(): Promise<void> {
  if (wasmInitialized) return;
  await loadWasmAsync();
  wasmInitialized = true;
}

/**
 * Start the Nostr DM bus using rust-nostr SDK
 */
export async function startRustNostrBus(
  options: RustNostrBusOptions,
): Promise<RustNostrBusHandle> {
  // Ensure WASM is loaded
  await initRustNostr();

  const {
    privateKey,
    relays = DEFAULT_RELAYS,
    onMessage,
    onError,
    onEose,
    onMetric,
    maxSeenEntries = 100_000,
    seenTtlMs = 60 * 60 * 1000,
  } = options;

  // Parse private key (supports hex and nsec via parse())
  let secretKey: SecretKey;
  try {
    secretKey = SecretKey.parse(privateKey);
  } catch (err) {
    throw new Error(`Invalid private key: ${(err as Error).message}`);
  }

  const keys = new Keys(secretKey);
  const pk = keys.publicKey;
  const pkHex = pk.toHex();
  const accountId = options.accountId ?? pkHex.slice(0, 16);
  const gatewayStartedAt = Math.floor(Date.now() / 1000);

  // Initialize metrics
  const metrics = onMetric ? createMetrics(onMetric) : createNoopMetrics();

  // Initialize seen tracker
  const seen: SeenTracker = createSeenTracker({
    maxEntries: maxSeenEntries,
    ttlMs: seenTtlMs,
  });

  // Read persisted state
  const state = await readNostrBusState({ accountId });
  const baseSince = computeSinceTimestamp(state, gatewayStartedAt);
  const since = Math.max(0, baseSince - STARTUP_LOOKBACK_SEC);

  // Seed in-memory dedupe
  if (state?.recentEventIds?.length) {
    seen.seed(state.recentEventIds);
  }

  // Persist startup timestamp
  await writeNostrBusState({
    accountId,
    lastProcessedAt: state?.lastProcessedAt ?? gatewayStartedAt,
    gatewayStartedAt,
    recentEventIds: state?.recentEventIds ?? [],
  });

  // Create client with signer
  const signer = NostrSigner.keys(keys);
  const client = new Client(signer);

  // Add relays
  for (const relay of relays) {
    await client.addRelay(relay);
    options.onConnect?.(relay);
  }

  // Connect to all relays
  await client.connect();

  // Subscribe to DMs (kind 4) addressed to us
  // Note: Filter methods return new instances (immutable builder pattern)
  let dmFilter = new Filter();
  dmFilter = dmFilter.kind(new Kind(4));
  dmFilter = dmFilter.pubkey(pk);
  dmFilter = dmFilter.since(Timestamp.fromSecs(since));

  // State for debounced persistence
  let pendingWrite: ReturnType<typeof setTimeout> | undefined;
  let lastProcessedAt = state?.lastProcessedAt ?? gatewayStartedAt;
  let recentEventIds = (state?.recentEventIds ?? []).slice(-MAX_PERSISTED_EVENT_IDS);

  function scheduleStatePersist(eventCreatedAt: number, eventId: string): void {
    lastProcessedAt = Math.max(lastProcessedAt, eventCreatedAt);
    recentEventIds.push(eventId);
    if (recentEventIds.length > MAX_PERSISTED_EVENT_IDS) {
      recentEventIds = recentEventIds.slice(-MAX_PERSISTED_EVENT_IDS);
    }

    if (pendingWrite) clearTimeout(pendingWrite);
    pendingWrite = setTimeout(() => {
      writeNostrBusState({
        accountId,
        lastProcessedAt,
        gatewayStartedAt,
        recentEventIds,
      }).catch((err) => onError?.(err as Error, "persist state"));
    }, STATE_PERSIST_DEBOUNCE_MS);
  }

  // Handle incoming events - store abort handle for cleanup
  const notificationHandle: AbortHandle = client.handleNotifications({
    handleEvent: async (relayUrl: string, subscriptionId: string, event: NostrEvent): Promise<boolean> => {
      try {
        const eventId = event.id.toHex();
        const eventPubkey = event.author.toHex();
        const createdAt = event.createdAt.asSecs();

        metrics.emit("event.received");

        // Dedupe
        if (seen.peek(eventId)) {
          metrics.emit("event.duplicate");
          return false;
        }

        // Skip self-messages
        if (eventPubkey === pkHex) {
          metrics.emit("event.rejected.self_message");
          return false;
        }

        // Skip stale events
        if (createdAt < since) {
          metrics.emit("event.rejected.stale");
          return false;
        }

        seen.add(eventId);
        metrics.emit("memory.seen_tracker_size", seen.size());

        // Decrypt the DM content
        let plaintext: string;
        try {
          // rust-nostr handles NIP-04 decryption
          plaintext = await signer.nip04Decrypt(PublicKey.parse(eventPubkey), event.content);
          metrics.emit("decrypt.success");
        } catch (err) {
          metrics.emit("decrypt.failure");
          metrics.emit("event.rejected.decrypt_failed");
          onError?.(err as Error, `decrypt from ${eventPubkey}`);
          return false;
        }

        // Create reply function
        const replyTo = async (text: string): Promise<void> => {
          const ciphertext = await signer.nip04Encrypt(PublicKey.parse(eventPubkey), text);
          const replyEvent = new EventBuilder(new Kind(4), ciphertext)
            .tag(Tag.publicKey(PublicKey.parse(eventPubkey)));

          await client.sendEventBuilder(replyEvent);
        };

        // Call message handler
        await onMessage(eventPubkey, plaintext, replyTo, eventId);

        metrics.emit("event.processed");
        scheduleStatePersist(createdAt, eventId);
        return false;
      } catch (err) {
        onError?.(err as Error, `event handling`);
        return false;
      }
    },
    handleMsg: async (relayUrl: string, message: RelayMessage): Promise<boolean> => {
      // Detect EOSE using proper type parsing instead of string matching
      const messageType = parseRelayMessageType(message);
      if (messageType === "EOSE") {
        onEose?.(relayUrl);
      }
      return false;
    },
  });

  // Subscribe (single filter, not array)
  await client.subscribe(dmFilter, undefined);

  // Typing indicator throttling
  const lastTypingSent = new Map<string, number>();

  const sendTypingIndicator = async (
    toPubkey: string,
    action: "start" | "stop",
  ): Promise<void> => {
    const now = Date.now();

    // Throttle start events (stop bypasses for better UX)
    if (action === "start") {
      const lastSent = lastTypingSent.get(toPubkey) ?? 0;
      if (now - lastSent < TYPING_THROTTLE_MS) {
        return;
      }
      lastTypingSent.set(toPubkey, now);
    }

    try {
      // Encrypt the action for privacy
      const ciphertext = await signer.nip04Encrypt(PublicKey.parse(toPubkey), action);

      // Build typing event with expiration
      const expirationTs = Math.floor(now / 1000) + TYPING_TTL_SEC;
      const typingEvent = new EventBuilder(new Kind(TYPING_KIND), ciphertext)
        .tag(Tag.publicKey(PublicKey.parse(toPubkey)))
        .tag(Tag.parse(["t", "clawdbot-typing"]))
        .tag(Tag.parse(["expiration", String(expirationTs)]));

      await client.sendEventBuilder(typingEvent);

      const metricName = action === "start" ? "typing.start.sent" : "typing.stop.sent";
      metrics.emit(metricName);
    } catch (err) {
      metrics.emit("typing.error");
      onError?.(err as Error, `typing ${action}`);
      // Don't throw - typing failures are non-critical
    }
  };

  // Profile publishing function using rust-nostr Metadata
  const publishProfile = async (profile: NostrProfile): Promise<ProfilePublishResult> => {
    // Read last published timestamp for monotonic ordering
    const profileState = await readNostrProfileState({ accountId });
    const lastPublishedAt = profileState?.lastPublishedAt ?? undefined;

    // Ensure monotonic timestamp
    const now = Math.floor(Date.now() / 1000);
    const createdAt = lastPublishedAt !== undefined ? Math.max(now, lastPublishedAt + 1) : now;

    // Build metadata using rust-nostr's Metadata class
    let metadata = new Metadata();
    if (profile.name) metadata = metadata.name(profile.name);
    if (profile.displayName) metadata = metadata.displayName(profile.displayName);
    if (profile.about) metadata = metadata.about(profile.about);
    if (profile.picture) metadata = metadata.picture(profile.picture);
    if (profile.banner) metadata = metadata.banner(profile.banner);
    if (profile.website) metadata = metadata.website(profile.website);
    if (profile.nip05) metadata = metadata.nip05(profile.nip05);
    if (profile.lud16) metadata = metadata.lud16(profile.lud16);

    // Create and sign the profile event
    const profileEvent = EventBuilder.metadata(metadata);

    // Publish to all relays and collect results
    // Note: rust-nostr's sendEventBuilder broadcasts to ALL connected relays at once
    const successes: string[] = [];
    const failures: Array<{ relay: string; error: string }> = [];
    let eventId = "";

    try {
      const output = await client.sendEventBuilder(profileEvent);
      eventId = output.id.toHex();
      // All connected relays receive it
      for (const relay of relays) {
        successes.push(relay);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      for (const relay of relays) {
        failures.push({ relay, error: errorMessage });
      }
    }

    // Convert results to state format
    const publishResults: Record<string, "ok" | "failed" | "timeout"> = {};
    for (const relay of successes) {
      publishResults[relay] = "ok";
    }
    for (const { relay, error } of failures) {
      publishResults[relay] = error === "timeout" ? "timeout" : "failed";
    }

    // Persist the publish state
    await writeNostrProfileState({
      accountId,
      lastPublishedAt: createdAt,
      lastPublishedEventId: eventId,
      lastPublishResults: publishResults,
    });

    return {
      eventId,
      successes,
      failures,
      createdAt,
    };
  };

  // Get profile state function
  const getProfileState = async () => {
    const state = await readNostrProfileState({ accountId });
    return {
      lastPublishedAt: state?.lastPublishedAt ?? null,
      lastPublishedEventId: state?.lastPublishedEventId ?? null,
      lastPublishResults: state?.lastPublishResults ?? null,
    };
  };

  return {
    close: async () => {
      // Abort the notification handler to stop processing events
      notificationHandle.abort();

      if (pendingWrite) {
        clearTimeout(pendingWrite);
        await writeNostrBusState({
          accountId,
          lastProcessedAt,
          gatewayStartedAt,
          recentEventIds,
        });
      }
      await client.disconnect();
      seen.stop();
    },
    publicKey: pkHex,
    sendDm: async (toPubkey: string, text: string): Promise<void> => {
      const recipientPk = PublicKey.parse(toPubkey);
      const ciphertext = await signer.nip04Encrypt(recipientPk, text);
      const dmEvent = new EventBuilder(new Kind(4), ciphertext)
        .tag(Tag.publicKey(recipientPk));
      await client.sendEventBuilder(dmEvent);
    },
    getMetrics: () => metrics.getSnapshot(),
    sendTypingStart: (toPubkey: string) => sendTypingIndicator(toPubkey, "start"),
    sendTypingStop: (toPubkey: string) => sendTypingIndicator(toPubkey, "stop"),
    publishProfile,
    getProfileState,
  };
}

/**
 * Check if a string looks like a valid Nostr pubkey (hex or npub)
 * Works without WASM - uses simple validation
 */
export function isValidPubkeyRust(input: string): boolean {
  if (typeof input !== "string") {
    return false;
  }
  const trimmed = input.trim();

  // npub format - basic check
  if (trimmed.startsWith("npub1")) {
    return trimmed.length >= 60 && /^npub1[a-z0-9]+$/.test(trimmed);
  }

  // Hex format
  return /^[0-9a-fA-F]{64}$/.test(trimmed);
}

/**
 * Normalize a pubkey to hex format (accepts npub or hex)
 * Works without WASM for hex keys, requires WASM for npub decoding
 */
export function normalizePubkeyRust(input: string): string {
  const trimmed = input.trim();

  // Already hex - validate and return lowercase
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // npub format - requires WASM
  if (trimmed.startsWith("npub1")) {
    if (!wasmInitialized) {
      throw new Error("WASM not initialized - call initRustNostr() first for npub decoding");
    }
    const pk = PublicKey.parse(trimmed);
    return pk.toHex();
  }

  throw new Error("Pubkey must be 64 hex characters or npub format");
}

/**
 * Convert a hex pubkey to npub format
 */
export function pubkeyToNpubRust(hexPubkey: string): string {
  const pk = PublicKey.parse(hexPubkey);
  return pk.toBech32();
}

/**
 * Get public key from private key (hex or nsec format)
 * Uses rust-nostr's SecretKey.parse which handles both formats
 * Note: WASM must be initialized via initRustNostr() before calling this
 */
export function getPublicKeyFromPrivateRust(privateKey: string): string {
  if (!wasmInitialized) {
    throw new Error("WASM not initialized - call initRustNostr() first");
  }
  const secretKey = SecretKey.parse(privateKey.trim());
  const keys = new Keys(secretKey);
  return keys.publicKey.toHex();
}
