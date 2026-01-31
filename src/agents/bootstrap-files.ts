import type { OpenClawConfig } from "../config/config.js";
import { resolveSandboxMemoryAccess } from "./sandbox/memory.js";
import { applyBootstrapHookOverrides } from "./bootstrap-hooks.js";
import {
  filterBootstrapFilesForSession,
  loadWorkspaceBootstrapFiles,
  type WorkspaceBootstrapFile,
  DEFAULT_MEMORY_ALT_FILENAME,
  DEFAULT_MEMORY_FILENAME,
} from "./workspace.js";
import { buildBootstrapContextFiles, resolveBootstrapMaxChars } from "./pi-embedded-helpers.js";
import type { EmbeddedContextFile } from "./pi-embedded-helpers.js";

export function makeBootstrapWarn(params: {
  sessionLabel: string;
  warn?: (message: string) => void;
}): ((message: string) => void) | undefined {
  if (!params.warn) {
    return undefined;
  }
  return (message: string) => params.warn?.(`${message} (sessionKey=${params.sessionLabel})`);
}

const MEMORY_BOOTSTRAP_FILES = new Set([DEFAULT_MEMORY_FILENAME, DEFAULT_MEMORY_ALT_FILENAME]);

function filterMemoryBootstrapFiles(params: {
  files: WorkspaceBootstrapFile[];
  config?: OpenClawConfig;
  sessionKey?: string;
}): WorkspaceBootstrapFile[] {
  if (!params.config) {
    return params.files;
  }
  const sessionKey = params.sessionKey?.trim();
  if (!sessionKey) {
    return params.files;
  }

  const access = resolveSandboxMemoryAccess({ cfg: params.config, sessionKey });
  if (access.allowMemoryFiles) {
    return params.files;
  }
  return params.files.filter((file) => !MEMORY_BOOTSTRAP_FILES.has(file.name));
}

export async function resolveBootstrapFilesForRun(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
}): Promise<WorkspaceBootstrapFile[]> {
  const sessionKey = params.sessionKey ?? params.sessionId;
  const bootstrapFiles = filterBootstrapFilesForSession(
    await loadWorkspaceBootstrapFiles(params.workspaceDir),
    sessionKey,
  );
  const hookAdjusted = await applyBootstrapHookOverrides({
    files: bootstrapFiles,
    workspaceDir: params.workspaceDir,
    config: params.config,
    sessionKey: params.sessionKey,
    sessionId: params.sessionId,
    agentId: params.agentId,
  });
  return filterMemoryBootstrapFiles({
    files: hookAdjusted,
    config: params.config,
    sessionKey: params.sessionKey,
  });
}

export async function resolveBootstrapContextForRun(params: {
  workspaceDir: string;
  config?: OpenClawConfig;
  sessionKey?: string;
  sessionId?: string;
  agentId?: string;
  warn?: (message: string) => void;
}): Promise<{
  bootstrapFiles: WorkspaceBootstrapFile[];
  contextFiles: EmbeddedContextFile[];
}> {
  const bootstrapFiles = await resolveBootstrapFilesForRun(params);
  const contextFiles = buildBootstrapContextFiles(bootstrapFiles, {
    maxChars: resolveBootstrapMaxChars(params.config),
    warn: params.warn,
  });
  return { bootstrapFiles, contextFiles };
}
