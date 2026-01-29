import { randomBytes } from "node:crypto";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";

/**
 * Instance nonce — regenerated each time the gateway server starts within
 * the process. ESM modules are cached for the process lifetime, so this
 * must be mutable and explicitly reset via `resetInstanceNonce()` during
 * shutdown. After an in-process restart (SIGUSR1), lock files written by
 * the previous server iteration carry a stale nonce, letting us detect
 * them even when the PID hasn't changed (common in containers where
 * PID = 1).
 */
let instanceNonce: string = randomBytes(12).toString("hex");

function resetInstanceNonce(): void {
  instanceNonce = randomBytes(12).toString("hex");
}

type LockFilePayload = {
  pid: number;
  createdAt: string;
  /** Instance nonce — absent in lock files written by older versions. */
  nonce?: string;
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

function isAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
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
    return {
      pid: parsed.pid,
      createdAt: parsed.createdAt,
      nonce: typeof parsed.nonce === "string" ? parsed.nonce : undefined,
    };
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
      await handle.writeFile(
        JSON.stringify(
          { pid: process.pid, nonce: instanceNonce, createdAt: new Date().toISOString() },
          null,
          2,
        ),
        "utf8",
      );
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
      const alive = payload?.pid ? isAlive(payload.pid) : false;

      // Nonce mismatch: lock was written by a previous server iteration of the
      // same process (e.g. PID 1 in a container after SIGUSR1).  The old
      // iteration is gone even though the PID is still alive, so treat the
      // lock as stale.  If the lock has no nonce (written by an older version)
      // we fall through to the existing pid+staleMs checks for backward compat.
      const nonceMismatch =
        payload?.nonce !== undefined &&
        payload.nonce !== instanceNonce &&
        payload.pid === process.pid;

      if (stale || !alive || nonceMismatch) {
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

/**
 * Release all held session write locks.
 *
 * Call this during gateway shutdown (e.g., before an in-process SIGUSR1
 * restart) to ensure on-disk `.lock` files are removed. Without this,
 * locks owned by PID 1 survive an in-process restart because
 * `isAlive(1)` returns true for the same process, making the lock
 * appear valid for up to `staleMs` (30 min).
 */
export async function releaseAllSessionWriteLocks(): Promise<void> {
  for (const [sessionFile, held] of HELD_LOCKS) {
    try {
      await held.handle.close();
    } catch {
      // Best effort - handle may already be closed.
    }
    try {
      await fs.rm(held.lockPath, { force: true });
    } catch {
      // Best effort - file may already be removed.
    }
    HELD_LOCKS.delete(sessionFile);
  }
  // Rotate the instance nonce AFTER all locks are cleaned up, so that any
  // lock files that survive this cleanup (e.g. due to fs errors) are
  // detectable as stale by the next server iteration. Rotating before
  // cleanup would let a concurrent acquirer see the old nonce as stale
  // and reclaim a lock we haven't finished releasing yet.
  resetInstanceNonce();
}
export const __testing = {
  cleanupSignals: [...CLEANUP_SIGNALS],
  handleTerminationSignal,
  releaseAllLocksSync,
  get instanceNonce() {
    return instanceNonce;
  },
};
