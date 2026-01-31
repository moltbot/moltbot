import { Type } from "@sinclair/typebox";

import type { OpenClawConfig } from "../../config/config.js";
import { resolveUserPath } from "../../utils.js";
import { loadWebMedia } from "../../web/media.js";
import { assertSandboxPath } from "../sandbox-paths.js";
import { optionalStringEnum } from "../schema/typebox.js";
import type { AnyAgentTool } from "./common.js";
import { coerceImageModelConfig, decodeDataUrl } from "./image-tool.helpers.js";
import { resolveImageModelConfigForTool, runImagePrompt } from "./image-tool.js";

const SUPPORTED_FRAMEWORKS = ["html", "react", "vue", "astro", "svelte", "tailwind"] as const;
type Framework = (typeof SUPPORTED_FRAMEWORKS)[number];

const FRAMEWORK_INSTRUCTIONS: Record<Framework, string> = {
  html: "Generate vanilla HTML and CSS. Use inline styles or a <style> block. The output should be a single self-contained HTML file.",
  react:
    "Generate a React component using JSX. Use CSS Modules, inline styles, or a co-located CSS approach. Export the component as the default export.",
  vue: 'Generate a Vue 3 Single File Component (SFC) with <template>, <script setup lang="ts">, and <style scoped> sections.',
  astro:
    "Generate an Astro component with frontmatter (---) for imports/logic and the template below. Use scoped <style> tags.",
  svelte:
    'Generate a Svelte component with <script lang="ts">, the template markup, and a <style> block.',
  tailwind:
    "Generate HTML using Tailwind CSS utility classes. Do not use custom CSS — rely entirely on Tailwind utilities for styling.",
};

function buildCodeGenPrompt(params: { framework: Framework; description?: string }): string {
  const frameworkInstructions = FRAMEWORK_INSTRUCTIONS[params.framework];
  const parts = [
    "You are an expert frontend developer. Convert the provided screenshot/mockup into clean, production-quality code.",
    "",
    `Framework: ${params.framework}`,
    frameworkInstructions,
    "",
    "Requirements:",
    "- Reproduce the visual layout, colors, typography, and spacing as closely as possible.",
    "- Use semantic HTML elements where appropriate.",
    "- Make the output responsive where reasonable.",
    "- Output ONLY the code — no explanations, no markdown fences, no commentary.",
  ];
  if (params.description) {
    parts.push("", `Additional context: ${params.description}`);
  }
  return parts.join("\n");
}

const ImageToCodeToolSchema = Type.Object({
  image: Type.String(),
  framework: optionalStringEnum(SUPPORTED_FRAMEWORKS, {
    description: "Target framework (default: html)",
  }),
  description: Type.Optional(Type.String()),
  model: Type.Optional(Type.String()),
});

export function createImageToCodeTool(options?: {
  config?: OpenClawConfig;
  agentDir?: string;
  sandboxRoot?: string;
}): AnyAgentTool | null {
  const agentDir = options?.agentDir?.trim();
  if (!agentDir) {
    const explicit = coerceImageModelConfig(options?.config);
    if (explicit.primary?.trim() || (explicit.fallbacks?.length ?? 0) > 0) {
      throw new Error("createImageToCodeTool requires agentDir when enabled");
    }
    return null;
  }
  const imageModelConfig = resolveImageModelConfigForTool({
    cfg: options?.config,
    agentDir,
  });
  if (!imageModelConfig) return null;

  return {
    label: "Image to Code",
    name: "image_to_code",
    description:
      "Convert a screenshot or UI mockup into code. Supports html, react, vue, astro, svelte, and tailwind frameworks.",
    parameters: ImageToCodeToolSchema,
    execute: async (_toolCallId, args) => {
      const record = args && typeof args === "object" ? (args as Record<string, unknown>) : {};
      const imageRawInput = typeof record.image === "string" ? record.image.trim() : "";
      const imageRaw = imageRawInput.startsWith("@")
        ? imageRawInput.slice(1).trim()
        : imageRawInput;
      if (!imageRaw) throw new Error("image required");

      const framework: Framework =
        typeof record.framework === "string" &&
        SUPPORTED_FRAMEWORKS.includes(record.framework as Framework)
          ? (record.framework as Framework)
          : "html";
      const description =
        typeof record.description === "string" && record.description.trim()
          ? record.description.trim()
          : undefined;
      const modelOverride =
        typeof record.model === "string" && record.model.trim() ? record.model.trim() : undefined;

      const isDataUrl = /^data:/i.test(imageRaw);
      const isHttpUrl = /^https?:\/\//i.test(imageRaw);
      const sandboxRoot = options?.sandboxRoot?.trim();

      if (sandboxRoot && isHttpUrl) {
        throw new Error("Sandboxed image_to_code does not allow remote URLs.");
      }

      // Resolve the image path (same logic as image-tool)
      const resolvedImage = (() => {
        if (sandboxRoot) return imageRaw;
        if (imageRaw.startsWith("~")) return resolveUserPath(imageRaw);
        return imageRaw;
      })();

      let resolvedPath: string | null = null;
      if (!isDataUrl) {
        if (sandboxRoot) {
          const out = await assertSandboxPath({
            filePath: resolvedImage.startsWith("file://")
              ? resolvedImage.slice("file://".length)
              : resolvedImage,
            cwd: sandboxRoot,
            root: sandboxRoot,
          });
          resolvedPath = out.resolved;
        } else {
          resolvedPath = resolvedImage.startsWith("file://")
            ? resolvedImage.slice("file://".length)
            : resolvedImage;
        }
      }

      const media = isDataUrl
        ? decodeDataUrl(resolvedImage)
        : await loadWebMedia(resolvedPath ?? resolvedImage);
      if (media.kind !== "image") {
        throw new Error(`Unsupported media type: ${media.kind}`);
      }

      const mimeType =
        ("contentType" in media && media.contentType) ||
        ("mimeType" in media && media.mimeType) ||
        "image/png";
      const base64 = media.buffer.toString("base64");

      const prompt = buildCodeGenPrompt({ framework, description });

      const result = await runImagePrompt({
        cfg: options?.config,
        agentDir,
        imageModelConfig,
        modelOverride,
        prompt,
        base64,
        mimeType,
      });

      return {
        content: [{ type: "text", text: result.text }],
        details: {
          model: `${result.provider}/${result.model}`,
          framework,
          image: resolvedImage,
          attempts: result.attempts,
        },
      };
    },
  };
}

// Exported for testing
export const __testing = { buildCodeGenPrompt, FRAMEWORK_INSTRUCTIONS } as const;
