import { TypingStartListener, type Client } from "@buape/carbon";

const TYPING_TTL_MS = 10_000;

// channelId → Map<userId, expiresAtMs>
const peerTypingState = new Map<string, Map<string, number>>();

/**
 * Listener that tracks typing indicators from configured peer bots.
 * Used to implement typing-aware debounce for multi-bot coordination.
 */
export class PeerTypingListener extends TypingStartListener {
  constructor(private peerBotIds: Set<string>) {
    super();
  }

  async handle(data: { channel_id: string; user_id: string }, _client: Client): Promise<void> {
    // Only track typing from configured peer bots
    if (!this.peerBotIds.has(data.user_id)) return;

    let channelMap = peerTypingState.get(data.channel_id);
    if (!channelMap) {
      channelMap = new Map();
      peerTypingState.set(data.channel_id, channelMap);
    }
    channelMap.set(data.user_id, Date.now() + TYPING_TTL_MS);
  }
}

/**
 * Check if any of the specified peer bots are currently typing in the channel.
 * Returns true if at least one peer has a non-expired typing indicator.
 */
export function isPeerTyping(channelId: string, peerBotIds: string[]): boolean {
  const channelMap = peerTypingState.get(channelId);
  if (!channelMap) return false;

  const now = Date.now();
  for (const id of peerBotIds) {
    const expiresAt = channelMap.get(id);
    if (expiresAt && expiresAt > now) return true;
  }
  return false;
}

/**
 * Clean up expired typing indicators from the state map.
 * Called periodically or on-demand to prevent memory leaks.
 */
export function clearExpiredTyping(): void {
  const now = Date.now();
  for (const [channelId, channelMap] of peerTypingState) {
    for (const [userId, expiresAt] of channelMap) {
      if (expiresAt <= now) channelMap.delete(userId);
    }
    if (channelMap.size === 0) peerTypingState.delete(channelId);
  }
}

/**
 * Get the current typing state for debugging/diagnostics.
 */
export function getPeerTypingState(): Map<string, Map<string, number>> {
  return peerTypingState;
}
