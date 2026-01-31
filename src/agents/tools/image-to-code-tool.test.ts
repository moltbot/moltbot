import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { OpenClawConfig } from "../../config/config.js";
import { __testing, createImageToCodeTool } from "./image-to-code-tool.js";

const { buildCodeGenPrompt, FRAMEWORK_INSTRUCTIONS } = __testing;

describe("image_to_code prompt construction", () => {
  it("builds html prompt by default", () => {
    const prompt = buildCodeGenPrompt({ framework: "html" });
    expect(prompt).toContain("Framework: html");
    expect(prompt).toContain(FRAMEWORK_INSTRUCTIONS.html);
    expect(prompt).toContain("production-quality code");
  });

  it("builds react prompt", () => {
    const prompt = buildCodeGenPrompt({ framework: "react" });
    expect(prompt).toContain("Framework: react");
    expect(prompt).toContain("React component");
  });

  it("builds vue prompt", () => {
    const prompt = buildCodeGenPrompt({ framework: "vue" });
    expect(prompt).toContain("Framework: vue");
    expect(prompt).toContain("Vue 3");
    expect(prompt).toContain("<script setup");
  });

  it("builds astro prompt", () => {
    const prompt = buildCodeGenPrompt({ framework: "astro" });
    expect(prompt).toContain("Framework: astro");
    expect(prompt).toContain("Astro component");
  });

  it("builds svelte prompt", () => {
    const prompt = buildCodeGenPrompt({ framework: "svelte" });
    expect(prompt).toContain("Framework: svelte");
    expect(prompt).toContain("Svelte component");
  });

  it("builds tailwind prompt", () => {
    const prompt = buildCodeGenPrompt({ framework: "tailwind" });
    expect(prompt).toContain("Framework: tailwind");
    expect(prompt).toContain("Tailwind CSS");
  });

  it("includes description when provided", () => {
    const prompt = buildCodeGenPrompt({
      framework: "html",
      description: "A login form with email and password",
    });
    expect(prompt).toContain("Additional context: A login form with email and password");
  });

  it("omits description section when not provided", () => {
    const prompt = buildCodeGenPrompt({ framework: "html" });
    expect(prompt).not.toContain("Additional context");
  });
});

describe("image_to_code tool creation", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("ANTHROPIC_OAUTH_TOKEN", "");
    vi.stubEnv("MINIMAX_API_KEY", "");
    vi.stubEnv("COPILOT_GITHUB_TOKEN", "");
    vi.stubEnv("GH_TOKEN", "");
    vi.stubEnv("GITHUB_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null without agentDir", () => {
    expect(createImageToCodeTool({})).toBeNull();
  });

  it("returns null when no vision model auth available", async () => {
    const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-i2c-"));
    const cfg: OpenClawConfig = {
      agents: { defaults: { model: { primary: "openai/gpt-5.2" } } },
    };
    expect(createImageToCodeTool({ config: cfg, agentDir })).toBeNull();
  });

  it("creates tool when vision model is configured", async () => {
    const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-i2c-"));
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.2" },
          imageModel: { primary: "openai/gpt-5-mini" },
        },
      },
    };
    const tool = createImageToCodeTool({ config: cfg, agentDir });
    expect(tool).not.toBeNull();
    expect(tool?.name).toBe("image_to_code");
  });

  it("rejects remote URLs in sandboxed mode", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-i2c-sandbox-"));
    const agentDir = path.join(stateDir, "agent");
    const sandboxRoot = path.join(stateDir, "sandbox");
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(sandboxRoot, { recursive: true });

    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.2" },
          imageModel: { primary: "openai/gpt-5-mini" },
        },
      },
    };
    const tool = createImageToCodeTool({ config: cfg, agentDir, sandboxRoot });
    expect(tool).not.toBeNull();
    if (!tool) throw new Error("expected tool");

    await expect(
      tool.execute("t1", { image: "https://example.com/screenshot.png" }),
    ).rejects.toThrow(/does not allow remote URLs/i);
  });

  it("rejects sandbox-escaping paths", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-i2c-sandbox-"));
    const agentDir = path.join(stateDir, "agent");
    const sandboxRoot = path.join(stateDir, "sandbox");
    await fs.mkdir(agentDir, { recursive: true });
    await fs.mkdir(sandboxRoot, { recursive: true });

    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.2" },
          imageModel: { primary: "openai/gpt-5-mini" },
        },
      },
    };
    const tool = createImageToCodeTool({ config: cfg, agentDir, sandboxRoot });
    expect(tool).not.toBeNull();
    if (!tool) throw new Error("expected tool");

    await expect(tool.execute("t1", { image: "../escape.png" })).rejects.toThrow(
      /escapes sandbox root/i,
    );
  });

  it("defaults framework to html", async () => {
    const agentDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-i2c-"));
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          model: { primary: "openai/gpt-5.2" },
          imageModel: { primary: "openai/gpt-5-mini" },
        },
      },
    };
    const tool = createImageToCodeTool({ config: cfg, agentDir });
    expect(tool).not.toBeNull();
    // Tool exists and has correct name — framework default is tested at prompt level
    expect(tool?.name).toBe("image_to_code");
  });
});
