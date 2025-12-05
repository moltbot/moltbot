/**
 * Identity mapping module for cross-provider session sharing.
 *
 * This module allows linking multiple provider identities (e.g., WhatsApp phone
 * number and Telegram user ID) to share a single Claude conversation session.
 *
 * Usage:
 *   1. Link identities: `warelay identity link --whatsapp +1234 --telegram 5678 --name "John"`
 *   2. Session normalization happens automatically in auto-reply
 *   3. Unlink if needed: `warelay identity unlink <shared-id>`
 */

export * from "./types.js";
export * from "./storage.js";
export * from "./normalize.js";
