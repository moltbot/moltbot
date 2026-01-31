import {
  createMezonBotClient,
  fetchMezonBotUser,
  loginMezonClient,
  type MezonUser,
} from "./client.js";

export type MezonProbe = {
  ok: boolean;
  error?: string | null;
  elapsedMs?: number | null;
  bot?: MezonUser | null;
};

export async function probeMezon(
  token: string,
  botId: string,
  timeoutMs = 2500,
): Promise<MezonProbe> {
  if (!token.trim()) {
    return { ok: false, error: "token missing" };
  }
  if (!botId.trim()) {
    return { ok: false, error: "botId missing" };
  }
  const start = Date.now();
  const controller = timeoutMs > 0 ? new AbortController() : undefined;
  let timer: NodeJS.Timeout | null = null;
  if (controller) {
    timer = setTimeout(() => controller.abort(), timeoutMs);
  }
  try {
    const botClient = createMezonBotClient(token, botId);
    await loginMezonClient(botClient);
    const bot = await fetchMezonBotUser(botClient);
    const elapsedMs = Date.now() - start;
    return {
      ok: true,
      elapsedMs,
      bot,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      error: message,
      elapsedMs: Date.now() - start,
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
