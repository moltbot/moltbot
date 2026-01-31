import type { PluginHookResolveRoomKeyEvent } from "../plugins/types.js";
import { getGlobalHookRunner } from "../plugins/hook-runner-global.js";

export async function resolveCanonicalRoomKey(params: {
  roomKey: string;
  baseRoomKey: string;
  event: Omit<PluginHookResolveRoomKeyEvent, "roomKey" | "baseRoomKey">;
}): Promise<string> {
  // Core invariant: canonical room keys must never be empty.
  // If the computed key is somehow invalid, fall back to baseRoomKey.
  const computed = params.roomKey.trim();
  const fallback = computed || params.baseRoomKey.trim() || params.roomKey;

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

  const proposed = typeof out?.roomKey === "string" ? out.roomKey.trim() : "";
  return proposed ? proposed : fallback;
}
