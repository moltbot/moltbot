import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

function normalizeUnicodeSpaces(str: string): string {
  return str.replace(UNICODE_SPACES, " ");
}

function expandPath(filePath: string): string {
  const normalized = normalizeUnicodeSpaces(filePath);
  if (normalized === "~") {
    return os.homedir();
  }
  if (normalized.startsWith("~/")) {
    return os.homedir() + normalized.slice(1);
  }
  return normalized;
}

function resolveToCwd(filePath: string, cwd: string): string {
  const expanded = expandPath(filePath);
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  return path.resolve(cwd, expanded);
}

export function resolvePathFromCwd(filePath: string, cwd: string): string {
  return resolveToCwd(filePath, cwd);
}

export function resolveSandboxPath(params: { filePath: string; cwd: string; root: string }): {
  resolved: string;
  relative: string;
} {
  const resolved = resolveToCwd(params.filePath, params.cwd);
  const rootResolved = path.resolve(params.root);
  const relative = path.relative(rootResolved, resolved);
  if (!relative || relative === "") {
    return { resolved, relative: "" };
  }
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Path escapes sandbox root (${shortPath(rootResolved)}): ${params.filePath}`);
  }
  return { resolved, relative };
}

export async function assertSandboxPath(params: { filePath: string; cwd: string; root: string }) {
  const resolved = resolveSandboxPath(params);
  await assertNoSymlink(resolved.relative, path.resolve(params.root));
  return resolved;
}

export async function assertSandboxPathInRoots(params: {
  filePath: string;
  cwd: string;
  roots: string[];
}) {
  const roots = normalizeAllowRoots(params.roots, params.cwd);
  if (roots.length === 0) {
    throw new Error("No allowPaths roots configured");
  }
  for (const root of roots) {
    try {
      const resolved = resolveSandboxPath({ filePath: params.filePath, cwd: params.cwd, root });
      await assertNoSymlink(resolved.relative, path.resolve(root));
      return { ...resolved, root: path.resolve(root) };
    } catch (err) {
      if (isSandboxEscapeError(err)) {
        continue;
      }
      throw err;
    }
  }
  const rootList = roots.map((root) => shortPath(path.resolve(root))).join(", ");
  throw new Error(`Path is outside allowed roots (${rootList}): ${params.filePath}`);
}

// NOTE: TOCTOU risk: this check happens before tool I/O, so a local attacker could
// swap a directory for a symlink between this check and the operation. We accept
// this given the threat model (no concurrent local attacker with write access to
// allowed dirs). A proper fix would require O_NOFOLLOW/openat at the fd level.
async function assertNoSymlink(relative: string, root: string) {
  if (!relative) {
    return;
  }
  const parts = relative.split(path.sep).filter(Boolean);
  let current = root;
  for (const part of parts) {
    current = path.join(current, part);
    try {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) {
        throw new Error(`Symlink not allowed in sandbox path: ${current}`);
      }
    } catch (err) {
      const anyErr = err as { code?: string };
      if (anyErr.code === "ENOENT") {
        return;
      }
      throw err;
    }
  }
}

export function normalizeAllowRoots(roots: string[], cwd: string) {
  const normalized = roots
    .map((root) => (typeof root === "string" ? root.trim() : ""))
    .filter(Boolean)
    .map((root) => resolveToCwd(root, cwd));
  return Array.from(new Set(normalized));
}

function isSandboxEscapeError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("message" in err)) {
    return false;
  }
  const rawMessage = (err as { message?: unknown }).message;
  const message = typeof rawMessage === "string" ? rawMessage : "";
  return message.startsWith("Path escapes sandbox root");
}

function shortPath(value: string) {
  if (value.startsWith(os.homedir())) {
    return `~${value.slice(os.homedir().length)}`;
  }
  return value;
}
