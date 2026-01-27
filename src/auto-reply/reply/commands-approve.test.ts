import { describe, expect, it, vi, beforeEach } from "vitest";

import type { ClawdbotConfig } from "../../config/config.js";
import type { MsgContext } from "../templating.js";
import { buildCommandContext, handleCommands } from "./commands.js";
import { parseInlineDirectives } from "./directive-handling.js";
import { callGateway } from "../../gateway/call.js";
import * as approvalForwarder from "../../infra/exec-approval-forwarder.js";

vi.mock("../../gateway/call.js", () => ({
  callGateway: vi.fn(),
}));

vi.mock("../../infra/exec-approval-forwarder.js", () => ({
  getBatchApprovalIds: vi.fn(),
  deleteBatch: vi.fn(),
  updateBatchApprovalIds: vi.fn(),
}));

function buildParams(commandBody: string, cfg: ClawdbotConfig, ctxOverrides?: Partial<MsgContext>) {
  const ctx = {
    Body: commandBody,
    CommandBody: commandBody,
    CommandSource: "text",
    CommandAuthorized: true,
    Provider: "whatsapp",
    Surface: "whatsapp",
    ...ctxOverrides,
  } as MsgContext;

  const command = buildCommandContext({
    ctx,
    cfg,
    isGroup: false,
    triggerBodyNormalized: commandBody.trim().toLowerCase(),
    commandAuthorized: true,
  });

  return {
    ctx,
    cfg,
    command,
    directives: parseInlineDirectives(commandBody),
    elevated: { enabled: true, allowed: true, failures: [] },
    sessionKey: "agent:main:main",
    workspaceDir: "/tmp",
    defaultGroupActivation: () => "mention",
    resolvedVerboseLevel: "off" as const,
    resolvedReasoningLevel: "off" as const,
    resolveDefaultThinkingLevel: async () => undefined,
    provider: "whatsapp",
    model: "test-model",
    contextTokens: 0,
    isGroup: false,
  };
}

describe("/approve command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid usage", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as ClawdbotConfig;
    const params = buildParams("/approve", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("Usage: /approve");
  });

  it("submits approval", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as ClawdbotConfig;
    const params = buildParams("/approve abc allow-once", cfg, { SenderId: "123" });

    const mockCallGateway = vi.mocked(callGateway);
    mockCallGateway.mockResolvedValueOnce({ ok: true });

    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("Exec approval allow-once submitted");
    expect(mockCallGateway).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "exec.approval.resolve",
        params: { id: "abc", decision: "allow-once" },
      }),
    );
  });

  it("does not intercept /approve-batch", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as ClawdbotConfig;
    const params = buildParams("/approve-batch test-batch allow-once", cfg, { SenderId: "123" });

    vi.mocked(approvalForwarder.getBatchApprovalIds).mockReturnValue(null);

    const result = await handleCommands(params);
    // Should be handled by /approve-batch, not /approve
    expect(result.reply?.text).toContain("Batch not found");
    expect(result.reply?.text).not.toContain("Usage: /approve");
  });
});

describe("/approve-batch command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects invalid usage", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as ClawdbotConfig;
    const params = buildParams("/approve-batch", cfg);
    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("Usage: /approve-batch");
  });

  it("rejects unknown batch ID", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as ClawdbotConfig;
    const params = buildParams("/approve-batch unknown-batch allow-once", cfg, { SenderId: "123" });

    vi.mocked(approvalForwarder.getBatchApprovalIds).mockReturnValue(null);

    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("Batch not found or expired");
  });

  it("approves all commands in batch", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as ClawdbotConfig;
    const params = buildParams("/approve-batch batch-123 allow-once", cfg, { SenderId: "123" });

    vi.mocked(approvalForwarder.getBatchApprovalIds).mockReturnValue(["id1", "id2", "id3"]);
    const mockCallGateway = vi.mocked(callGateway);
    mockCallGateway.mockResolvedValue({ ok: true });

    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("3 commands approved");
    expect(mockCallGateway).toHaveBeenCalledTimes(3);
    expect(approvalForwarder.deleteBatch).toHaveBeenCalledWith("batch-123");
    expect(approvalForwarder.updateBatchApprovalIds).not.toHaveBeenCalled();
  });

  it("denies all commands in batch", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as ClawdbotConfig;
    const params = buildParams("/approve-batch batch-456 deny", cfg, { SenderId: "123" });

    vi.mocked(approvalForwarder.getBatchApprovalIds).mockReturnValue(["id1", "id2"]);
    const mockCallGateway = vi.mocked(callGateway);
    mockCallGateway.mockResolvedValue({ ok: true });

    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("2 commands approved");
    expect(mockCallGateway).toHaveBeenCalledTimes(2);
    expect(approvalForwarder.deleteBatch).toHaveBeenCalledWith("batch-456");
    expect(approvalForwarder.updateBatchApprovalIds).not.toHaveBeenCalled();
  });

  it("reports partial failures", async () => {
    const cfg = {
      commands: { text: true },
      channels: { whatsapp: { allowFrom: ["*"] } },
    } as ClawdbotConfig;
    const params = buildParams("/approve-batch batch-789 allow-once", cfg, { SenderId: "123" });

    vi.mocked(approvalForwarder.getBatchApprovalIds).mockReturnValue(["id1", "id2", "id3"]);
    const mockCallGateway = vi.mocked(callGateway);
    mockCallGateway
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("Failed"))
      .mockResolvedValueOnce({ ok: true });

    const result = await handleCommands(params);
    expect(result.shouldContinue).toBe(false);
    expect(result.reply?.text).toContain("2 succeeded");
    expect(result.reply?.text).toContain("1 failed");
    expect(approvalForwarder.deleteBatch).not.toHaveBeenCalled();
    expect(approvalForwarder.updateBatchApprovalIds).toHaveBeenCalledWith("batch-789", ["id2"]);
  });
});
