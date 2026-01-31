#!/usr/bin/env node
/**
 * Termux-compatible runner for Moltbot
 *
 * This script bypasses native module requirements that don't work on Android/Termux:
 * - Uses tsx instead of tsgo (@typescript/native-preview doesn't support Android)
 * - Sets environment flags to handle missing native modules gracefully
 */

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(__dirname);

const args = process.argv.slice(2);
const env = {
  ...process.env,
  // Skip native preview compiler
  CLAWDBOT_TS_COMPILER: "tsc",
  // Disable features that require unavailable native modules
  CLAWDBOT_DISABLE_NATIVE_CLIPBOARD: "1",
};

// Entry points to try (in order)
const entryPoints = [
  path.join(repoRoot, "src", "cli", "program.ts"),
  path.join(repoRoot, "src", "index.ts"),
];

const findEntry = () => {
  for (const entry of entryPoints) {
    if (fs.existsSync(entry)) {
      return entry;
    }
  }
  return null;
};

const entryPoint = findEntry();

if (!entryPoint) {
  console.error("[moltbot-termux] Could not find entry point");
  process.exit(1);
}

console.error(`[moltbot-termux] Running: ${entryPoint}`);

// Use tsx to run TypeScript directly
const tsxPath = path.join(repoRoot, "node_modules", ".bin", "tsx");
const tsxCmd = process.platform === "win32" ? "tsx.cmd" : "tsx";

const child = spawn(process.execPath, [tsxPath, entryPoint, ...args], {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.exit(1);
  }
  process.exit(code ?? 1);
});
