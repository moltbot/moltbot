import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const HASH_FILE = path.join(ROOT_DIR, "src/canvas-host/a2ui/.bundle.hash");
const OUTPUT_FILE = path.join(ROOT_DIR, "src/canvas-host/a2ui/a2ui.bundle.js");
const A2UI_RENDERER_DIR = path.join(ROOT_DIR, "vendor/a2ui/renderers/lit");
const A2UI_APP_DIR = path.join(ROOT_DIR, "apps/shared/MoltbotKit/Tools/CanvasA2UI");

async function exists(p: string) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  if (!(await exists(A2UI_RENDERER_DIR)) || !(await exists(A2UI_APP_DIR))) {
    console.log("A2UI sources missing; keeping prebuilt bundle.");
    process.exit(0);
  }

  const INPUT_PATHS = [
    path.join(ROOT_DIR, "package.json"),
    path.join(ROOT_DIR, "pnpm-lock.yaml"),
    A2UI_RENDERER_DIR,
    A2UI_APP_DIR,
  ];

  const currentHash = await computeHash(INPUT_PATHS);

  let skip = false;
  if (await exists(HASH_FILE)) {
    const previousHash = (await fs.readFile(HASH_FILE, "utf8")).trim();
    if (previousHash === currentHash && (await exists(OUTPUT_FILE))) {
      console.log("A2UI bundle up to date; skipping.");
      skip = true;
    }
  }

  if (!skip) {
    try {
      // We use `npx` or local `node_modules/.bin` executables.
      // Since we are running with pnpm, `tsc` and `rolldown` should be in path if run via pnpm exec or similar.
      // The bash script used `pnpm -s exec tsc`.
      
      console.log("Running tsc...");
      execSync(`pnpm -s exec tsc -p "${path.join(A2UI_RENDERER_DIR, "tsconfig.json")}"`, {
        stdio: "inherit",
        cwd: ROOT_DIR
      });

      console.log("Running rolldown...");
      // rolldown might need to be run via pnpm exec or npx if not in path
      execSync(`pnpm exec rolldown -c "${path.join(A2UI_APP_DIR, "rolldown.config.mjs")}"`, {
        stdio: "inherit",
        cwd: ROOT_DIR
      });

      await fs.writeFile(HASH_FILE, currentHash);
    } catch (e) {
      console.error("A2UI bundling failed. Re-run with: pnpm canvas:a2ui:bundle");
      console.error("If this persists, verify pnpm deps and try again.");
      process.exit(1);
    }
  }
}

async function computeHash(inputs: string[]) {
  const files: string[] = [];

  async function walk(entryPath: string) {
    const st = await fs.stat(entryPath);
    if (st.isDirectory()) {
      const entries = await fs.readdir(entryPath);
      for (const entry of entries) {
        await walk(path.join(entryPath, entry));
      }
    } else {
      files.push(entryPath);
    }
  }

  for (const input of inputs) {
    await walk(input);
  }

  // Normalize paths for consistent sorting
  files.sort((a, b) => normalize(a).localeCompare(normalize(b)));

  const hash = createHash("sha256");
  for (const filePath of files) {
    const rel = normalize(path.relative(ROOT_DIR, filePath));
    hash.update(rel);
    hash.update("\0");
    const content = await fs.readFile(filePath);
    hash.update(content);
    hash.update("\0");
  }

  return hash.digest("hex");
}

function normalize(p: string) {
  return p.split(path.sep).join("/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
