import path from "node:path";

import { STATE_DIR } from "../config/paths.js";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";

export type HookRunRecord = {
  runId: string;
  sessionKey: string;
  jobName: string;
  cleanup: "delete" | "keep";
  cleanupDelayMinutes: number;
  createdAt: number;
  endedAt?: number;
  cleanupAtMs?: number;
  cleanupHandled?: boolean;
};

type PersistedHookRunRegistry = {
  version: 1;
  runs: Record<string, HookRunRecord>;
};

const REGISTRY_VERSION = 1 as const;

export function resolveHookRunRegistryPath(): string {
  return path.join(STATE_DIR, "hooks", "hook-runs.json");
}

export function loadHookRunRegistryFromDisk(): Map<string, HookRunRecord> {
  const pathname = resolveHookRunRegistryPath();
  const raw = loadJsonFile(pathname);
  if (!raw || typeof raw !== "object") return new Map();
  const record = raw as Partial<PersistedHookRunRegistry>;
  if (record.version !== 1) return new Map();
  const runsRaw = record.runs;
  if (!runsRaw || typeof runsRaw !== "object") return new Map();
  const out = new Map<string, HookRunRecord>();
  for (const [runId, entry] of Object.entries(runsRaw)) {
    if (!entry || typeof entry !== "object") continue;
    const typed = entry as HookRunRecord;
    if (!typed.runId || typeof typed.runId !== "string") continue;
    out.set(runId, typed);
  }
  return out;
}

export function saveHookRunRegistryToDisk(runs: Map<string, HookRunRecord>): void {
  const pathname = resolveHookRunRegistryPath();
  const serialized: Record<string, HookRunRecord> = {};
  for (const [runId, entry] of runs.entries()) {
    serialized[runId] = entry;
  }
  const out: PersistedHookRunRegistry = {
    version: REGISTRY_VERSION,
    runs: serialized,
  };
  saveJsonFile(pathname, out);
}
