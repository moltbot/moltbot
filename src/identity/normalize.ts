import { findMappingByIdentity } from "./storage.js";

/**
 * Normalize a session ID based on identity mappings.
 *
 * If the provider identity is mapped to a shared identity, returns the shared ID.
 * Otherwise, returns the provider-specific session ID.
 *
 * @param provider - The messaging provider
 * @param rawId - The raw provider-specific identifier (phone number, user ID, etc.)
 * @returns Normalized session ID for Claude conversation storage
 */
export async function normalizeSessionId(
  provider: "whatsapp" | "telegram" | "twilio",
  rawId: string,
): Promise<string> {
  // Try to find a mapping for this identity
  const mapping = await findMappingByIdentity(provider, rawId);

  if (mapping) {
    // Use the shared identity ID
    return mapping.id;
  }

  // No mapping found, use provider-specific format
  // WhatsApp and Twilio use phone numbers directly
  // Telegram prefixes with "telegram:"
  return provider === "telegram" ? `telegram:${rawId}` : rawId;
}

/**
 * Get the original provider-specific ID from a normalized session ID.
 *
 * This is useful for displaying the original identity to users.
 *
 * @param provider - The messaging provider
 * @param normalizedId - The normalized session ID
 * @returns The original provider-specific ID, or null if not found
 */
export function denormalizeSessionId(
  provider: "whatsapp" | "telegram" | "twilio",
  normalizedId: string,
): string | null {
  // If it's a provider-prefixed ID, extract the raw ID
  if (provider === "telegram" && normalizedId.startsWith("telegram:")) {
    return normalizedId.slice("telegram:".length);
  }

  // For WhatsApp/Twilio, if it looks like a phone number, return it
  if (
    (provider === "whatsapp" || provider === "twilio") &&
    normalizedId.startsWith("+")
  ) {
    return normalizedId;
  }

  // Otherwise it's probably a shared ID - we can't denormalize without lookup
  return null;
}
