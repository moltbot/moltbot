import type { ChannelGroupContext } from "openclaw/plugin-sdk";

import { resolveMezonAccount } from "./mezon/accounts.js";

export function resolveMezonGroupRequireMention(params: ChannelGroupContext): boolean | undefined {
  const account = resolveMezonAccount({
    cfg: params.cfg,
    accountId: params.accountId,
  });
  if (typeof account.requireMention === "boolean") {
    return account.requireMention;
  }
  return true;
}
