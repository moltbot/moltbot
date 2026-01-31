import path from "node:path";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";
import { resolveStateDir } from "../config/paths.js";

export function deriveCopilotApiBaseUrlFromToken(token: string): string {
  const m = /proxy-ep=([^;]+)/.exec(token || "");
  if (!m) return "https://api.github.com";
  let ep = m[1];
  // ensure we have a URL-like string
  let proto = "https:";
  let host = ep;
  try {
    if (/^https?:\/\//i.test(ep)) {
      const u = new URL(ep);
      proto = u.protocol;
      host = u.hostname;
    }
  } catch {
    // leave as-is
  }
  const parts = host.split(".").filter(Boolean);
  if (parts.length === 0) return `${proto}//${host}`;
  // replace first label with `api`
  parts[0] = "api";
  return `${proto}//${parts.join(".")}`;
}

type ResolveOptions = { githubToken: string; fetchImpl: typeof fetch };

interface CachedToken {
  token: string;
  expiresAt: number;
  updatedAt?: number;
}

function isCachedToken(value: unknown): value is CachedToken {
  return (
    typeof value === "object" &&
    value !== null &&
    "token" in value &&
    typeof (value as CachedToken).token === "string" &&
    "expiresAt" in value &&
    typeof (value as CachedToken).expiresAt === "number"
  );
}

export async function resolveCopilotApiToken(opts: ResolveOptions) {
  const stateDir = resolveStateDir();
  const cachePath = path.join(stateDir, "github-copilot-token.json");
  const now = Date.now();

  try {
    const cached = loadJsonFile(cachePath);
    if (isCachedToken(cached) && cached.expiresAt > now) {
      return {
        token: cached.token,
        baseUrl: deriveCopilotApiBaseUrlFromToken(cached.token),
        source: `cache:${cached.updatedAt ?? "unknown"}`,
      };
    }
  } catch {
    // ignore cache read errors
  }

  const resp = await opts.fetchImpl("https://api.github.com/copilot/api_tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${opts.githubToken}`, Accept: "application/json" },
  });
  if (!resp || !resp.ok) {
    throw new Error(`failed to fetch copilot token: ${resp?.status}`);
  }
  const body = await resp.json();
  const token = String(body.token || "");
  const expires_at = Number(
    body.expires_at || body.expiresAt || Math.floor(Date.now() / 1000) + 3600,
  );
  const expiresAt = expires_at * 1000;

  try {
    saveJsonFile(cachePath, { token, expiresAt, updatedAt: Date.now() });
  } catch {
    // ignore save errors
  }

  return {
    token,
    baseUrl: deriveCopilotApiBaseUrlFromToken(token),
    source: "fetched",
  };
}

export default { deriveCopilotApiBaseUrlFromToken, resolveCopilotApiToken };
