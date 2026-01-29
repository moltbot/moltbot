import { createHash } from "node:crypto";
import { LocalReceiptStore } from "./stores/local.js";

export interface ActionReceipt {
  id: string;
  timestamp: string;
  sessionKey: string;
  tier: "low" | "medium" | "high";
  toolName: string;
  argumentsHash: string;
  resultHash: string;
  success: boolean;
  durationMs: number;
  anomalies: string[];
  daCommitment?: string;
}

export interface ReceiptStore {
  put(receipt: ActionReceipt): Promise<void>;
  get(id: string): Promise<ActionReceipt | null>;
  list(opts: { limit: number; offset: number }): Promise<ActionReceipt[]>;
  stats(): Promise<{ total: number; byTier: Record<string, number>; anomalyCount: number }>;
}

export function createReceiptStore(backend?: string): ReceiptStore {
  if (backend === "eigenda") {
    const { EigenDAReceiptStore } = require("./stores/eigenda.js");
    const proxyUrl = process.env.EIGENDA_PROXY_URL;
    if (!proxyUrl) {
      throw new Error("EIGENDA_PROXY_URL environment variable is required when using the eigenda backend");
    }
    return new EigenDAReceiptStore(proxyUrl);
  }
  return new LocalReceiptStore();
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function hashData(data: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(data) ?? ""))
    .digest("hex");
}
