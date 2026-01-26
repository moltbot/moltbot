/**
 * Plivo SMS Channel Plugin
 * Main channel implementation for Clawdbot
 */

import { configAdapter } from "./config.js";
import { gatewayAdapter } from "./gateway.js";
import { outboundAdapter } from "./outbound.js";
import type { PlivoResolvedAccount } from "./types.js";

const CHANNEL_ID = "plivo";

/**
 * Channel metadata for UI/docs
 */
const meta = {
  id: CHANNEL_ID,
  label: "Plivo",
  selectionLabel: "Plivo SMS",
  docsPath: "/channels/plivo",
  docsLabel: "plivo",
  blurb: "SMS/MMS via Plivo; universal phone access to your AI assistant.",
};

/**
 * Channel capabilities
 */
const capabilities = {
  supportsText: true,
  supportsMedia: true,
  supportsVoice: false,
  supportsVideo: false,
  supportsStickers: false,
  supportsPolls: false,
  supportsButtons: false,
  supportsFormatting: false, // SMS is plain text
  supportsThreading: false,
  supportsReactions: false,
  supportsEditing: false,
  supportsDeleting: false,
  maxTextLength: 1600, // SMS concatenation limit
  maxMediaSize: 5 * 1024 * 1024, // 5MB MMS limit
  maxMediaCount: 10,
};

/**
 * Plivo channel plugin definition
 */
export const plivoPlugin = {
  id: CHANNEL_ID,
  meta,
  capabilities,

  // Configuration adapter
  config: {
    listAccountIds: (cfg: { channels?: Record<string, unknown> }) =>
      configAdapter.listAccountIds(cfg),

    resolveAccount: (cfg: { channels?: Record<string, unknown> }, accountId?: string) =>
      configAdapter.resolveAccount(cfg, accountId),

    isConfigured: (cfg: { channels?: Record<string, unknown> }, accountId?: string) =>
      configAdapter.isConfigured(cfg, accountId),

    resolveAllowFrom: (cfg: { channels?: Record<string, unknown> }, accountId?: string) =>
      configAdapter.resolveAllowFrom(cfg, accountId),

    describeAccount: (cfg: { channels?: Record<string, unknown> }, accountId?: string) =>
      configAdapter.describeAccount(cfg, accountId),
  },

  // Gateway adapter for starting/stopping
  gateway: {
    startAccount: gatewayAdapter.startAccount,
    stopAccount: gatewayAdapter.stopAccount,
  },

  // Outbound adapter for sending messages
  outbound: {
    deliveryMode: outboundAdapter.deliveryMode,

    sendText: async (ctx: {
      to: string;
      text: string;
      accountId: string;
      account: PlivoResolvedAccount;
    }) => {
      const result = await outboundAdapter.sendText({
        to: ctx.to,
        text: ctx.text,
        accountId: ctx.accountId,
        account: ctx.account,
      });
      return { ok: result.ok, externalId: result.externalId, error: result.error };
    },

    sendMedia: async (ctx: {
      to: string;
      text?: string;
      mediaUrl?: string;
      mediaUrls?: string[];
      accountId: string;
      account: PlivoResolvedAccount;
    }) => {
      const result = await outboundAdapter.sendMedia({
        to: ctx.to,
        text: ctx.text,
        mediaUrl: ctx.mediaUrl,
        mediaUrls: ctx.mediaUrls,
        accountId: ctx.accountId,
        account: ctx.account,
      });
      return { ok: result.ok, externalId: result.externalId, error: result.error };
    },

    resolveTarget: (target: string) => outboundAdapter.resolveTarget(target),
  },

  // Status adapter for health checks
  status: {
    probeAccount: async (ctx: { accountId: string }) => {
      // Basic connectivity check
      return { ok: true, message: "Plivo account is running" };
    },

    buildAccountSnapshot: (ctx: { accountId: string; account: PlivoResolvedAccount }) => {
      return {
        accountId: ctx.accountId,
        phoneNumber: ctx.account.phoneNumber,
        dmPolicy: ctx.account.dmPolicy,
      };
    },
  },

  // Heartbeat adapter
  heartbeat: {
    checkReady: async (params: { accountId: string }) => {
      return { ok: true, reason: "Plivo ready" };
    },

    resolveRecipients: (params: { accountId: string; allowFrom: string[] }) => {
      return {
        recipients: params.allowFrom,
        source: "allowlist",
      };
    },
  },
};
