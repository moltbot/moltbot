import type { OpenClawConfig } from "../../config/config.js";
import { canonicalizeMainSessionAlias } from "../../config/sessions.js";
import { resolveSandboxConfigForAgent } from "./config.js";
import { resolveSandboxRuntimeStatus } from "./runtime-status.js";
import type { SandboxMemoryPolicy, SandboxWorkspaceAccess } from "./types.js";

export type SandboxMemoryAccess = {
  sandboxed: boolean;
  isMainSession: boolean;
  workspaceAccess: SandboxWorkspaceAccess;
  memoryPolicy: SandboxMemoryPolicy;
  allowSandboxWorkspaceMemory: boolean;
  allowMemoryFiles: boolean;
  allowMemoryFlush: boolean;
  allowHistoryFlush: boolean;
};

export function resolveSandboxMemoryAccess(params: {
  cfg?: OpenClawConfig;
  sessionKey?: string;
}): SandboxMemoryAccess {
  const sessionKey = params.sessionKey?.trim();
  if (!params.cfg || !sessionKey) {
    return {
      sandboxed: false,
      isMainSession: false,
      workspaceAccess: "rw",
      memoryPolicy: "off",
      allowSandboxWorkspaceMemory: false,
      allowMemoryFiles: true,
      allowMemoryFlush: true,
      allowHistoryFlush: false,
    };
  }

  const runtime = resolveSandboxRuntimeStatus({ cfg: params.cfg, sessionKey });
  const sandboxCfg = resolveSandboxConfigForAgent(params.cfg, runtime.agentId);
  const normalizedSessionKey = canonicalizeMainSessionAlias({
    cfg: params.cfg,
    agentId: runtime.agentId,
    sessionKey,
  });
  const isMainSession = normalizedSessionKey === runtime.mainSessionKey;
  const sandboxed = runtime.sandboxed;
  const workspaceAccess = sandboxCfg.workspaceAccess;
  const memoryPolicy = sandboxCfg.memory ?? "off";
  const allowSandboxWorkspaceMemory =
    sandboxed && workspaceAccess === "none" && memoryPolicy === "sandbox";

  return {
    sandboxed,
    isMainSession,
    workspaceAccess,
    memoryPolicy,
    allowSandboxWorkspaceMemory,
    allowMemoryFiles: !sandboxed || isMainSession || allowSandboxWorkspaceMemory,
    allowMemoryFlush: !sandboxed || workspaceAccess === "rw" || allowSandboxWorkspaceMemory,
    allowHistoryFlush: allowSandboxWorkspaceMemory,
  };
}
