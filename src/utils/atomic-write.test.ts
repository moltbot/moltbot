import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { atomicWriteFile } from "./atomic-write.js";

describe("atomicWriteFile", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "atomic-write-test-"));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("writes content to target file atomically", async () => {
    const targetPath = path.join(tempDir, "test.txt");
    const content = "Hello, world!";

    await atomicWriteFile(targetPath, content);

    const result = await fs.readFile(targetPath, "utf8");
    expect(result).toBe(content);
  });

  it("overwrites existing file atomically", async () => {
    const targetPath = path.join(tempDir, "test.txt");
    const originalContent = "Original content";
    const newContent = "New content";

    // Write original
    await fs.writeFile(targetPath, originalContent, "utf8");
    expect(await fs.readFile(targetPath, "utf8")).toBe(originalContent);

    // Overwrite with atomic write
    await atomicWriteFile(targetPath, newContent);
    expect(await fs.readFile(targetPath, "utf8")).toBe(newContent);
  });

  it("cleans up temp file on write error", async () => {
    const targetPath = path.join(tempDir, "nonexistent", "test.txt");
    const content = "Test content";

    // Writing to nonexistent directory should fail
    await expect(atomicWriteFile(targetPath, content)).rejects.toThrow();

    // Verify no temp files left behind
    const files = await fs.readdir(tempDir);
    const tempFiles = files.filter((f) => f.includes(".tmp."));
    expect(tempFiles).toHaveLength(0);
  });

  it("handles concurrent writes (last write wins)", async () => {
    const targetPath = path.join(tempDir, "concurrent.txt");
    const writes = ["Write 1", "Write 2", "Write 3", "Write 4", "Write 5"];

    // Execute all writes concurrently
    await Promise.all(writes.map((content) => atomicWriteFile(targetPath, content)));

    // File should contain one of the writes (last one to complete)
    const result = await fs.readFile(targetPath, "utf8");
    expect(writes).toContain(result);

    // Verify no temp files left behind
    const files = await fs.readdir(tempDir);
    const tempFiles = files.filter((f) => f.includes(".tmp."));
    expect(tempFiles).toHaveLength(0);
  });

  it("preserves UTF-8 encoding correctly", async () => {
    const targetPath = path.join(tempDir, "unicode.txt");
    const content = "Hello 世界 🌍 Здравствуй мир";

    await atomicWriteFile(targetPath, content, "utf8");

    const result = await fs.readFile(targetPath, "utf8");
    expect(result).toBe(content);
  });

  it("respects custom encoding parameter", async () => {
    const targetPath = path.join(tempDir, "latin1.txt");
    const content = "Hello world";

    await atomicWriteFile(targetPath, content, "latin1");

    const result = await fs.readFile(targetPath, "latin1");
    expect(result).toBe(content);
  });

  it("throws original error when write fails", async () => {
    const targetPath = path.join(tempDir, "nonexistent", "deep", "path", "test.txt");
    const content = "Test content";

    await expect(atomicWriteFile(targetPath, content)).rejects.toThrow(/ENOENT|no such file/i);
  });

  it("handles empty content", async () => {
    const targetPath = path.join(tempDir, "empty.txt");
    const content = "";

    await atomicWriteFile(targetPath, content);

    const result = await fs.readFile(targetPath, "utf8");
    expect(result).toBe("");
  });

  it("handles large content", async () => {
    const targetPath = path.join(tempDir, "large.txt");
    // Create a large string (1MB)
    const content = "a".repeat(1024 * 1024);

    await atomicWriteFile(targetPath, content);

    const result = await fs.readFile(targetPath, "utf8");
    expect(result).toBe(content);
    expect(result.length).toBe(1024 * 1024);
  });
});
