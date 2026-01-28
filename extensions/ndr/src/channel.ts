import {
  buildChannelConfigSchema,
  DEFAULT_ACCOUNT_ID,
  type ChannelPlugin,
  createReplyPrefixContext,
} from "clawdbot/plugin-sdk";

import { NdrConfigSchema } from "./config-schema.js";
import { getNdrRuntime } from "./runtime.js";
import {
  listNdrAccountIds,
  resolveDefaultNdrAccountId,
  resolveNdrAccount,
  type ResolvedNdrAccount,
} from "./types.js";
import { startNdrBus, type NdrBusHandle } from "./ndr-bus.js";
import { ndrOnboardingAdapter } from "./onboarding.js";

// Store active bus handles per account
const activeBuses = new Map<string, NdrBusHandle>();

export const ndrPlugin: ChannelPlugin<ResolvedNdrAccount> = {
  id: "ndr",
  meta: {
    id: "ndr",
    label: "NDR",
    selectionLabel: "NDR (Nostr Double Ratchet)",
    docsPath: "/channels/ndr",
    docsLabel: "ndr",
    blurb: "Forward-secure E2E encryption via double ratchet over Nostr (chat.iris.to).",
    order: 56,
    selectionExtras: ["https://chat.iris.to"],
    quickstartAllowFrom: true,
  },
  capabilities: {
    chatTypes: ["direct"], // DMs only
    media: true, // Supports nhash media via htree
  },
  reload: { configPrefixes: ["channels.ndr"] },
  configSchema: buildChannelConfigSchema(NdrConfigSchema),
  onboarding: ndrOnboardingAdapter,

  config: {
    listAccountIds: (cfg) => listNdrAccountIds(cfg),
    resolveAccount: (cfg, accountId) => resolveNdrAccount({ cfg, accountId }),
    defaultAccountId: (cfg) => resolveDefaultNdrAccountId(cfg),
    isConfigured: (account) => account.configured,
    describeAccount: (account) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      publicKey: account.publicKey,
    }),
  },

  // Authorization is handled by NDR's invite/accept flow.
  // Only users with an established double ratchet session can message.
  // No pairing/allowFrom config needed - the invite exchange IS the authorization.

  messaging: {
    normalizeTarget: (target) => {
      // NDR uses chat IDs, not pubkeys directly
      return target.trim();
    },
    targetResolver: {
      looksLikeId: (input) => {
        const trimmed = input.trim();
        // Chat IDs are short hex strings
        return /^[0-9a-fA-F]{8}$/.test(trimmed) || trimmed.startsWith("npub1");
      },
      hint: "<chat_id|npub>",
    },
  },

  outbound: {
    deliveryMode: "direct",
    textChunkLimit: 4000,
    sendText: async ({ to, text, accountId }) => {
      const core = getNdrRuntime();
      const aid = accountId ?? DEFAULT_ACCOUNT_ID;
      const bus = activeBuses.get(aid);
      if (!bus) {
        throw new Error(`NDR bus not running for account ${aid}`);
      }
      // Resolve npub to chat_id if needed
      const chatId = await resolveNpubToChatId(bus, to);
      const tableMode = core.channel.text.resolveMarkdownTableMode({
        cfg: core.config.loadConfig(),
        channel: "ndr",
        accountId: aid,
      });
      const message = core.channel.text.convertMarkdownTables(text ?? "", tableMode);
      await bus.sendMessage(chatId, message);
      return { channel: "ndr", to: chatId };
    },
    sendMedia: async ({ to, text, mediaUrl, accountId }) => {
      const core = getNdrRuntime();
      const aid = accountId ?? DEFAULT_ACCOUNT_ID;
      const bus = activeBuses.get(aid);
      if (!bus) {
        throw new Error(`NDR bus not running for account ${aid}`);
      }
      // Resolve npub to chat_id if needed
      const chatId = await resolveNpubToChatId(bus, to);
      const caption = text ? `${text}\n` : "";

      // mediaUrl could be a local file path or a remote URL
      let mediaLink = mediaUrl ?? "[media attachment]";
      if (mediaUrl && !mediaUrl.startsWith("http")) {
        // Local file path - upload via htree
        try {
          const { execSync } = await import("child_process");
          // Properly escape the file path for shell
          const escapedPath = mediaUrl.replace(/'/g, "'\\''");
          const output = execSync(`htree add '${escapedPath}'`, {
            encoding: "utf-8",
            timeout: 60000,
          });
          // Parse "url: nhash1.../filename" from output
          const urlMatch = output.match(/url:\s+(nhash1[^\s]+)/);
          if (urlMatch) {
            mediaLink = urlMatch[1];
          }
        } catch {
          // htree not available or failed - fall back to original URL
          mediaLink = mediaUrl ?? "[media: upload failed]";
        }
      }

      const message = `${caption}${mediaLink}`;
      await bus.sendMessage(chatId, message);
      return { channel: "ndr", to: chatId };
    },
  },

  status: {
    defaultRuntime: {
      accountId: DEFAULT_ACCOUNT_ID,
      running: false,
      lastStartAt: null,
      lastStopAt: null,
      lastError: null,
    },
    collectStatusIssues: (accounts) =>
      accounts.flatMap((account) => {
        const lastError = typeof account.lastError === "string" ? account.lastError.trim() : "";
        if (!lastError) return [];
        return [
          {
            channel: "ndr",
            accountId: account.accountId,
            kind: "runtime" as const,
            message: `Channel error: ${lastError}`,
          },
        ];
      }),
    buildChannelSummary: ({ snapshot }) => ({
      configured: snapshot.configured ?? false,
      running: snapshot.running ?? false,
      lastStartAt: snapshot.lastStartAt ?? null,
      lastStopAt: snapshot.lastStopAt ?? null,
      lastError: snapshot.lastError ?? null,
    }),
    buildAccountSnapshot: ({ account, runtime }) => ({
      accountId: account.accountId,
      name: account.name,
      enabled: account.enabled,
      configured: account.configured,
      running: runtime?.running ?? false,
      lastStartAt: runtime?.lastStartAt ?? null,
      lastStopAt: runtime?.lastStopAt ?? null,
      lastError: runtime?.lastError ?? null,
      lastInboundAt: runtime?.lastInboundAt ?? null,
      lastOutboundAt: runtime?.lastOutboundAt ?? null,
    }),
  },

  gateway: {
    startAccount: async (ctx) => {
      const account = ctx.account;
      ctx.setStatus({
        accountId: account.accountId,
      });
      ctx.log?.info(`[${account.accountId}] starting NDR provider`);

      const runtime = getNdrRuntime();

      const bus = await startNdrBus({
        accountId: account.accountId,
        relays: account.relays,
        ndrPath: account.ndrPath,
        dataDir: account.dataDir,
        onMessage: async (chatId, messageId, senderPubkey, text, replyFn, media) => {
          ctx.log?.debug(`[${account.accountId}] Message from ${senderPubkey} in chat ${chatId}: ${text.slice(0, 50)}...${media ? ` [media: ${media.path}]` : ""}`);

          // React with "eyes" emoji to indicate we're processing (like WhatsApp "typing" indicator)
          if (messageId) {
            try {
              await bus.react(chatId, messageId, "👀");
            } catch {
              // Reaction failed, continue anyway
            }
          }

          // Check if sender is the owner
          // Note: senderPubkey is the ephemeral key used in the message, not the identity key.
          // We need to look up the chat's their_pubkey (identity) to compare with ownerPubkey.
          let identityPubkey = senderPubkey; // fallback
          try {
            const chats = await bus.listChats();
            const chat = chats.find((c) => c.id === chatId);
            if (chat) {
              identityPubkey = chat.their_pubkey;
            }
          } catch {
            // If lookup fails, fall back to senderPubkey
          }

          const isOwner = account.ownerPubkey && identityPubkey === account.ownerPubkey;

          if (!isOwner && account.ownerPubkey) {
            // Non-owner message - log and ignore
            ctx.log?.info(`[${account.accountId}] Ignoring message from non-owner ${identityPubkey}`);
            return;
          }

          // Process the message through clawdbot's reply pipeline
          const cfg = runtime.config.loadConfig();
          const ndrTo = `ndr:${chatId}`;

          // Resolve agent route for this chat
          const route = runtime.channel.routing.resolveAgentRoute({
            cfg,
            channel: "ndr",
            accountId: account.accountId,
            peer: { kind: "dm", id: chatId },
          });

          // Build the envelope for the message
          const envelopeOptions = runtime.channel.reply.resolveEnvelopeFormatOptions(cfg);
          const body = runtime.channel.reply.formatInboundEnvelope({
            channel: "NDR",
            from: identityPubkey.slice(0, 16) + "...",
            body: text,
            chatType: "direct",
            sender: { name: identityPubkey.slice(0, 8), id: identityPubkey },
            envelope: envelopeOptions,
          });

          // Finalize the inbound context
          const ctxPayload = runtime.channel.reply.finalizeInboundContext({
            Body: body,
            RawBody: text,
            CommandBody: text,
            From: `ndr:${identityPubkey}`,
            To: ndrTo,
            SessionKey: route.sessionKey,
            AccountId: route.accountId,
            ChatType: "direct" as const,
            ConversationLabel: `NDR chat ${chatId}`,
            SenderName: identityPubkey.slice(0, 8),
            SenderId: identityPubkey,
            Provider: "ndr" as const,
            Surface: "ndr" as const,
            MessageSid: `${chatId}-${Date.now()}`,
            CommandAuthorized: true, // Owner is always authorized
            OriginatingChannel: "ndr" as const,
            OriginatingTo: ndrTo,
            // Media fields (if nhash URL was downloaded)
            MediaPath: media?.path,
            MediaType: media?.mimeType ?? undefined,
            MediaUrl: media?.url,
          });

          // Record the session
          const storePath = runtime.channel.session.resolveStorePath(cfg.session?.store, {
            agentId: route.agentId,
          });
          await runtime.channel.session.recordInboundSession({
            storePath,
            sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
            ctx: ctxPayload,
            updateLastRoute: {
              sessionKey: route.mainSessionKey,
              channel: "ndr",
              to: chatId,
              accountId: route.accountId,
            },
          });

          // Create reply prefix context
          const prefixContext = createReplyPrefixContext({ cfg, agentId: route.agentId });

          // Create dispatcher with typing (simplified - no typing indicator for NDR)
          const { dispatcher, replyOptions, markDispatchIdle } = runtime.channel.reply.createReplyDispatcherWithTyping({
            responsePrefix: prefixContext.responsePrefix,
            responsePrefixContextProvider: prefixContext.responsePrefixContextProvider,
            humanDelay: runtime.channel.reply.resolveHumanDelayConfig(cfg, route.agentId),
            deliver: async (payload) => {
              ctx.log?.info(`[${account.accountId}] NDR deliver called with payload: ${JSON.stringify(payload).slice(0, 200)}`);
              const responseText = payload.text ?? "";
              if (responseText) {
                ctx.log?.info(`[${account.accountId}] NDR sending reply: ${responseText.slice(0, 100)}...`);
                await replyFn(responseText);
                ctx.log?.info(`[${account.accountId}] NDR reply sent successfully`);
              } else {
                ctx.log?.warn(`[${account.accountId}] NDR deliver called but no text in payload`);
              }
            },
            onError: (err, info) => {
              ctx.log?.error(`[${account.accountId}] NDR reply failed (${info.kind}): ${String(err)}`);
            },
          });

          // Dispatch the message
          await runtime.channel.reply.dispatchReplyFromConfig({
            ctx: ctxPayload,
            cfg,
            dispatcher,
            replyOptions: {
              ...replyOptions,
              onModelSelected: (modelCtx) => {
                prefixContext.onModelSelected(modelCtx);
              },
            },
          });
          markDispatchIdle();
        },
        onError: (error, context) => {
          ctx.log?.error(`[${account.accountId}] NDR error (${context}): ${error.message}`);
        },
        onConnect: () => {
          ctx.log?.info(`[${account.accountId}] NDR listener started`);
        },
        onDisconnect: () => {
          ctx.log?.warn(`[${account.accountId}] NDR listener disconnected`);
        },
      });

      // Store the bus handle
      activeBuses.set(account.accountId, bus);

      ctx.log?.info(`[${account.accountId}] NDR provider started`);

      // Return cleanup function
      return {
        stop: () => {
          bus.close();
          activeBuses.delete(account.accountId);
          ctx.log?.info(`[${account.accountId}] NDR provider stopped`);
        },
      };
    },
  },
};

/**
 * Get all active NDR bus handles
 */
export function getActiveNdrBuses(): Map<string, NdrBusHandle> {
  return new Map(activeBuses);
}

/**
 * Resolve npub to chat_id by looking up the chat list.
 * If the target is already a chat_id (8-char hex), returns it unchanged.
 * If it's an npub, finds the chat with matching their_pubkey.
 */
async function resolveNpubToChatId(bus: NdrBusHandle, target: string): Promise<string> {
  const trimmed = target.trim();

  // If it's already a chat_id (8-char hex), return as-is
  if (/^[0-9a-fA-F]{8}$/.test(trimmed)) {
    return trimmed;
  }

  // If it's an npub, resolve to chat_id
  if (trimmed.startsWith("npub1")) {
    // Convert npub to hex pubkey
    const hexPubkey = npubToHex(trimmed);
    if (!hexPubkey) {
      throw new Error(`Invalid npub: ${trimmed}`);
    }

    // Look up the chat with this pubkey
    const chats = await bus.listChats();
    const chat = chats.find((c) => c.their_pubkey === hexPubkey);
    if (!chat) {
      const availableChats = chats.length > 0
        ? ` Available chats: ${chats.map((c) => c.id).join(", ")}`
        : " No active chats found.";
      throw new Error(`No chat found with pubkey ${trimmed.slice(0, 20)}...${availableChats}`);
    }
    return chat.id;
  }

  // Unknown format, try as-is (let ndr CLI handle it)
  return trimmed;
}

/**
 * Convert bech32 npub to hex pubkey
 */
function npubToHex(npub: string): string | null {
  const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
  const CHARSET_REV: Record<string, number> = {};
  for (let i = 0; i < CHARSET.length; i++) {
    CHARSET_REV[CHARSET[i]] = i;
  }

  const bech = npub.toLowerCase();
  const pos = bech.lastIndexOf("1");
  if (pos < 1 || pos + 7 > bech.length) return null;

  const hrp = bech.slice(0, pos);
  if (hrp !== "npub") return null;

  const data: number[] = [];
  for (const c of bech.slice(pos + 1)) {
    if (!(c in CHARSET_REV)) return null;
    data.push(CHARSET_REV[c]);
  }

  // Remove checksum (last 6 chars)
  const dataWithoutChecksum = data.slice(0, -6);

  // Convert from 5-bit to 8-bit
  let acc = 0;
  let bits = 0;
  const result: number[] = [];
  for (const value of dataWithoutChecksum) {
    acc = (acc << 5) | value;
    bits += 5;
    while (bits >= 8) {
      bits -= 8;
      result.push((acc >> bits) & 0xff);
    }
  }

  return result.map((b) => b.toString(16).padStart(2, "0")).join("");
}
