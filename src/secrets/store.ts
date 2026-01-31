/**
 * Secrets store - persistent storage for user secrets.
 *
 * Secrets are stored in ~/.openclaw/secrets.json
 * Values are stored in plaintext (file permissions should be 600).
 *
 * Future: could add encryption at rest with a master password or system keyring.
 */

import fs from "node:fs";
import path from "node:path";
import lockfile from "proper-lockfile";
import { STATE_DIR } from "../config/paths.js";
import { loadJsonFile, saveJsonFile } from "../infra/json-file.js";
import type { SecretEntry, SecretMetadata, SecretsStore } from "./types.js";
import { SECRETS_STORE_VERSION } from "./types.js";

const SECRETS_FILE = "secrets.json";
const LOCK_OPTIONS = {
  retries: { retries: 5, minTimeout: 50, maxTimeout: 500 },
  stale: 10000,
};

export function resolveSecretsPath(): string {
  return path.join(STATE_DIR, SECRETS_FILE);
}

function ensureSecretsFile(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  }
  if (!fs.existsSync(filePath)) {
    const empty: SecretsStore = { version: SECRETS_STORE_VERSION, secrets: {} };
    fs.writeFileSync(filePath, JSON.stringify(empty, null, 2), { mode: 0o600 });
  }
}

function coerceSecretsStore(raw: unknown): SecretsStore | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (!record.secrets || typeof record.secrets !== "object") {
    return null;
  }
  const secrets = record.secrets as Record<string, unknown>;
  const normalized: Record<string, SecretEntry> = {};

  for (const [name, entry] of Object.entries(secrets)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const typed = entry as Partial<SecretEntry>;
    if (typeof typed.value !== "string") {
      continue;
    }
    normalized[name] = {
      value: typed.value,
      description: typed.description,
      createdAt: typed.createdAt ?? new Date().toISOString(),
      updatedAt: typed.updatedAt ?? new Date().toISOString(),
    };
  }

  return {
    version: Number(record.version ?? SECRETS_STORE_VERSION),
    secrets: normalized,
  };
}

export function loadSecretsStore(): SecretsStore {
  const filePath = resolveSecretsPath();
  ensureSecretsFile(filePath);
  const raw = loadJsonFile(filePath);
  const store = coerceSecretsStore(raw);
  return store ?? { version: SECRETS_STORE_VERSION, secrets: {} };
}

export function saveSecretsStore(store: SecretsStore): void {
  const filePath = resolveSecretsPath();
  ensureSecretsFile(filePath);
  saveJsonFile(filePath, store);
  // Ensure restrictive permissions
  fs.chmodSync(filePath, 0o600);
}

export async function updateSecretsStoreWithLock(
  updater: (store: SecretsStore) => boolean,
): Promise<SecretsStore | null> {
  const filePath = resolveSecretsPath();
  ensureSecretsFile(filePath);

  let release: (() => Promise<void>) | undefined;
  try {
    release = await lockfile.lock(filePath, LOCK_OPTIONS);
    const store = loadSecretsStore();
    const shouldSave = updater(store);
    if (shouldSave) {
      saveSecretsStore(store);
    }
    return store;
  } catch {
    return null;
  } finally {
    if (release) {
      try {
        await release();
      } catch {
        // ignore unlock errors
      }
    }
  }
}

// --- Public API ---

export function getSecret(name: string): string | undefined {
  const store = loadSecretsStore();
  return store.secrets[name]?.value;
}

export async function setSecret(
  name: string,
  value: string,
  description?: string,
): Promise<boolean> {
  const result = await updateSecretsStoreWithLock((store) => {
    const now = new Date().toISOString();
    const existing = store.secrets[name];
    store.secrets[name] = {
      value,
      description: description ?? existing?.description,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    return true;
  });
  return result !== null;
}

export async function removeSecret(name: string): Promise<boolean> {
  const result = await updateSecretsStoreWithLock((store) => {
    if (!(name in store.secrets)) {
      return false;
    }
    delete store.secrets[name];
    return true;
  });
  return result !== null;
}

export function listSecrets(): SecretMetadata[] {
  const store = loadSecretsStore();
  return Object.entries(store.secrets).map(([name, entry]) => ({
    name,
    description: entry.description,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }));
}

export function hasSecret(name: string): boolean {
  const store = loadSecretsStore();
  return name in store.secrets;
}
