import type express from "express";

import type { BrowserRouteContext } from "../server-context.js";
import { jsonError, toNumber, toStringOrEmpty } from "./utils.js";

export function registerBrowserTabRoutes(
  app: express.Express,
  ctx: BrowserRouteContext,
) {
  app.get("/tabs", async (_req, res) => {
    try {
      const reachable = await ctx.isReachable(300);
      if (!reachable)
        return res.json({ running: false, tabs: [] as unknown[] });
      const tabs = await ctx.listTabs();
      res.json({ running: true, tabs });
    } catch (err) {
      jsonError(res, 500, String(err));
    }
  });

  app.post("/tabs/open", async (req, res) => {
    const url = toStringOrEmpty((req.body as { url?: unknown })?.url);
    if (!url) return jsonError(res, 400, "url is required");
    try {
      await ctx.ensureBrowserAvailable();
      const tab = await ctx.openTab(url);
      res.json(tab);
    } catch (err) {
      jsonError(res, 500, String(err));
    }
  });

  app.post("/tabs/focus", async (req, res) => {
    const targetId = toStringOrEmpty(
      (req.body as { targetId?: unknown })?.targetId,
    );
    if (!targetId) return jsonError(res, 400, "targetId is required");
    try {
      if (!(await ctx.isReachable(300)))
        return jsonError(res, 409, "browser not running");
      await ctx.focusTab(targetId);
      res.json({ ok: true });
    } catch (err) {
      const mapped = ctx.mapTabError(err);
      if (mapped) return jsonError(res, mapped.status, mapped.message);
      jsonError(res, 500, String(err));
    }
  });

  app.delete("/tabs/:targetId", async (req, res) => {
    const targetId = toStringOrEmpty(req.params.targetId);
    if (!targetId) return jsonError(res, 400, "targetId is required");
    try {
      if (!(await ctx.isReachable(300)))
        return jsonError(res, 409, "browser not running");
      await ctx.closeTab(targetId);
      res.json({ ok: true });
    } catch (err) {
      const mapped = ctx.mapTabError(err);
      if (mapped) return jsonError(res, mapped.status, mapped.message);
      jsonError(res, 500, String(err));
    }
  });

  app.post("/tabs/action", async (req, res) => {
    const action = toStringOrEmpty((req.body as { action?: unknown })?.action);
    const index = toNumber((req.body as { index?: unknown })?.index);
    try {
      if (action === "list") {
        const reachable = await ctx.isReachable(300);
        if (!reachable) return res.json({ ok: true, tabs: [] as unknown[] });
        const tabs = await ctx.listTabs();
        return res.json({ ok: true, tabs });
      }

      if (action === "new") {
        await ctx.ensureBrowserAvailable();
        const tab = await ctx.openTab("about:blank");
        return res.json({ ok: true, tab });
      }

      if (action === "close") {
        const tabs = await ctx.listTabs();
        const target = typeof index === "number" ? tabs[index] : tabs.at(0);
        if (!target) return jsonError(res, 404, "tab not found");
        await ctx.closeTab(target.targetId);
        return res.json({ ok: true, targetId: target.targetId });
      }

      if (action === "select") {
        if (typeof index !== "number")
          return jsonError(res, 400, "index is required");
        const tabs = await ctx.listTabs();
        const target = tabs[index];
        if (!target) return jsonError(res, 404, "tab not found");
        await ctx.focusTab(target.targetId);
        return res.json({ ok: true, targetId: target.targetId });
      }

      return jsonError(res, 400, "unknown tab action");
    } catch (err) {
      const mapped = ctx.mapTabError(err);
      if (mapped) return jsonError(res, mapped.status, mapped.message);
      jsonError(res, 500, String(err));
    }
  });
}
