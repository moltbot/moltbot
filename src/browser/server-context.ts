import fs from "node:fs";

import { createTargetViaCdp, normalizeCdpWsUrl } from "./cdp.js";
import {
  isChromeCdpReady,
  isChromeReachable,
  launchClawdChrome,
  resolveClawdUserDataDir,
  stopClawdChrome,
} from "./chrome.js";
import type { ResolvedBrowserProfile } from "./config.js";
import { resolveProfile } from "./config.js";
import type {
  BrowserRouteContext,
  BrowserTab,
  ContextOptions,
  ProfileContext,
  ProfileRuntimeState,
  ProfileStatus,
} from "./server-context.types.js";
import { resolveTargetIdFromTabs } from "./target-id.js";
import { movePathToTrash } from "./trash.js";

export type {
  BrowserRouteContext,
  BrowserServerState,
  BrowserTab,
  ProfileContext,
  ProfileRuntimeState,
  ProfileStatus,
} from "./server-context.types.js";

/**
 * Normalize a CDP WebSocket URL to use the correct base URL.
 */
function normalizeWsUrl(
  raw: string | undefined,
  cdpBaseUrl: string,
): string | undefined {
  if (!raw) return undefined;
  try {
    return normalizeCdpWsUrl(raw, cdpBaseUrl);
  } catch {
    return raw;
  }
}

async function fetchJson<T>(
  url: string,
  timeoutMs = 1500,
  init?: RequestInit,
): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const u = new URL(url);
    const username = u.username;
    const password = u.password;
    u.username = "";
    u.password = "";
    const headers = new Headers(init?.headers);
    if ((username || password) && !headers.has("Authorization")) {
      const auth = Buffer.from(`${username}:${password}`).toString("base64");
      headers.set("Authorization", `Basic ${auth}`);
    }

    const res = await fetch(u.toString(), {
      ...init,
      headers,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}

async function fetchOk(
  url: string,
  timeoutMs = 1500,
  init?: RequestInit,
): Promise<void> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const u = new URL(url);
    const username = u.username;
    const password = u.password;
    u.username = "";
    u.password = "";
    const headers = new Headers(init?.headers);
    if ((username || password) && !headers.has("Authorization")) {
      const auth = Buffer.from(`${username}:${password}`).toString("base64");
      headers.set("Authorization", `Basic ${auth}`);
    }

    const res = await fetch(u.toString(), {
      ...init,
      headers,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  } finally {
    clearTimeout(t);
  }
}

/**
 * For remote profiles (like Browserless), we need to use Playwright's persistent
 * connection instead of transient HTTP/CDP calls. This is because Browserless
 * destroys browser sessions when WebSocket connections close.
 */
async function listTabsViaPlaywright(cdpUrl: string): Promise<BrowserTab[]> {
  try {
    const mod = await import("./pw-session.js");
    
    // Get existing connection (pw-session handles caching and reconnection)
    const page = await mod.getPageForTargetId({ cdpUrl });

    // Get all pages from the browser context
    const browser = page.context().browser();
    if (!browser) return [];

    const contexts = browser.contexts();
    const allPages = contexts.flatMap((c) => c.pages());

    const tabs: BrowserTab[] = [];
    for (const p of allPages) {
      try {
        const session = await p.context().newCDPSession(p);
        const info = (await session.send("Target.getTargetInfo")) as {
          targetInfo?: { targetId?: string };
        };
        await session.detach().catch(() => {});

        const targetId = String(info?.targetInfo?.targetId ?? "").trim();
        if (targetId) {
          tabs.push({
            targetId,
            title: await p.title().catch(() => ""),
            url: p.url(),
            wsUrl: undefined, // Not needed for Playwright
            type: "page",
          });
        }
      } catch {
        // Skip pages we can't inspect
      }
    }
    return tabs;
  } catch {
    return [];
  }
}

async function openTabViaPlaywright(
  cdpUrl: string,
  url: string,
): Promise<BrowserTab | null> {
  try {
    const mod = await import("./pw-session.js");

    // Get existing connection (pw-session handles caching and reconnection)
    const page = await mod.getPageForTargetId({ cdpUrl });
    const context = page.context();
    const browser = context.browser();
    
    if (!browser) {
      throw new Error("Could not get browser from context");
    }

    // Create a new page and navigate
    const newPage = await context.newPage();
    await newPage.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Get the target ID
    const session = await newPage.context().newCDPSession(newPage);
    const info = (await session.send("Target.getTargetInfo")) as {
      targetInfo?: { targetId?: string };
    };
    await session.detach().catch(() => {});

    const targetId = String(info?.targetInfo?.targetId ?? "").trim();
    if (!targetId) throw new Error("Failed to get targetId for new page");

    return {
      targetId,
      title: await newPage.title().catch(() => ""),
      url: newPage.url(),
      wsUrl: undefined,
      type: "page",
    };
  } catch (err) {
    console.error("[browser] openTabViaPlaywright failed:", err);
    return null;
  }
}

async function closeTabViaPlaywright(
  cdpUrl: string,
  targetId: string,
): Promise<boolean> {
  try {
    const mod = await import("./pw-session.js");
    const page = await mod.getPageForTargetId({ cdpUrl }).catch(() => null);
    if (!page) return false;

    const browser = page.context().browser();
    if (!browser) return false;

    // Find the page with matching targetId
    const contexts = browser.contexts();
    for (const ctx of contexts) {
      for (const p of ctx.pages()) {
        try {
          const session = await p.context().newCDPSession(p);
          const info = (await session.send("Target.getTargetInfo")) as {
            targetInfo?: { targetId?: string };
          };
          await session.detach().catch(() => {});

          const tid = String(info?.targetInfo?.targetId ?? "").trim();
          if (tid === targetId) {
            await p.close();
            return true;
          }
        } catch {
          // Skip
        }
      }
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Create a profile-scoped context for browser operations.
 */
function createProfileContext(
  opts: ContextOptions,
  profile: ResolvedBrowserProfile,
): ProfileContext {
  const state = () => {
    const current = opts.getState();
    if (!current) throw new Error("Browser server not started");
    return current;
  };

  const getProfileState = (): ProfileRuntimeState => {
    const current = state();
    let profileState = current.profiles.get(profile.name);
    if (!profileState) {
      profileState = { profile, running: null };
      current.profiles.set(profile.name, profileState);
    }
    return profileState;
  };

  const setProfileRunning = (running: ProfileRuntimeState["running"]) => {
    const profileState = getProfileState();
    profileState.running = running;
  };

  // Use Playwright for remote profiles, HTTP for local
  const isRemote = !profile.cdpIsLoopback;

  const listTabs = async (): Promise<BrowserTab[]> => {
    if (isRemote) {
      // Use Playwright's persistent connection for remote profiles
      return await listTabsViaPlaywright(profile.cdpUrl);
    }

    // Local profile - use HTTP
    const raw = await fetchJson<
      Array<{
        id?: string;
        title?: string;
        url?: string;
        webSocketDebuggerUrl?: string;
        type?: string;
      }>
    >(`${profile.cdpUrl.replace(/\/$/, "")}/json/list`);
    return raw
      .map((t) => ({
        targetId: t.id ?? "",
        title: t.title ?? "",
        url: t.url ?? "",
        wsUrl: normalizeWsUrl(t.webSocketDebuggerUrl, profile.cdpUrl),
        type: t.type,
      }))
      .filter((t) => Boolean(t.targetId));
  };

  const openTab = async (url: string): Promise<BrowserTab> => {
    if (isRemote) {
      // Use Playwright for remote profiles
      const tab = await openTabViaPlaywright(profile.cdpUrl, url);
      if (tab) return tab;
      throw new Error("Failed to open tab via Playwright");
    }

    // Local profile - use existing logic
    const createdViaCdp = await createTargetViaCdp({
      cdpUrl: profile.cdpUrl,
      url,
    })
      .then((r) => r.targetId)
      .catch(() => null);

    if (createdViaCdp) {
      const deadline = Date.now() + 2000;
      while (Date.now() < deadline) {
        const tabs = await listTabs().catch(() => [] as BrowserTab[]);
        const found = tabs.find((t) => t.targetId === createdViaCdp);
        if (found) return found;
        await new Promise((r) => setTimeout(r, 100));
      }
      return { targetId: createdViaCdp, title: "", url, type: "page" };
    }

    const encoded = encodeURIComponent(url);
    type CdpTarget = {
      id?: string;
      title?: string;
      url?: string;
      webSocketDebuggerUrl?: string;
      type?: string;
    };

    const base = profile.cdpUrl.replace(/\/$/, "");
    const endpoint = `${base}/json/new?${encoded}`;
    const created = await fetchJson<CdpTarget>(endpoint, 1500, {
      method: "PUT",
    }).catch(async (err) => {
      if (String(err).includes("HTTP 405")) {
        return await fetchJson<CdpTarget>(endpoint, 1500);
      }
      throw err;
    });

    if (!created.id) throw new Error("Failed to open tab (missing id)");
    return {
      targetId: created.id,
      title: created.title ?? "",
      url: created.url ?? url,
      wsUrl: normalizeWsUrl(created.webSocketDebuggerUrl, base),
      type: created.type,
    };
  };

  const isReachable = async (timeoutMs = 300) => {
    if (isRemote) {
      // For remote profiles, try to connect via Playwright
      try {
        const mod = await import("./pw-session.js");
        const page = await mod.getPageForTargetId({ cdpUrl: profile.cdpUrl });
        return Boolean(page);
      } catch {
        return false;
      }
    }
    const wsTimeout = Math.max(200, Math.min(2000, timeoutMs * 2));
    return await isChromeCdpReady(profile.cdpUrl, timeoutMs, wsTimeout);
  };

  const isHttpReachable = async (timeoutMs = 300) => {
    return await isChromeReachable(profile.cdpUrl, timeoutMs);
  };

  const attachRunning = (
    running: NonNullable<ProfileRuntimeState["running"]>,
  ) => {
    setProfileRunning(running);
    running.proc.on("exit", () => {
      // Guard against server teardown (e.g., SIGUSR1 restart)
      if (!opts.getState()) return;
      const profileState = getProfileState();
      if (profileState.running?.pid === running.pid) {
        setProfileRunning(null);
      }
    });
  };

  const ensureBrowserAvailable = async (): Promise<void> => {
    const current = state();
    const remoteCdp = !profile.cdpIsLoopback;
    const profileState = getProfileState();

    if (remoteCdp) {
      // For remote profiles, just verify we can connect via Playwright
      try {
        const mod = await import("./pw-session.js");
        await mod.getPageForTargetId({ cdpUrl: profile.cdpUrl });
        return;
      } catch (err) {
        throw new Error(
          `Remote CDP for profile "${profile.name}" is not reachable at ${profile.cdpUrl}. Error: ${err}`,
        );
      }
    }

    const httpReachable = await isHttpReachable();

    if (!httpReachable) {
      if (
        (current.resolved.attachOnly || remoteCdp) &&
        opts.onEnsureAttachTarget
      ) {
        await opts.onEnsureAttachTarget(profile);
        if (await isHttpReachable(1200)) return;
      }
      if (current.resolved.attachOnly || remoteCdp) {
        throw new Error(
          remoteCdp
            ? `Remote CDP for profile "${profile.name}" is not reachable at ${profile.cdpUrl}.`
            : `Browser attachOnly is enabled and profile "${profile.name}" is not running.`,
        );
      }
      const launched = await launchClawdChrome(current.resolved, profile);
      attachRunning(launched);
      return;
    }

    // Port is reachable - check if we own it
    if (await isReachable()) return;

    // HTTP responds but WebSocket fails - port in use by something else
    if (!profileState.running) {
      throw new Error(
        `Port ${profile.cdpPort} is in use for profile "${profile.name}" but not by clawdbot. ` +
          `Run action=reset-profile profile=${profile.name} to kill the process.`,
      );
    }

    // We own it but WebSocket failed - restart
    if (current.resolved.attachOnly || remoteCdp) {
      if (opts.onEnsureAttachTarget) {
        await opts.onEnsureAttachTarget(profile);
        if (await isReachable(1200)) return;
      }
      throw new Error(
        remoteCdp
          ? `Remote CDP websocket for profile "${profile.name}" is not reachable.`
          : `Browser attachOnly is enabled and CDP websocket for profile "${profile.name}" is not reachable.`,
      );
    }

    await stopClawdChrome(profileState.running);
    setProfileRunning(null);

    const relaunched = await launchClawdChrome(current.resolved, profile);
    attachRunning(relaunched);

    if (!(await isReachable(600))) {
      throw new Error(
        `Chrome CDP websocket for profile "${profile.name}" is not reachable after restart.`,
      );
    }
  };

  const ensureTabAvailable = async (targetId?: string): Promise<BrowserTab> => {
    await ensureBrowserAvailable();
    const tabs1 = await listTabs();
    if (tabs1.length === 0) {
      await openTab("about:blank");
    }

    const tabs = await listTabs();
    const chosen = targetId
      ? (() => {
          const resolved = resolveTargetIdFromTabs(targetId, tabs);
          if (!resolved.ok) {
            if (resolved.reason === "ambiguous") return "AMBIGUOUS" as const;
            return null;
          }
          return tabs.find((t) => t.targetId === resolved.targetId) ?? null;
        })()
      : (tabs.at(0) ?? null);

    if (chosen === "AMBIGUOUS") {
      throw new Error("ambiguous target id prefix");
    }
    if (!chosen) throw new Error("tab not found");
    return chosen;
  };

  const focusTab = async (targetId: string): Promise<void> => {
    if (isRemote) {
      // For remote, focusing is not really applicable in headless mode
      // Just verify the tab exists
      const tabs = await listTabs();
      const found = tabs.find((t) => t.targetId === targetId);
      if (!found) throw new Error("tab not found");
      return;
    }

    const base = profile.cdpUrl.replace(/\/$/, "");
    const tabs = await listTabs();
    const resolved = resolveTargetIdFromTabs(targetId, tabs);
    if (!resolved.ok) {
      if (resolved.reason === "ambiguous") {
        throw new Error("ambiguous target id prefix");
      }
      throw new Error("tab not found");
    }
    await fetchOk(`${base}/json/activate/${resolved.targetId}`);
  };

  const closeTab = async (targetId: string): Promise<void> => {
    if (isRemote) {
      const success = await closeTabViaPlaywright(profile.cdpUrl, targetId);
      if (!success) throw new Error("tab not found");
      return;
    }

    const base = profile.cdpUrl.replace(/\/$/, "");
    const tabs = await listTabs();
    const resolved = resolveTargetIdFromTabs(targetId, tabs);
    if (!resolved.ok) {
      if (resolved.reason === "ambiguous") {
        throw new Error("ambiguous target id prefix");
      }
      throw new Error("tab not found");
    }
    await fetchOk(`${base}/json/close/${resolved.targetId}`);
  };

  const stopRunningBrowser = async (): Promise<{ stopped: boolean }> => {
    if (isRemote) {
      // For remote profiles, close the Playwright connection
      try {
        const mod = await import("./pw-ai.js");
        await mod.closePlaywrightBrowserConnection();
        return { stopped: true };
      } catch {
        return { stopped: false };
      }
    }

    const profileState = getProfileState();
    if (!profileState.running) return { stopped: false };
    await stopClawdChrome(profileState.running);
    setProfileRunning(null);
    return { stopped: true };
  };

  const resetProfile = async () => {
    if (!profile.cdpIsLoopback) {
      // For remote profiles, just close the connection
      try {
        const mod = await import("./pw-ai.js");
        await mod.closePlaywrightBrowserConnection();
      } catch {
        // ignore
      }
      return { moved: false, from: profile.cdpUrl };
    }

    const userDataDir = resolveClawdUserDataDir(profile.name);
    const profileState = getProfileState();

    const httpReachable = await isHttpReachable(300);
    if (httpReachable && !profileState.running) {
      // Port in use but not by us - kill it
      try {
        const mod = await import("./pw-ai.js");
        await mod.closePlaywrightBrowserConnection();
      } catch {
        // ignore
      }
    }

    if (profileState.running) {
      await stopRunningBrowser();
    }

    try {
      const mod = await import("./pw-ai.js");
      await mod.closePlaywrightBrowserConnection();
    } catch {
      // ignore
    }

    if (!fs.existsSync(userDataDir)) {
      return { moved: false, from: userDataDir };
    }

    const moved = await movePathToTrash(userDataDir);
    return { moved: true, from: userDataDir, to: moved };
  };

  return {
    profile,
    ensureBrowserAvailable,
    ensureTabAvailable,
    isHttpReachable,
    isReachable,
    listTabs,
    openTab,
    focusTab,
    closeTab,
    stopRunningBrowser,
    resetProfile,
  };
}

export function createBrowserRouteContext(
  opts: ContextOptions,
): BrowserRouteContext {
  const state = () => {
    const current = opts.getState();
    if (!current) throw new Error("Browser server not started");
    return current;
  };

  const forProfile = (profileName?: string): ProfileContext => {
    const current = state();
    const name = profileName ?? current.resolved.defaultProfile;
    const profile = resolveProfile(current.resolved, name);
    if (!profile) {
      const available = Object.keys(current.resolved.profiles).join(", ");
      throw new Error(
        `Profile "${name}" not found. Available profiles: ${available || "(none)"}`,
      );
    }
    return createProfileContext(opts, profile);
  };

  const listProfiles = async (): Promise<ProfileStatus[]> => {
    const current = state();
    const result: ProfileStatus[] = [];

    for (const name of Object.keys(current.resolved.profiles)) {
      const profileState = current.profiles.get(name);
      const profile = resolveProfile(current.resolved, name);
      if (!profile) continue;

      let tabCount = 0;
      let running = false;

      if (profileState?.running) {
        running = true;
        try {
          const ctx = createProfileContext(opts, profile);
          const tabs = await ctx.listTabs();
          tabCount = tabs.filter((t) => t.type === "page").length;
        } catch {
          // Browser might not be responsive
        }
      } else {
        // Check if something is listening on the port
        try {
          const ctx = createProfileContext(opts, profile);
          const reachable = await ctx.isReachable(300);
          if (reachable) {
            running = true;
            const tabs = await ctx.listTabs().catch(() => []);
            tabCount = tabs.filter((t) => t.type === "page").length;
          }
        } catch {
          // Not reachable
        }
      }

      result.push({
        name,
        cdpPort: profile.cdpPort,
        cdpUrl: profile.cdpUrl,
        color: profile.color,
        running,
        tabCount,
        isDefault: name === current.resolved.defaultProfile,
        isRemote: !profile.cdpIsLoopback,
      });
    }

    return result;
  };

  // Create default profile context for backward compatibility
  const getDefaultContext = () => forProfile();

  const mapTabError = (err: unknown) => {
    const msg = String(err);
    if (msg.includes("ambiguous target id prefix")) {
      return { status: 409, message: "ambiguous target id prefix" };
    }
    if (msg.includes("tab not found")) {
      return { status: 404, message: "tab not found" };
    }
    if (msg.includes("not found")) {
      return { status: 404, message: msg };
    }
    return null;
  };

  return {
    state,
    forProfile,
    listProfiles,
    // Legacy methods delegate to default profile
    ensureBrowserAvailable: () => getDefaultContext().ensureBrowserAvailable(),
    ensureTabAvailable: (targetId) =>
      getDefaultContext().ensureTabAvailable(targetId),
    isHttpReachable: (timeoutMs) =>
      getDefaultContext().isHttpReachable(timeoutMs),
    isReachable: (timeoutMs) => getDefaultContext().isReachable(timeoutMs),
    listTabs: () => getDefaultContext().listTabs(),
    openTab: (url) => getDefaultContext().openTab(url),
    focusTab: (targetId) => getDefaultContext().focusTab(targetId),
    closeTab: (targetId) => getDefaultContext().closeTab(targetId),
    stopRunningBrowser: () => getDefaultContext().stopRunningBrowser(),
    resetProfile: () => getDefaultContext().resetProfile(),
    mapTabError,
  };
}
