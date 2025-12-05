import fs from "node:fs/promises";
import path from "node:path";
import { CONFIG_DIR } from "../utils.js";
import type { IdentityMap, IdentityMapping } from "./types.js";

const IDENTITY_MAP_FILE = "identity-map.json";
const CURRENT_VERSION = 1;

/**
 * Get the path to the identity map file.
 */
function getIdentityMapPath(): string {
  return path.join(CONFIG_DIR, IDENTITY_MAP_FILE);
}

/**
 * Load the identity map from disk.
 * Returns empty map if file doesn't exist.
 */
export async function loadIdentityMap(): Promise<IdentityMap> {
  const filePath = getIdentityMapPath();

  try {
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content) as IdentityMap;

    // Validate version
    if (data.version !== CURRENT_VERSION) {
      throw new Error(
        `Unsupported identity map version: ${data.version} (expected ${CURRENT_VERSION})`,
      );
    }

    return data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist, return empty map
      return {
        version: CURRENT_VERSION,
        mappings: {},
      };
    }
    throw err;
  }
}

/**
 * Save the identity map to disk.
 */
export async function saveIdentityMap(map: IdentityMap): Promise<void> {
  const filePath = getIdentityMapPath();
  const dir = path.dirname(filePath);

  // Ensure directory exists
  await fs.mkdir(dir, { recursive: true });

  // Write atomically
  const content = JSON.stringify(map, null, 2);
  await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Get a mapping by shared ID.
 */
export async function getMapping(
  sharedId: string,
): Promise<IdentityMapping | null> {
  const map = await loadIdentityMap();
  return map.mappings[sharedId] ?? null;
}

/**
 * Create or update a mapping.
 */
export async function setMapping(mapping: IdentityMapping): Promise<void> {
  const map = await loadIdentityMap();

  // Update timestamp
  mapping.updatedAt = new Date().toISOString();
  if (!mapping.createdAt) {
    mapping.createdAt = mapping.updatedAt;
  }

  map.mappings[mapping.id] = mapping;
  await saveIdentityMap(map);
}

/**
 * Delete a mapping by shared ID.
 */
export async function deleteMapping(sharedId: string): Promise<boolean> {
  const map = await loadIdentityMap();

  if (!map.mappings[sharedId]) {
    return false;
  }

  delete map.mappings[sharedId];
  await saveIdentityMap(map);
  return true;
}

/**
 * List all mappings.
 */
export async function listMappings(): Promise<IdentityMapping[]> {
  const map = await loadIdentityMap();
  return Object.values(map.mappings);
}

/**
 * Find a mapping by provider identity.
 */
export async function findMappingByIdentity(
  provider: "whatsapp" | "telegram" | "twilio",
  identity: string,
): Promise<IdentityMapping | null> {
  const map = await loadIdentityMap();

  for (const mapping of Object.values(map.mappings)) {
    if (mapping.identities[provider] === identity) {
      return mapping;
    }
  }

  return null;
}
