import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { resolveBootstrapContextForRun, resolveBootstrapFilesForRun } from "./bootstrap-files.js";
import { makeTempWorkspace, writeWorkspaceFile } from "../test-helpers/workspace.js";
import {
  clearInternalHooks,
  registerInternalHook,
  type AgentBootstrapHookContext,
} from "../hooks/internal-hooks.js";

describe("resolveBootstrapFilesForRun", () => {
  beforeEach(() => clearInternalHooks());
  afterEach(() => clearInternalHooks());

  it("applies bootstrap hook overrides", async () => {
    registerInternalHook("agent:bootstrap", (event) => {
      const context = event.context as AgentBootstrapHookContext;
      context.bootstrapFiles = [
        ...context.bootstrapFiles,
        {
          name: "EXTRA.md",
          path: path.join(context.workspaceDir, "EXTRA.md"),
          content: "extra",
          missing: false,
        },
      ];
    });

    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const files = await resolveBootstrapFilesForRun({ workspaceDir });

    expect(files.some((file) => file.name === "EXTRA.md")).toBe(true);
  });

  it("filters MEMORY.md for non-main sessions by default", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    await writeWorkspaceFile({ dir: workspaceDir, name: "MEMORY.md", content: "memory" });

    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      sessionKey: "agent:main:telegram:dm:123",
      config: {
        agents: {
          defaults: {
            sandbox: {
              mode: "non-main",
              workspaceAccess: "none",
            },
          },
          list: [{ id: "main" }],
        },
      },
    });

    expect(files.some((file) => file.name === "MEMORY.md")).toBe(false);
  });

  it("allows MEMORY.md for sandboxed sessions when sandbox memory is enabled", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    await writeWorkspaceFile({ dir: workspaceDir, name: "MEMORY.md", content: "memory" });

    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      sessionKey: "agent:main:telegram:dm:123",
      config: {
        agents: {
          defaults: {
            sandbox: {
              mode: "non-main",
              workspaceAccess: "none",
              memory: "sandbox",
            },
          },
          list: [{ id: "main" }],
        },
      },
    });

    expect(files.some((file) => file.name === "MEMORY.md")).toBe(true);
  });

  it("keeps MEMORY.md for main sessions", async () => {
    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    await writeWorkspaceFile({ dir: workspaceDir, name: "MEMORY.md", content: "memory" });

    const files = await resolveBootstrapFilesForRun({
      workspaceDir,
      sessionKey: "agent:main:main",
      config: {
        agents: {
          defaults: {
            sandbox: {
              mode: "non-main",
              workspaceAccess: "none",
            },
          },
          list: [{ id: "main" }],
        },
      },
    });

    expect(files.some((file) => file.name === "MEMORY.md")).toBe(true);
  });
});

describe("resolveBootstrapContextForRun", () => {
  beforeEach(() => clearInternalHooks());
  afterEach(() => clearInternalHooks());

  it("returns context files for hook-adjusted bootstrap files", async () => {
    registerInternalHook("agent:bootstrap", (event) => {
      const context = event.context as AgentBootstrapHookContext;
      context.bootstrapFiles = [
        ...context.bootstrapFiles,
        {
          name: "EXTRA.md",
          path: path.join(context.workspaceDir, "EXTRA.md"),
          content: "extra",
          missing: false,
        },
      ];
    });

    const workspaceDir = await makeTempWorkspace("openclaw-bootstrap-");
    const result = await resolveBootstrapContextForRun({ workspaceDir });
    const extra = result.contextFiles.find((file) => file.path === "EXTRA.md");

    expect(extra?.content).toBe("extra");
  });
});
