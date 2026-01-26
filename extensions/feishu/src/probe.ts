import type { ResolvedFeishuAccount } from "./accounts.js";
import { getBotIdentity, getTenantAccessToken } from "./api.js";

export async function probeFeishu(
  account: ResolvedFeishuAccount,
): Promise<
  | { ok: true; token: "ok"; bot: { openId?: string; userId?: string; name?: string } }
  | { ok: false; error: string }
> {
  try {
    await getTenantAccessToken(account);
    const bot = await getBotIdentity(account);
    return {
      ok: true,
      token: "ok",
      bot: { openId: bot.openId, userId: bot.userId, name: bot.name },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
