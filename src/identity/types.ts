/**
 * Identity mapping types for cross-provider session sharing.
 *
 * Allows linking multiple provider identities (e.g., WhatsApp phone number
 * and Telegram user ID) to a single shared Claude session ID.
 */

export type ProviderIdentity = {
  /** WhatsApp phone number (e.g., "+1234567890") */
  whatsapp?: string;
  /** Telegram user ID (e.g., "123456789") */
  telegram?: string;
  /** Twilio phone number (e.g., "+1234567890") */
  twilio?: string;
};

export type IdentityMapping = {
  /** Unique identifier for this shared identity */
  id: string;
  /** Optional human-readable name */
  name?: string;
  /** Provider-specific identifiers */
  identities: ProviderIdentity;
  /** When this mapping was created */
  createdAt: string;
  /** When this mapping was last updated */
  updatedAt: string;
};

export type IdentityMap = {
  /** Version for future schema migrations */
  version: number;
  /** Map of shared ID to identity mapping */
  mappings: Record<string, IdentityMapping>;
};
