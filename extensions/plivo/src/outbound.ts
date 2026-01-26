/**
 * Plivo Outbound Message Adapter
 * Handles sending SMS and MMS messages
 */

import * as Plivo from "plivo";
import { getAccountState } from "./runtime.js";
import type { PlivoResolvedAccount } from "./types.js";

export type OutboundContext = {
  to: string;
  text?: string;
  mediaUrl?: string;
  mediaUrls?: string[];
  accountId: string;
  account: PlivoResolvedAccount;
};

export type OutboundResult = {
  ok: boolean;
  externalId?: string;
  error?: string;
};

/**
 * Get Plivo client for account
 */
function getClient(accountId: string): Plivo.Client | undefined {
  const state = getAccountState(accountId);
  return state?.client as Plivo.Client | undefined;
}

/**
 * Normalize phone number to E.164 format
 */
function normalizePhoneNumber(phoneNumber: string): string {
  // Remove any non-digit characters except leading +
  let normalized = phoneNumber.replace(/[^\d+]/g, "");

  // Ensure it starts with +
  if (!normalized.startsWith("+")) {
    // Assume US number if 10 digits
    if (normalized.length === 10) {
      normalized = "+1" + normalized;
    } else {
      normalized = "+" + normalized;
    }
  }

  return normalized;
}

/**
 * Send SMS text message
 */
export async function sendText(ctx: OutboundContext): Promise<OutboundResult> {
  const client = getClient(ctx.accountId);
  if (!client) {
    return { ok: false, error: "Plivo client not initialized" };
  }

  if (!ctx.text) {
    return { ok: false, error: "No text content provided" };
  }

  const to = normalizePhoneNumber(ctx.to);
  const from = ctx.account.phoneNumber;

  try {
    const response = await client.messages.create(from, to, ctx.text);
    const messageId = Array.isArray(response.messageUuid)
      ? response.messageUuid[0]
      : response.messageUuid;

    return { ok: true, externalId: messageId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: errorMessage };
  }
}

/**
 * Send MMS with media attachments
 */
export async function sendMedia(ctx: OutboundContext): Promise<OutboundResult> {
  const client = getClient(ctx.accountId);
  if (!client) {
    return { ok: false, error: "Plivo client not initialized" };
  }

  const mediaUrls = ctx.mediaUrls || (ctx.mediaUrl ? [ctx.mediaUrl] : []);
  if (mediaUrls.length === 0) {
    return { ok: false, error: "No media URLs provided" };
  }

  const to = normalizePhoneNumber(ctx.to);
  const from = ctx.account.phoneNumber;
  const text = ctx.text || "";

  try {
    const response = await client.messages.create(from, to, text, {
      type: "mms",
      media_urls: mediaUrls,
    });

    const messageId = Array.isArray(response.messageUuid)
      ? response.messageUuid[0]
      : response.messageUuid;

    return { ok: true, externalId: messageId };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: errorMessage };
  }
}

/**
 * Resolve target phone number
 */
export function resolveTarget(target: string): { ok: boolean; to?: string; error?: string } {
  if (!target) {
    return { ok: false, error: "No target provided" };
  }

  // Validate it looks like a phone number
  const digitsOnly = target.replace(/\D/g, "");
  if (digitsOnly.length < 10 || digitsOnly.length > 15) {
    return { ok: false, error: "Invalid phone number format" };
  }

  return { ok: true, to: normalizePhoneNumber(target) };
}

/**
 * Outbound adapter for Clawdbot channel plugin
 */
export const outboundAdapter = {
  deliveryMode: "gateway" as const,
  sendText,
  sendMedia,
  resolveTarget,
};
