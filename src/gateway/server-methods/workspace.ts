/**
 * Workspace file operations for the Command Center dashboard
 * Allows reading and writing workspace files (SOUL.md, AGENTS.md, etc.)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../../agents/agent-scope.js";
import { loadConfig } from "../../config/config.js";
import { ErrorCodes, errorShape } from "../protocol/index.js";
import type { GatewayRequestHandlers } from "./types.js";

// Allowed workspace files for security (prevent arbitrary file access)
const ALLOWED_FILES = new Set([
  "AGENTS.md",
  "SOUL.md",
  "USER.md",
  "IDENTITY.md",
  "TOOLS.md",
  "HEARTBEAT.md",
  "BOOT.md",
  "MEMORY.md",
  "BOOTSTRAP.md",
]);

// Allowed directories within workspace
const ALLOWED_DIRS = new Set(["memory"]);

/**
 * Validate and resolve file path within workspace
 * Returns null if path is invalid or not allowed
 */
function resolveWorkspaceFilePath(workspacePath: string, filePath: string): string | null {
  // Normalize and check for path traversal
  const normalizedPath = path.normalize(filePath);
  if (normalizedPath.startsWith("..") || path.isAbsolute(normalizedPath)) {
    return null;
  }

  // Split into directory and filename
  const dir = path.dirname(normalizedPath);
  const filename = path.basename(normalizedPath);

  // Root level files must be in ALLOWED_FILES
  if (dir === ".") {
    if (!ALLOWED_FILES.has(filename)) {
      return null;
    }
    return path.join(workspacePath, filename);
  }

  // Subdirectory files must be in ALLOWED_DIRS
  const topDir = normalizedPath.split(path.sep)[0];
  if (!ALLOWED_DIRS.has(topDir)) {
    return null;
  }

  // Only allow .md files in subdirectories
  if (!filename.endsWith(".md")) {
    return null;
  }

  return path.join(workspacePath, normalizedPath);
}

/**
 * Get workspace path for an agent
 */
function getWorkspacePath(agentId: string | undefined): string | null {
  const config = loadConfig();
  const resolvedAgentId = agentId || resolveDefaultAgentId(config) || "main";
  return resolveAgentWorkspaceDir(config, resolvedAgentId);
}

export const workspaceHandlers: GatewayRequestHandlers = {
  /**
   * Read a workspace file
   * @param agentId - Optional agent ID (defaults to default agent)
   * @param filePath - File path relative to workspace (e.g., "SOUL.md" or "memory/2024-01-30.md")
   */
  "workspace.file.read": async ({ params, respond }) => {
    const p = params as { agentId?: unknown; filePath?: unknown };

    if (typeof p.filePath !== "string" || !p.filePath.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "filePath is required"));
      return;
    }

    const agentId = typeof p.agentId === "string" ? p.agentId : undefined;
    const filePath = p.filePath.trim();

    const workspacePath = await getWorkspacePath(agentId);
    if (!workspacePath) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Workspace not found for agent: ${agentId || "default"}`,
        ),
      );
      return;
    }

    const resolvedPath = resolveWorkspaceFilePath(workspacePath, filePath);
    if (!resolvedPath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `File not allowed: ${filePath}`),
      );
      return;
    }

    try {
      if (!fs.existsSync(resolvedPath)) {
        respond(true, {
          exists: false,
          filePath,
          workspacePath,
          content: null,
        });
        return;
      }

      const content = fs.readFileSync(resolvedPath, "utf-8");
      const stats = fs.statSync(resolvedPath);

      respond(true, {
        exists: true,
        filePath,
        workspacePath,
        content,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /**
   * Write a workspace file
   * @param agentId - Optional agent ID (defaults to default agent)
   * @param filePath - File path relative to workspace (e.g., "SOUL.md" or "memory/2024-01-30.md")
   * @param content - File content to write
   */
  "workspace.file.write": async ({ params, respond }) => {
    const p = params as { agentId?: unknown; filePath?: unknown; content?: unknown };

    if (typeof p.filePath !== "string" || !p.filePath.trim()) {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "filePath is required"));
      return;
    }

    if (typeof p.content !== "string") {
      respond(false, undefined, errorShape(ErrorCodes.INVALID_REQUEST, "content is required"));
      return;
    }

    const agentId = typeof p.agentId === "string" ? p.agentId : undefined;
    const filePath = p.filePath.trim();
    const content = p.content;

    const workspacePath = await getWorkspacePath(agentId);
    if (!workspacePath) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Workspace not found for agent: ${agentId || "default"}`,
        ),
      );
      return;
    }

    const resolvedPath = resolveWorkspaceFilePath(workspacePath, filePath);
    if (!resolvedPath) {
      respond(
        false,
        undefined,
        errorShape(ErrorCodes.INVALID_REQUEST, `File not allowed: ${filePath}`),
      );
      return;
    }

    try {
      // Ensure directory exists
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(resolvedPath, content, "utf-8");
      const stats = fs.statSync(resolvedPath);

      respond(true, {
        success: true,
        filePath,
        workspacePath,
        size: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to write file: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },

  /**
   * List workspace files
   * @param agentId - Optional agent ID (defaults to default agent)
   */
  "workspace.file.list": async ({ params, respond }) => {
    const p = params as { agentId?: unknown };
    const agentId = typeof p.agentId === "string" ? p.agentId : undefined;

    const workspacePath = await getWorkspacePath(agentId);
    if (!workspacePath) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.INVALID_REQUEST,
          `Workspace not found for agent: ${agentId || "default"}`,
        ),
      );
      return;
    }

    try {
      const files: Array<{
        name: string;
        path: string;
        exists: boolean;
        size?: number;
        modifiedAt?: string;
      }> = [];

      // Check standard workspace files
      for (const filename of ALLOWED_FILES) {
        const filePath = path.join(workspacePath, filename);
        const exists = fs.existsSync(filePath);

        if (exists) {
          const stats = fs.statSync(filePath);
          files.push({
            name: filename,
            path: filename,
            exists: true,
            size: stats.size,
            modifiedAt: stats.mtime.toISOString(),
          });
        } else {
          files.push({
            name: filename,
            path: filename,
            exists: false,
          });
        }
      }

      // Check memory directory
      const memoryDir = path.join(workspacePath, "memory");
      if (fs.existsSync(memoryDir)) {
        const memoryFiles = fs
          .readdirSync(memoryDir)
          .filter((f) => f.endsWith(".md"))
          .sort()
          .reverse()
          .slice(0, 30); // Limit to recent 30 files

        for (const filename of memoryFiles) {
          const filePath = path.join(memoryDir, filename);
          const stats = fs.statSync(filePath);
          files.push({
            name: filename,
            path: `memory/${filename}`,
            exists: true,
            size: stats.size,
            modifiedAt: stats.mtime.toISOString(),
          });
        }
      }

      respond(true, {
        workspacePath,
        agentId: agentId || "default",
        files,
      });
    } catch (err) {
      respond(
        false,
        undefined,
        errorShape(
          ErrorCodes.UNAVAILABLE,
          `Failed to list files: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }
  },
};
