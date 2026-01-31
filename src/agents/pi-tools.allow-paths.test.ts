import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import { AgentToolsSchema, ToolsSchema } from "../config/zod-schema.agent-runtime.js";
import { createOpenClawCodingTools } from "./pi-tools.js";

async function withTempDir<T>(prefix: string, fn: (dir: string) => Promise<T>) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function getTextContent(result?: { content?: Array<{ type: string; text?: string }> }) {
  const textBlock = result?.content?.find((block) => block.type === "text");
  return textBlock?.text ?? "";
}

describe("tool allowPaths", () => {
  it("enforces allowPaths for read/write/edit without sandboxing", async () => {
    await withTempDir("openclaw-allowpaths-", async (workspaceDir) => {
      const allowedDir = path.join(workspaceDir, "allowed");
      const otherDir = path.join(workspaceDir, "other");
      await fs.mkdir(allowedDir);
      await fs.mkdir(otherDir);

      await fs.writeFile(path.join(allowedDir, "read.txt"), "allowed read", "utf8");
      await fs.writeFile(path.join(otherDir, "read.txt"), "blocked read", "utf8");
      await fs.writeFile(path.join(allowedDir, "edit.txt"), "edit ok", "utf8");
      await fs.writeFile(path.join(otherDir, "edit.txt"), "edit blocked", "utf8");

      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "allowlist", allowPaths: [allowedDir] },
          write: { security: "allowlist", allowPaths: [allowedDir] },
          edit: { security: "allowlist", allowPaths: [allowedDir] },
        },
      };

      const tools = createOpenClawCodingTools({ workspaceDir, config: cfg });
      const readTool = tools.find((tool) => tool.name === "read");
      const writeTool = tools.find((tool) => tool.name === "write");
      const editTool = tools.find((tool) => tool.name === "edit");

      expect(readTool).toBeDefined();
      expect(writeTool).toBeDefined();
      expect(editTool).toBeDefined();

      const readResult = await readTool?.execute("allow-read", { path: "allowed/read.txt" });
      expect(getTextContent(readResult)).toContain("allowed read");

      await expect(readTool?.execute("deny-read", { path: "other/read.txt" })).rejects.toThrow(
        /allowed roots/i,
      );

      await writeTool?.execute("allow-write", {
        path: "allowed/write.txt",
        content: "write ok",
      });
      const written = await fs.readFile(path.join(allowedDir, "write.txt"), "utf8");
      expect(written).toBe("write ok");

      await expect(
        writeTool?.execute("deny-write", { path: "other/write.txt", content: "blocked" }),
      ).rejects.toThrow(/allowed roots/i);

      await editTool?.execute("allow-edit", {
        path: "allowed/edit.txt",
        oldText: "ok",
        newText: "done",
      });
      const edited = await fs.readFile(path.join(allowedDir, "edit.txt"), "utf8");
      expect(edited).toBe("edit done");

      await expect(
        editTool?.execute("deny-edit", {
          path: "other/edit.txt",
          oldText: "blocked",
          newText: "nope",
        }),
      ).rejects.toThrow(/allowed roots/i);
    });
  });

  it("uses agent-specific allowPaths when configured", async () => {
    await withTempDir("openclaw-allowpaths-agent-", async (workspaceDir) => {
      const globalDir = path.join(workspaceDir, "global");
      const agentDir = path.join(globalDir, "agent");
      await fs.mkdir(globalDir);
      await fs.mkdir(agentDir, { recursive: true });

      await fs.writeFile(path.join(globalDir, "read.txt"), "global read", "utf8");
      await fs.writeFile(path.join(agentDir, "read.txt"), "agent read", "utf8");

      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "allowlist", allowPaths: [globalDir] },
        },
        agents: {
          list: [
            {
              id: "restricted",
              tools: {
                read: { security: "allowlist", allowPaths: [agentDir] },
              },
            },
          ],
        },
      };

      const tools = createOpenClawCodingTools({
        config: cfg,
        sessionKey: "agent:restricted:main",
        workspaceDir,
        agentDir: path.join(workspaceDir, "agent-config"),
      });
      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeDefined();

      const result = await readTool?.execute("agent-read", { path: "global/agent/read.txt" });
      expect(getTextContent(result)).toContain("agent read");

      await expect(readTool?.execute("agent-deny", { path: "global/read.txt" })).rejects.toThrow(
        /allowed roots/i,
      );
    });
  });

  it("rejects symlink paths within allowPaths", async () => {
    await withTempDir("openclaw-allowpaths-symlink-", async (workspaceDir) => {
      const allowedDir = path.join(workspaceDir, "allowed");
      const secretDir = path.join(workspaceDir, "secret");
      await fs.mkdir(allowedDir);
      await fs.mkdir(secretDir);

      await fs.writeFile(path.join(secretDir, "secret.txt"), "top secret", "utf8");
      await fs.symlink(secretDir, path.join(allowedDir, "link"));

      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "allowlist", allowPaths: [allowedDir] },
        },
      };

      const tools = createOpenClawCodingTools({ workspaceDir, config: cfg });
      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeDefined();

      await expect(
        readTool?.execute("symlink-read", { path: "allowed/link/secret.txt" }),
      ).rejects.toThrow(/symlink/i);
    });
  });

  it("ignores allowPaths when security is full", async () => {
    await withTempDir("openclaw-allowpaths-full-", async (workspaceDir) => {
      const allowedDir = path.join(workspaceDir, "allowed");
      const otherDir = path.join(workspaceDir, "other");
      await fs.mkdir(allowedDir);
      await fs.mkdir(otherDir);

      await fs.writeFile(path.join(allowedDir, "read.txt"), "allowed read", "utf8");
      await fs.writeFile(path.join(otherDir, "read.txt"), "other read", "utf8");

      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "full", allowPaths: [allowedDir] },
        },
      };

      const tools = createOpenClawCodingTools({ workspaceDir, config: cfg });
      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeDefined();

      const result = await readTool?.execute("full-read", { path: "other/read.txt" });
      expect(getTextContent(result)).toContain("other read");
    });
  });

  it("blocks denyPaths for read/write/edit in full security mode", async () => {
    await withTempDir("openclaw-denypaths-full-", async (workspaceDir) => {
      await fs.writeFile(path.join(workspaceDir, "blocked.txt"), "blocked", "utf8");

      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "full", denyPaths: ["blocked.txt"] },
          write: { security: "full", denyPaths: ["blocked.txt"] },
          edit: { security: "full", denyPaths: ["blocked.txt"] },
        },
      };

      const tools = createOpenClawCodingTools({ workspaceDir, config: cfg });
      const readTool = tools.find((tool) => tool.name === "read");
      const writeTool = tools.find((tool) => tool.name === "write");
      const editTool = tools.find((tool) => tool.name === "edit");

      expect(readTool).toBeDefined();
      expect(writeTool).toBeDefined();
      expect(editTool).toBeDefined();

      await expect(readTool?.execute("deny-read", { path: "blocked.txt" })).rejects.toThrow(
        /denyPaths|blocked/i,
      );

      await expect(
        writeTool?.execute("deny-write", { path: "blocked.txt", content: "nope" }),
      ).rejects.toThrow(/denyPaths|blocked/i);

      await expect(
        editTool?.execute("deny-edit", {
          path: "blocked.txt",
          oldText: "blocked",
          newText: "nope",
        }),
      ).rejects.toThrow(/denyPaths|blocked/i);
    });
  });

  it("blocks absolute denyPaths entries", async () => {
    await withTempDir("openclaw-denypaths-absolute-", async (workspaceDir) => {
      const blockedPath = path.join(workspaceDir, "blocked.txt");
      await fs.writeFile(blockedPath, "blocked", "utf8");

      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "full", denyPaths: [blockedPath] },
        },
      };

      const tools = createOpenClawCodingTools({ workspaceDir, config: cfg });
      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeDefined();

      await expect(readTool?.execute("deny-absolute", { path: "blocked.txt" })).rejects.toThrow(
        /denyPaths|blocked/i,
      );
    });
  });

  it("blocks denyPaths directories and nested files", async () => {
    await withTempDir("openclaw-denypaths-dir-", async (workspaceDir) => {
      const denyDir = path.join(workspaceDir, "deny");
      await fs.mkdir(denyDir, { recursive: true });
      await fs.writeFile(path.join(denyDir, "read.txt"), "blocked read", "utf8");
      await fs.writeFile(path.join(denyDir, "edit.txt"), "blocked edit", "utf8");

      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "full", denyPaths: ["deny"] },
          write: { security: "full", denyPaths: ["deny"] },
          edit: { security: "full", denyPaths: ["deny"] },
        },
      };

      const tools = createOpenClawCodingTools({ workspaceDir, config: cfg });
      const readTool = tools.find((tool) => tool.name === "read");
      const writeTool = tools.find((tool) => tool.name === "write");
      const editTool = tools.find((tool) => tool.name === "edit");

      await expect(readTool?.execute("deny-read", { path: "deny/read.txt" })).rejects.toThrow(
        /denyPaths|blocked/i,
      );

      await expect(
        writeTool?.execute("deny-write", { path: "deny/write.txt", content: "blocked" }),
      ).rejects.toThrow(/denyPaths|blocked/i);

      await expect(
        editTool?.execute("deny-edit", { path: "deny/edit.txt", oldText: "edit", newText: "no" }),
      ).rejects.toThrow(/denyPaths|blocked/i);
    });
  });

  it("applies denyPaths within allowPaths", async () => {
    await withTempDir("openclaw-denypaths-allowlist-", async (workspaceDir) => {
      const allowedDir = path.join(workspaceDir, "allowed");
      await fs.mkdir(allowedDir, { recursive: true });
      await fs.writeFile(path.join(allowedDir, "allowed.txt"), "ok", "utf8");
      await fs.writeFile(path.join(allowedDir, "blocked.txt"), "blocked", "utf8");

      const cfg: OpenClawConfig = {
        tools: {
          read: {
            security: "allowlist",
            allowPaths: [allowedDir],
            denyPaths: ["allowed/blocked.txt"],
          },
        },
      };

      const tools = createOpenClawCodingTools({ workspaceDir, config: cfg });
      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeDefined();

      const allowedResult = await readTool?.execute("allow-read", { path: "allowed/allowed.txt" });
      expect(getTextContent(allowedResult)).toContain("ok");

      await expect(readTool?.execute("deny-read", { path: "allowed/blocked.txt" })).rejects.toThrow(
        /denyPaths|blocked/i,
      );
    });
  });

  it("unions agent and global denyPaths", async () => {
    await withTempDir("openclaw-denypaths-union-", async (workspaceDir) => {
      await fs.writeFile(path.join(workspaceDir, "global.txt"), "global", "utf8");
      await fs.writeFile(path.join(workspaceDir, "agent.txt"), "agent", "utf8");

      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "full", denyPaths: ["global.txt"] },
        },
        agents: {
          list: [
            {
              id: "restricted",
              tools: {
                read: { security: "full", denyPaths: ["agent.txt"] },
              },
            },
          ],
        },
      };

      const tools = createOpenClawCodingTools({
        config: cfg,
        sessionKey: "agent:restricted:main",
        workspaceDir,
      });
      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeDefined();

      await expect(readTool?.execute("deny-global", { path: "global.txt" })).rejects.toThrow(
        /denyPaths|blocked/i,
      );
      await expect(readTool?.execute("deny-agent", { path: "agent.txt" })).rejects.toThrow(
        /denyPaths|blocked/i,
      );
    });
  });

  it("blocks symlink access to denied paths", async () => {
    await withTempDir("openclaw-denypaths-symlink-", async (workspaceDir) => {
      const secretDir = path.join(workspaceDir, "secret");
      const linkDir = path.join(workspaceDir, "link");
      await fs.mkdir(secretDir, { recursive: true });
      await fs.writeFile(path.join(secretDir, "secret.txt"), "secret", "utf8");
      await fs.symlink(secretDir, linkDir);

      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "full", denyPaths: ["secret/secret.txt"] },
        },
      };

      const tools = createOpenClawCodingTools({ workspaceDir, config: cfg });
      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeDefined();

      await expect(readTool?.execute("deny-symlink", { path: "link/secret.txt" })).rejects.toThrow(
        /denyPaths|blocked/i,
      );
    });
  });

  it("blocks read tool when security is deny", async () => {
    await withTempDir("openclaw-allowpaths-deny-", async (workspaceDir) => {
      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "deny" },
        },
      };

      const tools = createOpenClawCodingTools({ workspaceDir, config: cfg });
      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeUndefined();
    });
  });

  it("blocks write tool when security is deny", async () => {
    await withTempDir("openclaw-allowpaths-deny-write-", async (workspaceDir) => {
      const cfg: OpenClawConfig = {
        tools: {
          write: { security: "deny" },
        },
      };

      const tools = createOpenClawCodingTools({ workspaceDir, config: cfg });
      const writeTool = tools.find((tool) => tool.name === "write");
      expect(writeTool).toBeUndefined();
    });
  });

  it("blocks edit tool when security is deny", async () => {
    await withTempDir("openclaw-allowpaths-deny-edit-", async (workspaceDir) => {
      const cfg: OpenClawConfig = {
        tools: {
          edit: { security: "deny" },
        },
      };

      const tools = createOpenClawCodingTools({ workspaceDir, config: cfg });
      const editTool = tools.find((tool) => tool.name === "edit");
      expect(editTool).toBeUndefined();
    });
  });

  it("does not allow agent to loosen global deny", async () => {
    await withTempDir("openclaw-allowpaths-agent-deny-", async (workspaceDir) => {
      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "deny" },
        },
        agents: {
          list: [
            {
              id: "restricted",
              tools: {
                read: { security: "full" },
              },
            },
          ],
        },
      };

      const tools = createOpenClawCodingTools({
        config: cfg,
        sessionKey: "agent:restricted:main",
        workspaceDir,
      });
      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeUndefined();
    });
  });

  it("does not allow agent allowPaths to widen beyond global allowPaths", async () => {
    await withTempDir("openclaw-allowpaths-agent-intersect-", async (workspaceDir) => {
      const globalDir = path.join(workspaceDir, "global");
      const otherDir = path.join(workspaceDir, "other");
      await fs.mkdir(globalDir);
      await fs.mkdir(otherDir);

      await fs.writeFile(path.join(otherDir, "read.txt"), "other read", "utf8");

      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "allowlist", allowPaths: [globalDir] },
        },
        agents: {
          list: [
            {
              id: "restricted",
              tools: {
                read: { security: "allowlist", allowPaths: [otherDir] },
              },
            },
          ],
        },
      };

      const tools = createOpenClawCodingTools({
        config: cfg,
        sessionKey: "agent:restricted:main",
        workspaceDir,
      });
      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeDefined();

      await expect(readTool?.execute("deny-read", { path: "other/read.txt" })).rejects.toThrow(
        /allowPaths|allowed roots|roots configured/i,
      );
    });
  });

  it("allows agent allowPaths when global security is full", async () => {
    await withTempDir("openclaw-allowpaths-global-full-", async (workspaceDir) => {
      const globalDir = path.join(workspaceDir, "global");
      const otherDir = path.join(workspaceDir, "other");
      await fs.mkdir(globalDir);
      await fs.mkdir(otherDir);

      await fs.writeFile(path.join(otherDir, "read.txt"), "other read", "utf8");

      const cfg: OpenClawConfig = {
        tools: {
          read: { security: "full", allowPaths: [globalDir] },
        },
        agents: {
          list: [
            {
              id: "restricted",
              tools: {
                read: { security: "allowlist", allowPaths: [otherDir] },
              },
            },
          ],
        },
      };

      const tools = createOpenClawCodingTools({
        config: cfg,
        sessionKey: "agent:restricted:main",
        workspaceDir,
      });
      const readTool = tools.find((tool) => tool.name === "read");
      expect(readTool).toBeDefined();

      const readResult = await readTool?.execute("allow-read", { path: "other/read.txt" });
      expect(getTextContent(readResult)).toContain("other read");
    });
  });

  it("rejects allowlist security without allowPaths", () => {
    const toolsResult = ToolsSchema.safeParse({
      read: { security: "allowlist", allowPaths: [] },
    });
    expect(toolsResult.success).toBe(false);

    const agentToolsResult = AgentToolsSchema.safeParse({
      read: { security: "allowlist", allowPaths: [] },
    });
    expect(agentToolsResult.success).toBe(false);
  });

  it("accepts denyPaths without allowPaths when security is full", () => {
    const toolsResult = ToolsSchema.safeParse({
      read: { security: "full", denyPaths: ["blocked.txt"] },
    });
    expect(toolsResult.success).toBe(true);

    const agentToolsResult = AgentToolsSchema.safeParse({
      read: { security: "full", denyPaths: ["blocked.txt"] },
    });
    expect(agentToolsResult.success).toBe(true);
  });
});
