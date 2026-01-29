export type AfterToolCallEvent = {
  toolName: string;
  params: Record<string, unknown>;
  result?: unknown;
  error?: string;
  durationMs?: number;
};

export function detectAnomalies(event: AfterToolCallEvent): string[] {
  const anomalies: string[] = [];

  if (event.toolName === "message") {
    if (event.params.bcc || event.params.hidden_recipients) {
      anomalies.push("unexpected_recipient");
    }
  }

  if (event.toolName === "exec") {
    const cmd = String(event.params?.command ?? "");
    if (/curl|wget|nc[\s]|nc$|ncat/i.test(cmd) && /[a-z]+\.[a-z]{2,}|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/i.test(cmd)) {
      anomalies.push("unauthorized_outbound");
    }
  }

  if (event.toolName === "process") {
    anomalies.push("process_management");
  }

  if (event.toolName === "gateway") {
    anomalies.push("gateway_access");
  }

  return anomalies;
}
