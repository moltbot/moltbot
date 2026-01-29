import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Verify critical file integrity before npm package publishing.
 * Runs in the prepack hook to ensure all required files are present.
 */

function getRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function checkFile(filePath) {
  const fullPath = path.join(getRepoRoot(), filePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`❌ Missing critical file: ${filePath}`);
    return false;
  }
  return true;
}

function main() {
  const criticalFiles = [
    // CLI entry point dependencies
    "dist/entry.js",
    "moltbot.mjs",

    // Core runtime files
    "dist/cli/run-main.js",
    "dist/cli/profile.js",
    "dist/infra/env.js",
    "dist/infra/warnings.js",
    "dist/process/child-process-bridge.js",

    // Required configuration and metadata
    "package.json",
    "README.md",
    "CHANGELOG.md",

    // Postinstall scripts
    "scripts/postinstall.js",
    "scripts/setup-git-hooks.js",
  ];

  let allPresent = true;

  for (const file of criticalFiles) {
    if (!checkFile(file)) {
      allPresent = false;
    }
  }

  if (!allPresent) {
    console.error("\n❌ Package verification failed: missing critical files");
    console.error("Run 'pnpm build' to generate missing files");
    process.exit(1);
  }

  console.log("✅ Package verification passed: all critical files present");
}

main();
