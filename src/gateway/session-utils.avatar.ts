/**
 * Avatar resolution utilities for session identity display.
 * Handles file-based avatars, data URIs, and HTTP URLs.
 */

import fs from "node:fs";
import path from "node:path";

import { resolveAgentWorkspaceDir } from "../agents/agent-scope.js";
import type { MoltbotConfig } from "../config/config.js";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const AVATAR_DATA_RE = /^data:/i;
const AVATAR_HTTP_RE = /^https?:\/\//i;
const AVATAR_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const WINDOWS_ABS_RE = /^[a-zA-Z]:[\\/]/;

const AVATAR_MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
};

export function resolveAvatarMime(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return AVATAR_MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function isWorkspaceRelativePath(value: string): boolean {
  if (!value) return false;
  if (value.startsWith("~")) return false;
  if (AVATAR_SCHEME_RE.test(value) && !WINDOWS_ABS_RE.test(value)) return false;
  return true;
}

/**
 * Resolve an avatar path to a displayable URL.
 * Supports: data URIs, HTTP URLs, and workspace-relative file paths.
 * File paths are read and converted to base64 data URIs.
 */
export function resolveIdentityAvatarUrl(
  cfg: MoltbotConfig,
  agentId: string,
  avatar: string | undefined,
): string | undefined {
  if (!avatar) return undefined;
  const trimmed = avatar.trim();
  if (!trimmed) return undefined;

  // Already a data URI or HTTP URL - return as-is
  if (AVATAR_DATA_RE.test(trimmed) || AVATAR_HTTP_RE.test(trimmed)) return trimmed;

  // Must be a workspace-relative path
  if (!isWorkspaceRelativePath(trimmed)) return undefined;

  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);
  const workspaceRoot = path.resolve(workspaceDir);
  const resolved = path.resolve(workspaceRoot, trimmed);

  // Security: ensure path doesn't escape workspace
  const relative = path.relative(workspaceRoot, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return undefined;

  try {
    const stat = fs.statSync(resolved);
    if (!stat.isFile() || stat.size > AVATAR_MAX_BYTES) return undefined;
    const buffer = fs.readFileSync(resolved);
    const mime = resolveAvatarMime(resolved);
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch {
    return undefined;
  }
}
