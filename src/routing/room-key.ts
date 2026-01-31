import crypto from "node:crypto";

import type { PluginHookResolveRoomKeyEvent } from "../plugins/types.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";

const MAX_CANONICAL_ROOM_KEY_CHARS = 512;

function sanitizeRoomKey(key: string): string {
  // Treat plugin output as untrusted. Keep it mostly opaque, but remove control chars
  // that can break logs/serialization.
  return key.trim().replace(/[\u0000-\u001F\u007F]/g, "");
}

function clampRoomKey(key: string, maxChars = MAX_CANONICAL_ROOM_KEY_CHARS): string {
  if (key.length <= maxChars) return key;

  // Deterministic clamping: keep a readable prefix, append a stable hash suffix.
  const hash = crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
  const suffix = `~${hash}`;
  const keep = Math.max(0, maxChars - suffix.length);
  return `${key.slice(0, keep)}${suffix}`;
}

export async function resolveCanonicalRoomKey(params: {
  roomKey: string;
  baseRoomKey: string;
  event: Omit<PluginHookResolveRoomKeyEvent, "roomKey" | "baseRoomKey">;
}): Promise<string> {
  // Core invariant: canonical room keys must never be empty.
  // If the computed key is somehow invalid, fall back to baseRoomKey.
  const computed = sanitizeRoomKey(params.roomKey);
  const base = sanitizeRoomKey(params.baseRoomKey);
  const fallback = clampRoomKey(computed || base || params.roomKey);

  const runner = getGlobalHookRunner();
  if (!runner?.hasHooks?.("resolve_room_key")) {
    return fallback;
  }

  const out = await runner.runResolveRoomKey(
    {
      ...params.event,
      roomKey: fallback,
      baseRoomKey: params.baseRoomKey,
    },
    {
      channelId: params.event.channel,
      sessionKey: fallback,
    },
  );

  const proposedRaw = typeof out?.roomKey === "string" ? out.roomKey : "";
  const proposed = clampRoomKey(sanitizeRoomKey(proposedRaw));
  return proposed ? proposed : fallback;
}
