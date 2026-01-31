import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

type LockFilePayload = {
  pid: number;
  createdAt: string;
  comm?: string; // Process command name for PID reuse detection
};

type HeldLock = {
  count: number;
  handle: fs.FileHandle;
  lockPath: string;
};

const HELD_LOCKS = new Map<string, HeldLock>();
const CLEANUP_SIGNALS = ["SIGINT", "SIGTERM", "SIGQUIT", "SIGABRT"] as const;
type CleanupSignal = (typeof CLEANUP_SIGNALS)[number];
const cleanupHandlers = new Map<CleanupSignal, () => void>();

/**
 * Get the command name of the current process.
 * Used to identify the lock holder and detect PID reuse after container rebuilds.
 */
function getProcessComm(): string {
  // Use the basename of the executable or argv[1] as the command name
  // This is more portable than /proc/pid/comm which is Linux-only
  const argv0 = process.argv0 || process.argv[0] || "";
  const script = process.argv[1] || "";
  // Prefer the script name if available (e.g., "openclaw" or "gateway")
  const name = script ? path.basename(script) : path.basename(argv0);
  // Truncate to match /proc/pid/comm format (15 chars max on Linux)
  return name.slice(0, 15);
}

/**
 * Get the command name of a specific PID.
 * Returns null if the PID doesn't exist or the command can't be read.
 */
function getProcessCommForPid(pid: number): string | null {
  // Try Linux /proc filesystem first
  try {
    const comm = fsSync.readFileSync(`/proc/${pid}/comm`, "utf8").trim();
    return comm;
  } catch {
    // /proc not available (macOS, Windows) or PID doesn't exist
  }

  // On non-Linux platforms, we can't reliably get the command name of another process
  // without spawning a subprocess. Return null to fall back to PID-only check.
  return null;
}

/**
 * Check if a process is alive and optionally verify it's the expected process.
 * If expectedComm is provided and the platform supports it (Linux), verify
 * that the PID's command matches. This prevents false positives when PIDs
 * are reused after container rebuilds.
 */
function isAlive(pid: number, expectedComm?: string): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }

  // PID exists - verify it's the same process if we have a command to compare
  if (expectedComm) {
    const actualComm = getProcessCommForPid(pid);
    // If we can get the command (Linux), verify it matches
    if (actualComm !== null && actualComm !== expectedComm) {
      // PID was reused by a different process - treat as dead
      return false;
    }
    // On non-Linux platforms (actualComm === null), fall back to PID-only check
  }

  return true;
}

/**
 * Synchronously release all held locks.
 * Used during process exit when async operations aren't reliable.
 */
function releaseAllLocksSync(): void {
  for (const [sessionFile, held] of HELD_LOCKS) {
    try {
      if (typeof held.handle.close === "function") {
        void held.handle.close().catch(() => {});
      }
    } catch {
      // Ignore errors during cleanup - best effort
    }
    try {
      fsSync.rmSync(held.lockPath, { force: true });
    } catch {
      // Ignore errors during cleanup - best effort
    }
    HELD_LOCKS.delete(sessionFile);
  }
}

let cleanupRegistered = false;

function handleTerminationSignal(signal: CleanupSignal): void {
  releaseAllLocksSync();
  const shouldReraise = process.listenerCount(signal) === 1;
  if (shouldReraise) {
    const handler = cleanupHandlers.get(signal);
    if (handler) process.off(signal, handler);
    try {
      process.kill(process.pid, signal);
    } catch {
      // Ignore errors during shutdown
    }
  }
}

function registerCleanupHandlers(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  // Cleanup on normal exit and process.exit() calls
  process.on("exit", () => {
    releaseAllLocksSync();
  });

  // Handle termination signals
  for (const signal of CLEANUP_SIGNALS) {
    try {
      const handler = () => handleTerminationSignal(signal);
      cleanupHandlers.set(signal, handler);
      process.on(signal, handler);
    } catch {
      // Ignore unsupported signals on this platform.
    }
  }
}

async function readLockPayload(lockPath: string): Promise<LockFilePayload | null> {
  try {
    const raw = await fs.readFile(lockPath, "utf8");
    const parsed = JSON.parse(raw) as Partial<LockFilePayload>;
    if (typeof parsed.pid !== "number") return null;
    if (typeof parsed.createdAt !== "string") return null;
    const comm = typeof parsed.comm === "string" ? parsed.comm : undefined;
    return { pid: parsed.pid, createdAt: parsed.createdAt, comm };
  } catch {
    return null;
  }
}

export async function acquireSessionWriteLock(params: {
  sessionFile: string;
  timeoutMs?: number;
  staleMs?: number;
}): Promise<{
  release: () => Promise<void>;
}> {
  registerCleanupHandlers();
  const timeoutMs = params.timeoutMs ?? 10_000;
  const staleMs = params.staleMs ?? 30 * 60 * 1000;
  const sessionFile = path.resolve(params.sessionFile);
  const sessionDir = path.dirname(sessionFile);
  await fs.mkdir(sessionDir, { recursive: true });
  let normalizedDir = sessionDir;
  try {
    normalizedDir = await fs.realpath(sessionDir);
  } catch {
    // Fall back to the resolved path if realpath fails (permissions, transient FS).
  }
  const normalizedSessionFile = path.join(normalizedDir, path.basename(sessionFile));
  const lockPath = `${normalizedSessionFile}.lock`;

  const held = HELD_LOCKS.get(normalizedSessionFile);
  if (held) {
    held.count += 1;
    return {
      release: async () => {
        const current = HELD_LOCKS.get(normalizedSessionFile);
        if (!current) return;
        current.count -= 1;
        if (current.count > 0) return;
        HELD_LOCKS.delete(normalizedSessionFile);
        await current.handle.close();
        await fs.rm(current.lockPath, { force: true });
      },
    };
  }

  const startedAt = Date.now();
  let attempt = 0;
  while (Date.now() - startedAt < timeoutMs) {
    attempt += 1;
    try {
      const handle = await fs.open(lockPath, "wx");
      const lockPayload: LockFilePayload = {
        pid: process.pid,
        createdAt: new Date().toISOString(),
        comm: getProcessComm(),
      };
      await handle.writeFile(JSON.stringify(lockPayload, null, 2), "utf8");
      HELD_LOCKS.set(normalizedSessionFile, { count: 1, handle, lockPath });
      return {
        release: async () => {
          const current = HELD_LOCKS.get(normalizedSessionFile);
          if (!current) return;
          current.count -= 1;
          if (current.count > 0) return;
          HELD_LOCKS.delete(normalizedSessionFile);
          await current.handle.close();
          await fs.rm(current.lockPath, { force: true });
        },
      };
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if (code !== "EEXIST") throw err;
      const payload = await readLockPayload(lockPath);
      const createdAt = payload?.createdAt ? Date.parse(payload.createdAt) : NaN;
      const stale = !Number.isFinite(createdAt) || Date.now() - createdAt > staleMs;
      // Pass comm to isAlive to detect PID reuse after container rebuilds
      const alive = payload?.pid ? isAlive(payload.pid, payload.comm) : false;
      if (stale || !alive) {
        await fs.rm(lockPath, { force: true });
        continue;
      }

      const delay = Math.min(1000, 50 * attempt);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  const payload = await readLockPayload(lockPath);
  const owner = payload?.pid ? `pid=${payload.pid}` : "unknown";
  throw new Error(`session file locked (timeout ${timeoutMs}ms): ${owner} ${lockPath}`);
}

export const __testing = {
  cleanupSignals: [...CLEANUP_SIGNALS],
  handleTerminationSignal,
  releaseAllLocksSync,
  getProcessComm,
  getProcessCommForPid,
  isAlive,
};
