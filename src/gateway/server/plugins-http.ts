import type { IncomingMessage, ServerResponse } from "node:http";

import type { createSubsystemLogger } from "../../logging/subsystem.js";
import type { PluginRegistry } from "../../plugins/registry.js";
import type { ResolvedGatewayAuth } from "../auth.js";
import { authorizeGatewayConnect } from "../auth.js";
import { sendUnauthorized } from "../http-common.js";
import { getBearerToken, getHeader } from "../http-utils.js";

type SubsystemLogger = ReturnType<typeof createSubsystemLogger>;

export type PluginHttpRequestHandler = (
  req: IncomingMessage,
  res: ServerResponse,
) => Promise<boolean>;

export function createGatewayPluginRequestHandler(params: {
  registry: PluginRegistry;
  log: SubsystemLogger;
  auth?: ResolvedGatewayAuth;
  trustedProxies?: string[];
  protectApiPaths?: boolean;
}): PluginHttpRequestHandler {
  const { registry, log } = params;
  return async (req, res) => {
    const routes = registry.httpRoutes ?? [];
    const handlers = registry.httpHandlers ?? [];
    if (routes.length === 0 && handlers.length === 0) return false;

    const url = new URL(req.url ?? "/", "http://localhost");

    // Security hardening: by default, treat `/api/**` as an authenticated surface.
    // Plugins may expose config-mutating endpoints under this namespace.
    if (params.protectApiPaths !== false && url.pathname.startsWith("/api/")) {
      const token = getBearerToken(req) ?? getHeader(req, "x-moltbot-token")?.trim() ?? "";
      const auth = params.auth;
      if (!auth) {
        sendUnauthorized(res);
        return true;
      }
      const authResult = await authorizeGatewayConnect({
        auth,
        connectAuth: token ? { token, password: token } : null,
        req,
        trustedProxies: params.trustedProxies,
      });
      if (!authResult.ok) {
        sendUnauthorized(res);
        return true;
      }
    }

    if (routes.length > 0) {
      const route = routes.find((entry) => entry.path === url.pathname);
      if (route) {
        try {
          await route.handler(req, res);
          return true;
        } catch (err) {
          log.warn(`plugin http route failed (${route.pluginId ?? "unknown"}): ${String(err)}`);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "text/plain; charset=utf-8");
            res.end("Internal Server Error");
          }
          return true;
        }
      }
    }

    for (const entry of handlers) {
      try {
        const handled = await entry.handler(req, res);
        if (handled) return true;
      } catch (err) {
        log.warn(`plugin http handler failed (${entry.pluginId}): ${String(err)}`);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end("Internal Server Error");
        }
        return true;
      }
    }
    return false;
  };
}
