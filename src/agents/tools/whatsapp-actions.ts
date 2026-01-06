import type { AgentToolResult } from "@mariozechner/pi-agent-core";

import { shouldLogVerbose } from "../../globals.js";
import { getActiveWebListener } from "../../web/active-listener.js";
import { sendMessageWhatsApp } from "../../web/outbound.js";
import { jsonResult, readStringParam } from "./common.js";

export async function handleWhatsAppAction(
  params: Record<string, unknown>,
): Promise<AgentToolResult<unknown>> {
  const action = readStringParam(params, "action", { required: true });

  switch (action) {
    case "send": {
      const to = readStringParam(params, "to", { required: true });
      const message = readStringParam(params, "message", { required: true });
      const mediaUrl = readStringParam(params, "mediaUrl");
      const gifPlayback = typeof params.gifPlayback === "boolean" ? params.gifPlayback : undefined;

      // Normalize phone number - ensure it starts with +
      const normalizedTo = to.startsWith("+") ? to : `+${to}`;

      const result = await sendMessageWhatsApp(normalizedTo, message, {
        mediaUrl: mediaUrl ?? undefined,
        gifPlayback: gifPlayback ?? undefined,
        verbose: shouldLogVerbose(),
      });

      return jsonResult({
        ok: true,
        messageId: result.messageId,
        to: result.toJid,
      });
    }

    case "status": {
      const active = getActiveWebListener();
      if (!active) {
        return jsonResult({
          connected: false,
          message: "WhatsApp gateway not active",
        });
      }
      return jsonResult({
        connected: true,
        message: "WhatsApp gateway connected",
      });
    }

    default:
      throw new Error(`Unknown WhatsApp action: ${action}`);
  }
}
