import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const LINT_EXTENSIONS = new Set([".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"]);

function getRepoRoot() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..");
}

function runGitCommand(args, options = {}) {
  return spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf-8",
    stdio: options.stdio ?? "pipe",
  });
}

function splitNullDelimited(value) {
  if (!value) return [];
  const text = String(value);
  return text.split("\0").filter(Boolean);
}

function normalizeGitPath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function filterLintTargets(paths) {
  return paths
    .map(normalizeGitPath)
    .filter((filePath) =>
      (filePath.startsWith("src/") ||
        filePath.startsWith("test/") ||
        filePath.startsWith("ui/src/")) &&
      LINT_EXTENSIONS.has(path.posix.extname(filePath)),
    );
}

function resolveOxlintCommand(repoRoot) {
  const binName = process.platform === "win32" ? "oxlint.cmd" : "oxlint";
  const local = path.join(repoRoot, "node_modules", ".bin", binName);
  if (fs.existsSync(local)) {
    return { command: local, args: [] };
  }

  const result = spawnSync("oxlint", ["--version"], { stdio: "ignore" });
  if (result.status === 0) {
    return { command: "oxlint", args: [] };
  }

  return null;
}

function getGitPaths(args, repoRoot) {
  const result = runGitCommand(args, { cwd: repoRoot });
  if (result.status !== 0) return [];
  return splitNullDelimited(result.stdout ?? "");
}

function lintFiles(repoRoot, oxlint, files) {
  const result = spawnSync(oxlint.command, [...oxlint.args, ...files], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  return result.status === 0;
}

function main() {
  const repoRoot = getRepoRoot();
  const staged = getGitPaths(
    ["diff", "--cached", "--name-only", "-z", "--diff-filter=ACMR"],
    repoRoot,
  );
  const targets = filterLintTargets(staged);
  if (targets.length === 0) return;

  const oxlint = resolveOxlintCommand(repoRoot);
  if (!oxlint) {
    process.stderr.write("[pre-commit] oxlint not found; skipping lint.\n");
    return;
  }

  if (!lintFiles(repoRoot, oxlint, targets)) {
    process.exitCode = 1;
  }
}

export {
  filterLintTargets,
  getRepoRoot,
  normalizeGitPath,
  resolveOxlintCommand,
  splitNullDelimited,
};

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main();
}
