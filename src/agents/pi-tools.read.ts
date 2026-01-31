import type { AgentToolResult } from "@mariozechner/pi-agent-core";
import { createEditTool, createReadTool, createWriteTool } from "@mariozechner/pi-coding-agent";
import fs from "node:fs/promises";
import path from "node:path";

import type { FileToolSecurity } from "../config/types.tools.js";
import { detectMime } from "../media/mime.js";
import type { AnyAgentTool } from "./pi-tools.types.js";
import {
  assertSandboxPath,
  assertSandboxPathInRoots,
  resolvePathFromCwd,
} from "./sandbox-paths.js";
import { sanitizeToolResultImages } from "./tool-images.js";

// NOTE(steipete): Upstream read now does file-magic MIME detection; we keep the wrapper
// to normalize payloads and sanitize oversized images before they hit providers.
type ToolContentBlock = AgentToolResult<unknown>["content"][number];
type ImageContentBlock = Extract<ToolContentBlock, { type: "image" }>;
type TextContentBlock = Extract<ToolContentBlock, { type: "text" }>;

async function sniffMimeFromBase64(base64: string): Promise<string | undefined> {
  const trimmed = base64.trim();
  if (!trimmed) {
    return undefined;
  }

  const take = Math.min(256, trimmed.length);
  const sliceLen = take - (take % 4);
  if (sliceLen < 8) {
    return undefined;
  }

  try {
    const head = Buffer.from(trimmed.slice(0, sliceLen), "base64");
    return await detectMime({ buffer: head });
  } catch {
    return undefined;
  }
}

function rewriteReadImageHeader(text: string, mimeType: string): string {
  // pi-coding-agent uses: "Read image file [image/png]"
  if (text.startsWith("Read image file [") && text.endsWith("]")) {
    return `Read image file [${mimeType}]`;
  }
  return text;
}

async function normalizeReadImageResult(
  result: AgentToolResult<unknown>,
  filePath: string,
): Promise<AgentToolResult<unknown>> {
  const content = Array.isArray(result.content) ? result.content : [];

  const image = content.find(
    (b): b is ImageContentBlock =>
      !!b &&
      typeof b === "object" &&
      (b as { type?: unknown }).type === "image" &&
      typeof (b as { data?: unknown }).data === "string" &&
      typeof (b as { mimeType?: unknown }).mimeType === "string",
  );
  if (!image) {
    return result;
  }

  if (!image.data.trim()) {
    throw new Error(`read: image payload is empty (${filePath})`);
  }

  const sniffed = await sniffMimeFromBase64(image.data);
  if (!sniffed) {
    return result;
  }

  if (!sniffed.startsWith("image/")) {
    throw new Error(
      `read: file looks like ${sniffed} but was treated as ${image.mimeType} (${filePath})`,
    );
  }

  if (sniffed === image.mimeType) {
    return result;
  }

  const nextContent = content.map((block) => {
    if (block && typeof block === "object" && (block as { type?: unknown }).type === "image") {
      const b = block as ImageContentBlock & { mimeType: string };
      return { ...b, mimeType: sniffed } satisfies ImageContentBlock;
    }
    if (
      block &&
      typeof block === "object" &&
      (block as { type?: unknown }).type === "text" &&
      typeof (block as { text?: unknown }).text === "string"
    ) {
      const b = block as TextContentBlock & { text: string };
      return {
        ...b,
        text: rewriteReadImageHeader(b.text, sniffed),
      } satisfies TextContentBlock;
    }
    return block;
  });

  return { ...result, content: nextContent };
}

type RequiredParamGroup = {
  keys: readonly string[];
  allowEmpty?: boolean;
  label?: string;
};

export const CLAUDE_PARAM_GROUPS = {
  read: [{ keys: ["path", "file_path"], label: "path (path or file_path)" }],
  write: [{ keys: ["path", "file_path"], label: "path (path or file_path)" }],
  edit: [
    { keys: ["path", "file_path"], label: "path (path or file_path)" },
    {
      keys: ["oldText", "old_string"],
      label: "oldText (oldText or old_string)",
    },
    {
      keys: ["newText", "new_string"],
      label: "newText (newText or new_string)",
    },
  ],
} as const;

// Normalize tool parameters from Claude Code conventions to pi-coding-agent conventions.
// Claude Code uses file_path/old_string/new_string while pi-coding-agent uses path/oldText/newText.
// This prevents models trained on Claude Code from getting stuck in tool-call loops.
export function normalizeToolParams(params: unknown): Record<string, unknown> | undefined {
  if (!params || typeof params !== "object") {
    return undefined;
  }
  const record = params as Record<string, unknown>;
  const normalized = { ...record };
  // file_path → path (read, write, edit)
  if ("file_path" in normalized && !("path" in normalized)) {
    normalized.path = normalized.file_path;
    delete normalized.file_path;
  }
  // old_string → oldText (edit)
  if ("old_string" in normalized && !("oldText" in normalized)) {
    normalized.oldText = normalized.old_string;
    delete normalized.old_string;
  }
  // new_string → newText (edit)
  if ("new_string" in normalized && !("newText" in normalized)) {
    normalized.newText = normalized.new_string;
    delete normalized.new_string;
  }
  return normalized;
}

export function patchToolSchemaForClaudeCompatibility(tool: AnyAgentTool): AnyAgentTool {
  const schema =
    tool.parameters && typeof tool.parameters === "object"
      ? (tool.parameters as Record<string, unknown>)
      : undefined;

  if (!schema || !schema.properties || typeof schema.properties !== "object") {
    return tool;
  }

  const properties = { ...(schema.properties as Record<string, unknown>) };
  const required = Array.isArray(schema.required)
    ? schema.required.filter((key): key is string => typeof key === "string")
    : [];
  let changed = false;

  const aliasPairs: Array<{ original: string; alias: string }> = [
    { original: "path", alias: "file_path" },
    { original: "oldText", alias: "old_string" },
    { original: "newText", alias: "new_string" },
  ];

  for (const { original, alias } of aliasPairs) {
    if (!(original in properties)) {
      continue;
    }
    if (!(alias in properties)) {
      properties[alias] = properties[original];
      changed = true;
    }
    const idx = required.indexOf(original);
    if (idx !== -1) {
      required.splice(idx, 1);
      changed = true;
    }
  }

  if (!changed) {
    return tool;
  }

  return {
    ...tool,
    parameters: {
      ...schema,
      properties,
      ...(required.length > 0 ? { required } : {}),
    },
  };
}

export function assertRequiredParams(
  record: Record<string, unknown> | undefined,
  groups: readonly RequiredParamGroup[],
  toolName: string,
): void {
  if (!record || typeof record !== "object") {
    throw new Error(`Missing parameters for ${toolName}`);
  }

  for (const group of groups) {
    const satisfied = group.keys.some((key) => {
      if (!(key in record)) {
        return false;
      }
      const value = record[key];
      if (typeof value !== "string") {
        return false;
      }
      if (group.allowEmpty) {
        return true;
      }
      return value.trim().length > 0;
    });

    if (!satisfied) {
      const label = group.label ?? group.keys.join(" or ");
      throw new Error(`Missing required parameter: ${label}`);
    }
  }
}

// Generic wrapper to normalize parameters for any tool
export function wrapToolParamNormalization(
  tool: AnyAgentTool,
  requiredParamGroups?: readonly RequiredParamGroup[],
): AnyAgentTool {
  const patched = patchToolSchemaForClaudeCompatibility(tool);
  return {
    ...patched,
    execute: async (toolCallId, params, signal, onUpdate) => {
      const normalized = normalizeToolParams(params);
      const record =
        normalized ??
        (params && typeof params === "object" ? (params as Record<string, unknown>) : undefined);
      if (requiredParamGroups?.length) {
        assertRequiredParams(record, requiredParamGroups, tool.name);
      }
      return tool.execute(toolCallId, normalized ?? params, signal, onUpdate);
    },
  };
}

function wrapSandboxPathGuard(tool: AnyAgentTool, root: string): AnyAgentTool {
  return {
    ...tool,
    execute: async (toolCallId, args, signal, onUpdate) => {
      const normalized = normalizeToolParams(args);
      const record =
        normalized ??
        (args && typeof args === "object" ? (args as Record<string, unknown>) : undefined);
      const filePath = record?.path;
      if (typeof filePath === "string" && filePath.trim()) {
        await assertSandboxPath({ filePath, cwd: root, root });
      }
      return tool.execute(toolCallId, normalized ?? args, signal, onUpdate);
    },
  };
}

export function wrapAllowPathsGuard(
  tool: AnyAgentTool,
  params: { allowPaths?: string[]; cwd: string; security?: FileToolSecurity },
): AnyAgentTool {
  const security = params.security ?? "full";
  if (security !== "allowlist") {
    return tool;
  }
  const allowPaths = Array.isArray(params.allowPaths)
    ? params.allowPaths.map((entry) => entry.trim()).filter(Boolean)
    : [];
  return {
    ...tool,
    execute: async (toolCallId, args, signal, onUpdate) => {
      const normalized = normalizeToolParams(args);
      const record =
        normalized ??
        (args && typeof args === "object" ? (args as Record<string, unknown>) : undefined);
      const filePath = record?.path;
      if (typeof filePath !== "string" || !filePath.trim()) {
        throw new Error("Path is required when allowPaths security is enabled.");
      }
      await assertSandboxPathInRoots({
        filePath,
        cwd: params.cwd,
        roots: allowPaths,
      });
      return tool.execute(toolCallId, normalized ?? args, signal, onUpdate);
    },
  };
}

async function resolveRealPathFallback(filePath: string): Promise<string> {
  try {
    return await fs.realpath(filePath);
  } catch (err) {
    const anyErr = err as { code?: string };
    if (anyErr.code !== "ENOENT") {
      throw err;
    }
  }
  const parent = path.dirname(filePath);
  try {
    const realParent = await fs.realpath(parent);
    return path.join(realParent, path.basename(filePath));
  } catch (err) {
    const anyErr = err as { code?: string };
    if (anyErr.code !== "ENOENT") {
      throw err;
    }
  }
  return filePath;
}

async function resolveDenyEntry(entry: string, cwd: string) {
  const resolved = resolvePathFromCwd(entry, cwd);
  let isDirectory = false;
  let exists = false;
  try {
    const stat = await fs.stat(resolved);
    isDirectory = stat.isDirectory();
    exists = true;
  } catch (err) {
    const anyErr = err as { code?: string };
    if (anyErr.code !== "ENOENT") {
      throw err;
    }
  }
  const real = exists ? await resolveRealPathFallback(resolved) : resolved;
  return { resolved, real, isDirectory };
}

function isWithinPath(candidate: string, root: string) {
  const relative = path.relative(root, candidate);
  return !relative || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export function wrapDenyPathsGuard(
  tool: AnyAgentTool,
  params: { denyPaths?: string[]; cwd: string },
): AnyAgentTool {
  const denyPaths = Array.isArray(params.denyPaths)
    ? params.denyPaths.map((entry) => entry.trim()).filter(Boolean)
    : [];
  if (denyPaths.length === 0) {
    return tool;
  }
  const resolvedDenyEntriesPromise = Promise.all(
    denyPaths.map((entry) => resolveDenyEntry(entry, params.cwd)),
  );
  return {
    ...tool,
    execute: async (toolCallId, args, signal, onUpdate) => {
      const normalized = normalizeToolParams(args);
      const record =
        normalized ??
        (args && typeof args === "object" ? (args as Record<string, unknown>) : undefined);
      const filePath = record?.path;
      if (typeof filePath === "string" && filePath.trim()) {
        const resolvedPath = resolvePathFromCwd(filePath, params.cwd);
        const realPath = await resolveRealPathFallback(resolvedPath);
        const resolvedEntries = await resolvedDenyEntriesPromise;
        for (const resolvedEntry of resolvedEntries) {
          if (resolvedEntry.isDirectory) {
            if (isWithinPath(realPath, resolvedEntry.real)) {
              throw new Error(`Path is blocked by denyPaths: ${filePath}`);
            }
          } else if (realPath === resolvedEntry.real) {
            throw new Error(`Path is blocked by denyPaths: ${filePath}`);
          }
        }
      }
      return tool.execute(toolCallId, normalized ?? args, signal, onUpdate);
    },
  };
}

export function createSandboxedReadTool(
  root: string,
  allowPaths?: string[],
  denyPaths?: string[],
  security?: FileToolSecurity,
) {
  const base = createReadTool(root) as unknown as AnyAgentTool;
  const guarded = wrapAllowPathsGuard(
    wrapDenyPathsGuard(createOpenClawReadTool(base), {
      denyPaths,
      cwd: root,
    }),
    {
      allowPaths,
      cwd: root,
      security,
    },
  );
  return wrapSandboxPathGuard(guarded, root);
}

export function createSandboxedWriteTool(
  root: string,
  allowPaths?: string[],
  denyPaths?: string[],
  security?: FileToolSecurity,
) {
  const base = createWriteTool(root) as unknown as AnyAgentTool;
  const guarded = wrapAllowPathsGuard(
    wrapDenyPathsGuard(wrapToolParamNormalization(base, CLAUDE_PARAM_GROUPS.write), {
      denyPaths,
      cwd: root,
    }),
    {
      allowPaths,
      cwd: root,
      security,
    },
  );
  return wrapSandboxPathGuard(guarded, root);
}

export function createSandboxedEditTool(
  root: string,
  allowPaths?: string[],
  denyPaths?: string[],
  security?: FileToolSecurity,
) {
  const base = createEditTool(root) as unknown as AnyAgentTool;
  const guarded = wrapAllowPathsGuard(
    wrapDenyPathsGuard(wrapToolParamNormalization(base, CLAUDE_PARAM_GROUPS.edit), {
      denyPaths,
      cwd: root,
    }),
    {
      allowPaths,
      cwd: root,
      security,
    },
  );
  return wrapSandboxPathGuard(guarded, root);
}

export function createOpenClawReadTool(base: AnyAgentTool): AnyAgentTool {
  const patched = patchToolSchemaForClaudeCompatibility(base);
  return {
    ...patched,
    execute: async (toolCallId, params, signal) => {
      const normalized = normalizeToolParams(params);
      const record =
        normalized ??
        (params && typeof params === "object" ? (params as Record<string, unknown>) : undefined);
      assertRequiredParams(record, CLAUDE_PARAM_GROUPS.read, base.name);
      const result = await base.execute(toolCallId, normalized ?? params, signal);
      const filePath = typeof record?.path === "string" ? String(record.path) : "<unknown>";
      const normalizedResult = await normalizeReadImageResult(result, filePath);
      return sanitizeToolResultImages(normalizedResult, `read:${filePath}`);
    },
  };
}
