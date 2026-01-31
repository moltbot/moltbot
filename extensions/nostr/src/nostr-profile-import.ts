/**
 * Nostr Profile Import
 *
 * Fetches and verifies kind:0 profile events from relays.
 * Used to import existing profiles before editing.
 */

import {
  Client,
  Filter,
  Kind,
  PublicKey,
  Timestamp,
  loadWasmAsync,
} from "@rust-nostr/nostr-sdk";

import { contentToProfile, type ProfileContent } from "./nostr-profile.js";
import type { NostrProfile } from "./config-schema.js";
import { validateUrlSafety } from "./nostr-profile-http.js";

// WASM initialization state
let wasmInitialized = false;

async function ensureWasmInitialized(): Promise<void> {
  if (!wasmInitialized) {
    await loadWasmAsync();
    wasmInitialized = true;
  }
}

// ============================================================================
// Types
// ============================================================================

export interface ProfileImportResult {
  /** Whether the import was successful */
  ok: boolean;
  /** The imported profile (if found and valid) */
  profile?: NostrProfile;
  /** The raw event (for advanced users) */
  event?: {
    id: string;
    pubkey: string;
    created_at: number;
  };
  /** Error message if import failed */
  error?: string;
  /** Which relays responded */
  relaysQueried: string[];
  /** Which relay provided the winning event */
  sourceRelay?: string;
}

export interface ProfileImportOptions {
  /** The public key to fetch profile for */
  pubkey: string;
  /** Relay URLs to query */
  relays: string[];
  /** Timeout per relay in milliseconds (default: 5000) */
  timeoutMs?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEOUT_MS = 5000;

// ============================================================================
// Profile Import
// ============================================================================

/**
 * Sanitize URLs in an imported profile to prevent SSRF attacks.
 * Removes any URLs that don't pass SSRF validation.
 */
function sanitizeProfileUrls(profile: NostrProfile): NostrProfile {
  const result = { ...profile };
  const urlFields = ["picture", "banner", "website"] as const;

  for (const field of urlFields) {
    const value = result[field];
    if (value && typeof value === "string") {
      const validation = validateUrlSafety(value);
      if (!validation.ok) {
        // Remove unsafe URL
        delete result[field];
      }
    }
  }

  return result;
}

/**
 * Fetch the latest kind:0 profile event for a pubkey from relays.
 *
 * - Queries all relays in parallel
 * - Takes the event with the highest created_at
 * - Verifies the event signature (rust-nostr does this automatically)
 * - Parses and returns the profile
 */
export async function importProfileFromRelays(
  opts: ProfileImportOptions,
): Promise<ProfileImportResult> {
  const { pubkey, relays, timeoutMs = DEFAULT_TIMEOUT_MS } = opts;

  if (!pubkey || !/^[0-9a-fA-F]{64}$/.test(pubkey)) {
    return {
      ok: false,
      error: "Invalid pubkey format (must be 64 hex characters)",
      relaysQueried: [],
    };
  }

  if (relays.length === 0) {
    return {
      ok: false,
      error: "No relays configured",
      relaysQueried: [],
    };
  }

  // Initialize WASM
  await ensureWasmInitialized();

  const client = new Client();
  const relaysQueried: string[] = [...relays];

  try {
    // Add relays to client
    for (const relay of relays) {
      await client.addRelay(relay);
    }
    await client.connect();

    // Build filter for kind:0 events from this pubkey
    const pk = PublicKey.parse(pubkey);
    let filter = new Filter();
    filter = filter.kind(new Kind(0));
    filter = filter.author(pk);
    filter = filter.limit(1);

    // Fetch events with timeout
    const timeoutDuration = { secs: BigInt(Math.floor(timeoutMs / 1000)), nanos: 0 };
    const events = await client.fetchEvents(filter, timeoutDuration);

    // No events found
    if (!events || events.length === 0) {
      return {
        ok: false,
        error: "No profile found on any relay",
        relaysQueried,
      };
    }

    // Find the event with the highest created_at (newest wins for replaceable events)
    let bestEvent: { id: string; pubkey: string; content: string; created_at: number } | null = null;
    for (const event of events) {
      const createdAt = Number(event.createdAt.asSecs());
      if (!bestEvent || createdAt > bestEvent.created_at) {
        bestEvent = {
          id: event.id.toHex(),
          pubkey: event.author.toHex(),
          content: event.content,
          created_at: createdAt,
        };
      }
    }

    if (!bestEvent) {
      return {
        ok: false,
        error: "No valid profile event found",
        relaysQueried,
      };
    }

    // Note: rust-nostr automatically verifies event signatures

    // Parse the profile content
    let content: ProfileContent;
    try {
      content = JSON.parse(bestEvent.content) as ProfileContent;
    } catch {
      return {
        ok: false,
        error: "Profile event has invalid JSON content",
        relaysQueried,
      };
    }

    // Convert to our profile format
    const profile = contentToProfile(content);

    // Sanitize URLs from imported profile to prevent SSRF when auto-merging
    const sanitizedProfile = sanitizeProfileUrls(profile);

    return {
      ok: true,
      profile: sanitizedProfile,
      event: {
        id: bestEvent.id,
        pubkey: bestEvent.pubkey,
        created_at: bestEvent.created_at,
      },
      relaysQueried,
    };
  } finally {
    await client.disconnect();
  }
}

/**
 * Merge imported profile with local profile.
 *
 * Strategy:
 * - For each field, prefer local if set, otherwise use imported
 * - This preserves user customizations while filling in missing data
 */
export function mergeProfiles(
  local: NostrProfile | undefined,
  imported: NostrProfile | undefined,
): NostrProfile {
  if (!imported) {
    return local ?? {};
  }
  if (!local) {
    return imported;
  }

  return {
    name: local.name ?? imported.name,
    displayName: local.displayName ?? imported.displayName,
    about: local.about ?? imported.about,
    picture: local.picture ?? imported.picture,
    banner: local.banner ?? imported.banner,
    website: local.website ?? imported.website,
    nip05: local.nip05 ?? imported.nip05,
    lud16: local.lud16 ?? imported.lud16,
  };
}
