import type { AgentTool, AgentToolResult } from "@mariozechner/pi-agent-core";
import { describe, expect, it } from "vitest";
import {
  filterToolsByPolicy,
  isToolAllowedByPolicyName,
  resolveSubagentToolPolicy,
} from "./pi-tools.policy.js";
import type { OpenClawConfig } from "../config/config.js";

function createStubTool(name: string): AgentTool<unknown, unknown> {
  return {
    name,
    label: name,
    description: "",
    parameters: {},
    execute: async () => ({}) as AgentToolResult<unknown>,
  };
}

describe("pi-tools.policy", () => {
  it("treats * in allow as allow-all", () => {
    const tools = [createStubTool("read"), createStubTool("exec")];
    const filtered = filterToolsByPolicy(tools, { allow: ["*"] });
    expect(filtered.map((tool) => tool.name)).toEqual(["read", "exec"]);
  });

  it("treats * in deny as deny-all", () => {
    const tools = [createStubTool("read"), createStubTool("exec")];
    const filtered = filterToolsByPolicy(tools, { deny: ["*"] });
    expect(filtered).toEqual([]);
  });

  it("supports wildcard allow/deny patterns", () => {
    expect(isToolAllowedByPolicyName("web_fetch", { allow: ["web_*"] })).toBe(true);
    expect(isToolAllowedByPolicyName("web_search", { deny: ["web_*"] })).toBe(false);
  });

  it("keeps apply_patch when exec is allowlisted", () => {
    expect(isToolAllowedByPolicyName("apply_patch", { allow: ["exec"] })).toBe(true);
  });
});

describe("resolveSubagentToolPolicy", () => {
  it("denies memory_search by default", () => {
    const policy = resolveSubagentToolPolicy(undefined);
    expect(policy.deny).toContain("memory_search");
    expect(policy.deny).toContain("memory_get");
  });

  it("removes tool from default deny when explicitly allowed", () => {
    const cfg: OpenClawConfig = {
      tools: {
        subagents: {
          tools: {
            allow: ["memory_search", "memory_get"],
          },
        },
      },
    };
    const policy = resolveSubagentToolPolicy(cfg);
    expect(policy.deny).not.toContain("memory_search");
    expect(policy.deny).not.toContain("memory_get");
    expect(policy.allow).toContain("memory_search");
    expect(policy.allow).toContain("memory_get");
    // Other defaults should still be denied
    expect(policy.deny).toContain("cron");
    expect(policy.deny).toContain("gateway");
  });

  it("preserves custom deny even when tool is allowed", () => {
    const cfg: OpenClawConfig = {
      tools: {
        subagents: {
          tools: {
            allow: ["exec"],
            deny: ["exec"], // explicit deny takes precedence
          },
        },
      },
    };
    const policy = resolveSubagentToolPolicy(cfg);
    expect(policy.deny).toContain("exec");
  });
});
