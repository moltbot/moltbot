import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Tests for the verify-package.js script functionality.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

describe("verify-package script", () => {
  it("should list dist/entry.js in package.json files array", () => {
    const pkgPath = path.join(repoRoot, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

    expect(pkg.files).toBeDefined();
    expect(pkg.files).toContain("dist/entry.js");
  });

  it("should have prepack script that includes verification", () => {
    const pkgPath = path.join(repoRoot, "package.json");
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));

    expect(pkg.scripts.prepack).toBeDefined();
    expect(pkg.scripts.prepack).toContain("node scripts/verify-package.js");
  });

  it("should have verify-package.js script", () => {
    const scriptPath = path.join(repoRoot, "scripts/verify-package.js");
    expect(fs.existsSync(scriptPath)).toBe(true);
  });

  it("verify-package.js should be executable by Node", () => {
    const scriptPath = path.join(repoRoot, "scripts/verify-package.js");
    const content = fs.readFileSync(scriptPath, "utf-8");

    // Verify it's an ES module
    expect(content).toContain("import ");
    // Verify it has a main function
    expect(content).toContain("function main()");
    // Verify it checks critical files
    expect(content).toContain("dist/entry.js");
  });
});
