import { vi } from "vitest";

const stubTool = (name: string) => ({
  name,
  description: `${name} stub`,
  parameters: { type: "object", properties: {} },
  execute: vi.fn(),
});

vi.mock("../tools/browser-tool.js", () => ({
  createBrowserTool: () => stubTool("browser"),
}));

vi.mock("../tools/canvas-tool.js", () => ({
  createCanvasTool: () => stubTool("canvas"),
}));

vi.mock("../tools/image-tool.js", () => ({
  createImageTool: () => stubTool("image"),
  resolveImageModelConfigForTool: () => null,
  runImagePrompt: vi.fn(),
}));

vi.mock("../tools/image-to-code-tool.js", () => ({
  createImageToCodeTool: () => null,
}));

vi.mock("../tools/sessions-spawn-batch-tool.js", () => ({
  createSessionsSpawnBatchTool: () => stubTool("sessions_spawn_batch"),
}));

vi.mock("../tools/web-tools.js", () => ({
  createWebSearchTool: () => null,
  createWebFetchTool: () => null,
}));

vi.mock("../../plugins/tools.js", () => ({
  resolvePluginTools: () => [],
  getPluginToolMeta: () => undefined,
}));
