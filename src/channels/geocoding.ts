/**
 * Reverse geocoding for location messages.
 * Uses Nominatim (OpenStreetMap) by default - free, no API key required.
 * Respects usage policy: https://operations.osmfoundation.org/policies/nominatim/
 */

import { logVerbose, warn as logWarn } from "../globals.js";

export type GeocodingResult = {
  name?: string;
  address?: string;
  street?: string;
  houseNumber?: string;
  city?: string;
  state?: string;
  country?: string;
  postcode?: string;
  raw?: Record<string, unknown>;
};

export type GeocodingProvider = "nominatim" | "none";

export type GeocodingConfig = {
  enabled: boolean;
  provider: GeocodingProvider;
  /** Cache TTL in seconds (default: 3600 = 1 hour) */
  cacheTtlSeconds: number;
  /** Request timeout in ms (default: 5000) */
  timeoutMs: number;
  /** User-Agent for Nominatim (required by their policy) */
  userAgent: string;
};

const DEFAULT_CONFIG: GeocodingConfig = {
  enabled: true,
  provider: "nominatim",
  cacheTtlSeconds: 3600,
  timeoutMs: 5000,
  userAgent: "OpenClaw/1.0 (https://github.com/openclaw/openclaw)",
};

// Simple in-memory cache with TTL
const cache = new Map<string, { result: GeocodingResult; expiresAt: number }>();

function getCacheKey(latitude: number, longitude: number): string {
  // Round to 5 decimal places (~1m precision) for cache efficiency
  return `${latitude.toFixed(5)},${longitude.toFixed(5)}`;
}

function getCached(latitude: number, longitude: number): GeocodingResult | null {
  const key = getCacheKey(latitude, longitude);
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function setCache(
  latitude: number,
  longitude: number,
  result: GeocodingResult,
  ttlSeconds: number,
): void {
  const key = getCacheKey(latitude, longitude);
  cache.set(key, {
    result,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  // Prune old entries if cache gets too big
  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) {
        cache.delete(k);
      }
    }
  }
}

type NominatimResponse = {
  display_name?: string;
  address?: {
    house_number?: string;
    road?: string;
    street?: string;
    neighbourhood?: string;
    suburb?: string;
    city?: string;
    town?: string;
    village?: string;
    state?: string;
    county?: string;
    country?: string;
    postcode?: string;
    [key: string]: string | undefined;
  };
  [key: string]: unknown;
};

async function reverseGeocodeNominatim(
  latitude: number,
  longitude: number,
  config: GeocodingConfig,
): Promise<GeocodingResult | null> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", latitude.toString());
  url.searchParams.set("lon", longitude.toString());
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("zoom", "18"); // Building-level detail

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": config.userAgent,
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      logWarn(`Nominatim reverse geocoding failed: ${response.status} ${response.statusText}`);
      return null;
    }

    const data = (await response.json()) as NominatimResponse;
    const addr = data.address ?? {};

    // Build a human-readable street address
    const street = addr.road ?? addr.street ?? addr.neighbourhood ?? addr.suburb;
    const houseNumber = addr.house_number;
    const city = addr.city ?? addr.town ?? addr.village ?? addr.county;
    const state = addr.state;
    const country = addr.country;
    const postcode = addr.postcode;

    // Build structured address components
    const streetLine = [houseNumber, street].filter(Boolean).join(" ");
    const cityLine = [city, state, postcode].filter(Boolean).join(", ");
    const fullAddress = [streetLine, cityLine, country].filter(Boolean).join(", ");

    // Extract a short name (street + number, or neighbourhood)
    const shortName = streetLine || city || data.display_name?.split(",")[0];

    return {
      name: shortName,
      address: fullAddress,
      street,
      houseNumber,
      city,
      state,
      country,
      postcode,
      raw: data as Record<string, unknown>,
    };
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      logWarn(`Nominatim reverse geocoding timed out after ${config.timeoutMs}ms`);
    } else {
      logWarn(`Nominatim reverse geocoding error: ${(error as Error).message}`);
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reverse geocode coordinates to get address information.
 * Returns null if geocoding is disabled, fails, or times out.
 */
export async function reverseGeocode(
  latitude: number,
  longitude: number,
  configOverrides?: Partial<GeocodingConfig>,
): Promise<GeocodingResult | null> {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };

  if (!config.enabled || config.provider === "none") {
    return null;
  }

  // Check cache first
  const cached = getCached(latitude, longitude);
  if (cached) {
    logVerbose(`Geocoding cache hit for ${latitude}, ${longitude}`);
    return cached;
  }

  logVerbose(`Reverse geocoding ${latitude}, ${longitude} via ${config.provider}`);

  let result: GeocodingResult | null = null;

  if (config.provider === "nominatim") {
    result = await reverseGeocodeNominatim(latitude, longitude, config);
  }

  if (result) {
    setCache(latitude, longitude, result, config.cacheTtlSeconds);
  }

  return result;
}

/**
 * Format a geocoding result into a readable location string.
 */
export function formatGeocodedLocation(
  latitude: number,
  longitude: number,
  geocoded: GeocodingResult | null,
): string {
  const coords = `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

  if (!geocoded) {
    return `📍 ${coords}`;
  }

  const { name, address } = geocoded;

  if (name && address && name !== address) {
    return `📍 ${name} — ${address} (${coords})`;
  }

  if (address) {
    return `📍 ${address} (${coords})`;
  }

  if (name) {
    return `📍 ${name} (${coords})`;
  }

  return `📍 ${coords}`;
}
