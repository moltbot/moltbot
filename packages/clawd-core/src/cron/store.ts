import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { CronStoreFile } from "./types.js";

/**
 * Default cron store directory (configurable via constructor)
 */
export function getDefaultCronDir(configDir: string): string {
  return path.join(configDir, "cron");
}

/**
 * Default cron store path
 */
export function getDefaultCronStorePath(configDir: string): string {
  return path.join(getDefaultCronDir(configDir), "jobs.json");
}

/**
 * Resolve cron store path with ~ expansion
 */
export function resolveCronStorePath(
  storePath: string | undefined,
  configDir: string,
): string {
  if (storePath?.trim()) {
    const raw = storePath.trim();
    if (raw.startsWith("~")) {
      return path.resolve(raw.replace("~", os.homedir()));
    }
    return path.resolve(raw);
  }
  return getDefaultCronStorePath(configDir);
}

/**
 * Load cron store from disk
 */
export async function loadCronStore(storePath: string): Promise<CronStoreFile> {
  try {
    const raw = await fs.promises.readFile(storePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<CronStoreFile> | null;
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];
    return {
      version: 1,
      jobs: jobs.filter(Boolean) as CronStoreFile["jobs"],
    };
  } catch {
    return { version: 1, jobs: [] };
  }
}

/**
 * Save cron store to disk with atomic write
 */
export async function saveCronStore(
  storePath: string,
  store: CronStoreFile,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(storePath), { recursive: true });
  const tmp = `${storePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
  const json = JSON.stringify(store, null, 2);
  await fs.promises.writeFile(tmp, json, "utf-8");
  await fs.promises.rename(tmp, storePath);
  try {
    await fs.promises.copyFile(storePath, `${storePath}.bak`);
  } catch {
    // best-effort backup
  }
}
