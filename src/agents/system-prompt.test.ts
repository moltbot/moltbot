import { describe, expect, it } from "vitest";
import {
  buildAgentSystemPrompt,
  getToolDescriptions,
  isSpecialtyTool,
  TOOL_TIERS,
} from "./system-prompt.js";

describe("buildAgentSystemPrompt", () => {
  it("includes owner numbers when provided", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      ownerNumbers: ["+123", " +456 ", ""],
    });

    expect(prompt).toContain("## User Identity");
    expect(prompt).toContain(
      "Owner numbers: +123, +456. Treat messages from these numbers as the user.",
    );
  });

  it("omits owner section when numbers are missing", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
    });

    expect(prompt).not.toContain("## User Identity");
    expect(prompt).not.toContain("Owner numbers:");
  });

  it("adds reasoning tag hint when enabled", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      reasoningTagHint: true,
    });

    expect(prompt).toContain("## Reasoning Format");
    expect(prompt).toContain("<think>...</think>");
    expect(prompt).toContain("<final>...</final>");
  });

  it("lists available tools when provided", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      toolNames: ["bash", "sessions_list", "sessions_history", "sessions_send"],
    });

    expect(prompt).toContain("Tool availability (filtered by policy):");
    expect(prompt).toContain("sessions_list");
    expect(prompt).toContain("sessions_history");
    expect(prompt).toContain("sessions_send");
  });

  it("preserves tool casing in the prompt", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      toolNames: ["Read", "Bash", "process"],
      skillsPrompt:
        "<available_skills>\n  <skill>\n    <name>demo</name>\n  </skill>\n</available_skills>",
    });

    expect(prompt).toContain("- Read: Read file contents");
    expect(prompt).toContain("- Bash: Run shell commands");
    expect(prompt).toContain(
      "Use `Read` to load the SKILL.md at the location listed for that skill.",
    );
  });

  it("includes user time when provided", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      userTimezone: "America/Chicago",
      userTime: "Monday 2026-01-05 15:26",
    });

    expect(prompt).toContain(
      "Time: assume UTC unless stated. User TZ=America/Chicago. Current user time (converted)=Monday 2026-01-05 15:26.",
    );
  });

  it("includes model alias guidance when aliases are provided", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      modelAliasLines: [
        "- Opus: anthropic/claude-opus-4-5",
        "- Sonnet: anthropic/claude-sonnet-4-5",
      ],
    });

    expect(prompt).toContain("## Model Aliases");
    expect(prompt).toContain("Prefer aliases when specifying model overrides");
    expect(prompt).toContain("- Opus: anthropic/claude-opus-4-5");
  });

  it("adds ClaudeBot self-update guidance when gateway tool is available", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      toolNames: ["gateway", "bash"],
    });

    expect(prompt).toContain("## Clawdbot Self-Update");
    expect(prompt).toContain("config.apply");
    expect(prompt).toContain("update.run");
  });

  it("includes skills guidance when skills prompt is present", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      skillsPrompt:
        "<available_skills>\n  <skill>\n    <name>demo</name>\n  </skill>\n</available_skills>",
    });

    expect(prompt).toContain("## Skills");
    expect(prompt).toContain(
      "Use `read` to load the SKILL.md at the location listed for that skill.",
    );
  });

  it("appends available skills when provided", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      skillsPrompt:
        "<available_skills>\n  <skill>\n    <name>demo</name>\n  </skill>\n</available_skills>",
    });

    expect(prompt).toContain("<available_skills>");
    expect(prompt).toContain("<name>demo</name>");
  });

  it("omits skills section when no skills prompt is provided", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
    });

    expect(prompt).not.toContain("## Skills");
    expect(prompt).not.toContain("<available_skills>");
  });

  it("renders project context files when provided", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      contextFiles: [
        { path: "AGENTS.md", content: "Alpha" },
        { path: "IDENTITY.md", content: "Bravo" },
      ],
    });

    expect(prompt).toContain("# Project Context");
    expect(prompt).toContain("## AGENTS.md");
    expect(prompt).toContain("Alpha");
    expect(prompt).toContain("## IDENTITY.md");
    expect(prompt).toContain("Bravo");
  });

  it("summarizes the message tool when available", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      toolNames: ["message"],
    });

    expect(prompt).toContain("message: Send messages and provider actions");
    expect(prompt).toContain("### message tool");
  });

  it("includes runtime provider capabilities when present", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      runtimeInfo: {
        provider: "telegram",
        capabilities: ["inlineButtons"],
      },
    });

    expect(prompt).toContain("provider=telegram");
    expect(prompt).toContain("capabilities=inlineButtons");
  });

  it("describes sandboxed runtime and elevated when allowed", () => {
    const prompt = buildAgentSystemPrompt({
      workspaceDir: "/tmp/clawd",
      sandboxInfo: {
        enabled: true,
        workspaceDir: "/tmp/sandbox",
        workspaceAccess: "ro",
        agentWorkspaceMount: "/agent",
        elevated: { allowed: true, defaultLevel: "on" },
      },
    });

    expect(prompt).toContain("You are running in a sandboxed runtime");
    expect(prompt).toContain("User can toggle with /elevated on|off.");
    expect(prompt).toContain("Current elevated level: on");
  });

  describe("compactToolDescriptions", () => {
    it("includes full descriptions for core tools when compact mode enabled", () => {
      const prompt = buildAgentSystemPrompt({
        workspaceDir: "/tmp/clawd",
        toolNames: ["read", "write", "bash", "browser", "canvas"],
        compactToolDescriptions: true,
      });

      // Core tools should have descriptions
      expect(prompt).toContain("read: Read file contents");
      expect(prompt).toContain("write: Create or overwrite files");
      expect(prompt).toContain("bash: Run shell commands");
    });

    it("excludes descriptions for specialty tools when compact mode enabled", () => {
      const prompt = buildAgentSystemPrompt({
        workspaceDir: "/tmp/clawd",
        toolNames: ["read", "browser", "canvas", "nodes"],
        compactToolDescriptions: true,
      });

      // Specialty tools should only show name
      expect(prompt).toContain("- browser");
      expect(prompt).not.toContain("browser: Control web browser");
      expect(prompt).toContain("- canvas");
      expect(prompt).not.toContain("canvas: Present/eval/snapshot");
      expect(prompt).toContain("- nodes");
      expect(prompt).not.toContain("nodes: List/describe/notify");
    });

    it("includes hint about specialty tools in compact mode", () => {
      const prompt = buildAgentSystemPrompt({
        workspaceDir: "/tmp/clawd",
        toolNames: ["read", "browser"],
        compactToolDescriptions: true,
      });

      expect(prompt).toContain(
        "(Specialty tools above have detailed docs available on request.)",
      );
    });

    it("does not add hint when only core tools present", () => {
      const prompt = buildAgentSystemPrompt({
        workspaceDir: "/tmp/clawd",
        toolNames: ["read", "write", "bash"],
        compactToolDescriptions: true,
      });

      expect(prompt).not.toContain("Specialty tools above");
    });

    it("includes all descriptions when compact mode disabled", () => {
      const prompt = buildAgentSystemPrompt({
        workspaceDir: "/tmp/clawd",
        toolNames: ["read", "browser", "canvas"],
        compactToolDescriptions: false,
      });

      // All tools should have descriptions
      expect(prompt).toContain("read: Read file contents");
      expect(prompt).toContain("browser: Control web browser");
      expect(prompt).toContain("canvas: Present/eval/snapshot");
    });
  });
});

describe("TOOL_TIERS", () => {
  it("defines core tools correctly", () => {
    expect(TOOL_TIERS.core.has("read")).toBe(true);
    expect(TOOL_TIERS.core.has("write")).toBe(true);
    expect(TOOL_TIERS.core.has("bash")).toBe(true);
    expect(TOOL_TIERS.core.has("browser")).toBe(false);
  });

  it("defines specialty tools correctly", () => {
    expect(TOOL_TIERS.specialty.has("browser")).toBe(true);
    expect(TOOL_TIERS.specialty.has("canvas")).toBe(true);
    expect(TOOL_TIERS.specialty.has("nodes")).toBe(true);
    expect(TOOL_TIERS.specialty.has("read")).toBe(false);
  });

  it("defines minimal tools correctly", () => {
    expect(TOOL_TIERS.minimal.has("whatsapp_login")).toBe(true);
    expect(TOOL_TIERS.minimal.has("gateway")).toBe(true);
    expect(TOOL_TIERS.minimal.has("read")).toBe(false);
  });
});

describe("getToolDescriptions", () => {
  it("returns descriptions for requested tools", () => {
    const descriptions = getToolDescriptions(["browser", "canvas", "read"]);

    expect(descriptions.browser).toContain("Control a web browser");
    expect(descriptions.canvas).toContain("Present interactive content");
    expect(descriptions.read).toContain("Read file contents");
  });

  it("returns empty object for unknown tools", () => {
    const descriptions = getToolDescriptions(["unknown_tool", "another"]);

    expect(Object.keys(descriptions)).toHaveLength(0);
  });

  it("is case insensitive", () => {
    const descriptions = getToolDescriptions(["Browser", "CANVAS"]);

    expect(descriptions.Browser).toContain("web browser");
    expect(descriptions.CANVAS).toContain("Canvas");
  });
});

describe("isSpecialtyTool", () => {
  it("returns true for specialty tools", () => {
    expect(isSpecialtyTool("browser")).toBe(true);
    expect(isSpecialtyTool("canvas")).toBe(true);
    expect(isSpecialtyTool("nodes")).toBe(true);
  });

  it("returns true for minimal tools", () => {
    expect(isSpecialtyTool("whatsapp_login")).toBe(true);
    expect(isSpecialtyTool("gateway")).toBe(true);
    expect(isSpecialtyTool("image")).toBe(true);
  });

  it("returns false for core tools", () => {
    expect(isSpecialtyTool("read")).toBe(false);
    expect(isSpecialtyTool("write")).toBe(false);
    expect(isSpecialtyTool("bash")).toBe(false);
  });

  it("is case insensitive", () => {
    expect(isSpecialtyTool("Browser")).toBe(true);
    expect(isSpecialtyTool("READ")).toBe(false);
  });
});
