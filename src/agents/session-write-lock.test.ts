import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  __testing,
  acquireSessionWriteLock,
  releaseAllSessionWriteLocks,
} from "./session-write-lock.js";

describe("acquireSessionWriteLock", () => {
  it("reuses locks across symlinked session paths", async () => {
    if (process.platform === "win32") {
      expect(true).toBe(true);
      return;
    }

    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-lock-"));
    try {
      const realDir = path.join(root, "real");
      const linkDir = path.join(root, "link");
      await fs.mkdir(realDir, { recursive: true });
      await fs.symlink(realDir, linkDir);

      const sessionReal = path.join(realDir, "sessions.json");
      const sessionLink = path.join(linkDir, "sessions.json");

      const lockA = await acquireSessionWriteLock({ sessionFile: sessionReal, timeoutMs: 500 });
      const lockB = await acquireSessionWriteLock({ sessionFile: sessionLink, timeoutMs: 500 });

      await lockB.release();
      await lockA.release();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("keeps the lock file until the last release", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-lock-"));
    try {
      const sessionFile = path.join(root, "sessions.json");
      const lockPath = `${sessionFile}.lock`;

      const lockA = await acquireSessionWriteLock({ sessionFile, timeoutMs: 500 });
      const lockB = await acquireSessionWriteLock({ sessionFile, timeoutMs: 500 });

      await expect(fs.access(lockPath)).resolves.toBeUndefined();
      await lockA.release();
      await expect(fs.access(lockPath)).resolves.toBeUndefined();
      await lockB.release();
      await expect(fs.access(lockPath)).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("reclaims stale lock files", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-lock-"));
    try {
      const sessionFile = path.join(root, "sessions.json");
      const lockPath = `${sessionFile}.lock`;
      await fs.writeFile(
        lockPath,
        JSON.stringify({ pid: 123456, createdAt: new Date(Date.now() - 60_000).toISOString() }),
        "utf8",
      );

      const lock = await acquireSessionWriteLock({ sessionFile, timeoutMs: 500, staleMs: 10 });
      const raw = await fs.readFile(lockPath, "utf8");
      const payload = JSON.parse(raw) as { pid: number };

      expect(payload.pid).toBe(process.pid);
      await lock.release();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("removes held locks on termination signals", async () => {
    const signals = ["SIGINT", "SIGTERM", "SIGQUIT", "SIGABRT"] as const;
    for (const signal of signals) {
      const root = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-lock-cleanup-"));
      try {
        const sessionFile = path.join(root, "sessions.json");
        const lockPath = `${sessionFile}.lock`;
        await acquireSessionWriteLock({ sessionFile, timeoutMs: 500 });
        const keepAlive = () => {};
        if (signal === "SIGINT") {
          process.on(signal, keepAlive);
        }

        __testing.handleTerminationSignal(signal);

        await expect(fs.stat(lockPath)).rejects.toThrow();
        if (signal === "SIGINT") {
          process.off(signal, keepAlive);
        }
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  });

  it("registers cleanup for SIGQUIT and SIGABRT", () => {
    expect(__testing.cleanupSignals).toContain("SIGQUIT");
    expect(__testing.cleanupSignals).toContain("SIGABRT");
  });
  it("cleans up locks on SIGINT without removing other handlers", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-lock-"));
    const originalKill = process.kill.bind(process) as typeof process.kill;
    const killCalls: Array<NodeJS.Signals | undefined> = [];
    let otherHandlerCalled = false;

    process.kill = ((pid: number, signal?: NodeJS.Signals) => {
      killCalls.push(signal);
      return true;
    }) as typeof process.kill;

    const otherHandler = () => {
      otherHandlerCalled = true;
    };

    process.on("SIGINT", otherHandler);

    try {
      const sessionFile = path.join(root, "sessions.json");
      const lockPath = `${sessionFile}.lock`;
      await acquireSessionWriteLock({ sessionFile, timeoutMs: 500 });

      process.emit("SIGINT");

      await expect(fs.access(lockPath)).rejects.toThrow();
      expect(otherHandlerCalled).toBe(true);
      expect(killCalls).toEqual([]);
    } finally {
      process.off("SIGINT", otherHandler);
      process.kill = originalKill;
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("cleans up locks on exit", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-lock-"));
    try {
      const sessionFile = path.join(root, "sessions.json");
      const lockPath = `${sessionFile}.lock`;
      await acquireSessionWriteLock({ sessionFile, timeoutMs: 500 });

      process.emit("exit", 0);

      await expect(fs.access(lockPath)).rejects.toThrow();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
  it("keeps other signal listeners registered", () => {
    const keepAlive = () => {};
    process.on("SIGINT", keepAlive);

    __testing.handleTerminationSignal("SIGINT");

    expect(process.listeners("SIGINT")).toContain(keepAlive);
    process.off("SIGINT", keepAlive);
  });

  it("reclaims lock with same PID but different nonce (stale from prior boot)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-lock-nonce-"));
    try {
      const sessionFile = path.join(root, "sessions.json");
      const lockPath = `${sessionFile}.lock`;

      // Simulate a lock left by a previous boot iteration: same PID, different nonce
      await fs.writeFile(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          nonce: "stale-nonce-from-previous-boot",
          createdAt: new Date().toISOString(),
        }),
        "utf8",
      );

      // Should reclaim the lock despite same PID and fresh createdAt
      const lock = await acquireSessionWriteLock({ sessionFile, timeoutMs: 2000 });
      const raw = await fs.readFile(lockPath, "utf8");
      const payload = JSON.parse(raw) as { pid: number; nonce: string };

      expect(payload.pid).toBe(process.pid);
      expect(payload.nonce).toBe(__testing.instanceNonce);
      await lock.release();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("does not reclaim lock with matching nonce (held by current boot)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-lock-nonce-current-"));
    try {
      const sessionFile = path.join(root, "sessions.json");

      // Acquire normally — writes current nonce
      const lock = await acquireSessionWriteLock({ sessionFile, timeoutMs: 500 });

      // A second acquire on a different normalized path pointing to the same
      // file should reuse the in-memory held lock (already tested elsewhere),
      // but if we manually simulate a contention scenario by NOT going through
      // the in-memory path, the nonce check should NOT treat our own lock as
      // stale. We verify indirectly: the lock file should contain our nonce.
      const lockPath = `${sessionFile}.lock`;
      const raw = await fs.readFile(lockPath, "utf8");
      const payload = JSON.parse(raw) as { pid: number; nonce: string };

      expect(payload.nonce).toBe(__testing.instanceNonce);
      await lock.release();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("falls back to pid+staleMs for locks without a nonce (backward compat)", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-lock-no-nonce-"));
    try {
      const sessionFile = path.join(root, "sessions.json");
      const lockPath = `${sessionFile}.lock`;

      // Old-format lock: no nonce, same PID, recent timestamp
      // This should NOT be reclaimed (backward compat: no nonce → skip nonce check)
      await fs.writeFile(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          createdAt: new Date().toISOString(),
        }),
        "utf8",
      );

      // With a short timeout this should fail — lock appears valid (same PID, alive, not stale)
      await expect(
        acquireSessionWriteLock({ sessionFile, timeoutMs: 200, staleMs: 60_000 }),
      ).rejects.toThrow(/locked/);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("rotates instance nonce on releaseAllSessionWriteLocks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-lock-nonce-rotate-"));
    try {
      const sessionFile = path.join(root, "sessions.json");

      // Acquire a lock — captures current nonce
      const nonceBefore = __testing.instanceNonce;
      await acquireSessionWriteLock({ sessionFile, timeoutMs: 500 });

      // Release all — should rotate the nonce
      await releaseAllSessionWriteLocks();
      const nonceAfter = __testing.instanceNonce;

      expect(nonceAfter).not.toBe(nonceBefore);

      // A stale lock file with the OLD nonce should now be reclaimable
      const lockPath = `${sessionFile}.lock`;
      await fs.writeFile(
        lockPath,
        JSON.stringify({
          pid: process.pid,
          nonce: nonceBefore,
          createdAt: new Date().toISOString(),
        }),
        "utf8",
      );

      const lock = await acquireSessionWriteLock({ sessionFile, timeoutMs: 2000 });
      const raw = await fs.readFile(lockPath, "utf8");
      const payload = JSON.parse(raw) as { pid: number; nonce: string };
      expect(payload.nonce).toBe(nonceAfter);
      await lock.release();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  it("releaseAllSessionWriteLocks removes all held locks", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "moltbot-lock-release-all-"));
    try {
      const sessionA = path.join(root, "a.json");
      const sessionB = path.join(root, "b.json");
      const lockA = `${sessionA}.lock`;
      const lockB = `${sessionB}.lock`;

      await acquireSessionWriteLock({ sessionFile: sessionA, timeoutMs: 500 });
      await acquireSessionWriteLock({ sessionFile: sessionB, timeoutMs: 500 });

      // Both lock files should exist
      await expect(fs.access(lockA)).resolves.toBeUndefined();
      await expect(fs.access(lockB)).resolves.toBeUndefined();

      await releaseAllSessionWriteLocks();

      // Both lock files should be removed
      await expect(fs.access(lockA)).rejects.toThrow();
      await expect(fs.access(lockB)).rejects.toThrow();

      // Should be able to re-acquire after release
      const lock = await acquireSessionWriteLock({ sessionFile: sessionA, timeoutMs: 500 });
      await lock.release();
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
