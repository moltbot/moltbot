import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createMultiEditTool } from "./multi-edit.js";

describe("multi_edit tool", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "multi-edit-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("applies multiple edits sequentially", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "hello world\nfoo bar\nbaz qux", "utf-8");

    const tool = createMultiEditTool({ cwd: tmpDir });
    const result = await tool.execute("call-1", {
      filePath: "test.txt",
      edits: [
        { oldString: "hello", newString: "hi" },
        { oldString: "foo", newString: "FOO" },
        { oldString: "baz", newString: "BAZ" },
      ],
    });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("hi world\nFOO bar\nBAZ qux");
    expect(result.details?.appliedEdits).toBe(3);
    expect(result.details?.failedEdits).toHaveLength(0);
  });

  it("applies replaceAll when specified", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "foo foo foo", "utf-8");

    const tool = createMultiEditTool({ cwd: tmpDir });
    await tool.execute("call-2", {
      filePath: "test.txt",
      edits: [{ oldString: "foo", newString: "bar", replaceAll: true }],
    });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("bar bar bar");
  });

  it("replaces only first occurrence by default", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "foo foo foo", "utf-8");

    const tool = createMultiEditTool({ cwd: tmpDir });
    await tool.execute("call-3", {
      filePath: "test.txt",
      edits: [{ oldString: "foo", newString: "bar" }],
    });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("bar foo foo");
  });

  it("reports failed edits when oldString not found", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "hello world", "utf-8");

    const tool = createMultiEditTool({ cwd: tmpDir });
    const result = await tool.execute("call-4", {
      filePath: "test.txt",
      edits: [
        { oldString: "hello", newString: "hi" },
        { oldString: "notfound", newString: "x" },
      ],
    });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("hi world");
    expect(result.details?.appliedEdits).toBe(1);
    expect(result.details?.failedEdits).toHaveLength(1);
    expect(result.details?.failedEdits[0].index).toBe(1);
  });

  it("throws when all edits fail", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "hello world", "utf-8");

    const tool = createMultiEditTool({ cwd: tmpDir });
    await expect(
      tool.execute("call-5", {
        filePath: "test.txt",
        edits: [{ oldString: "notfound", newString: "x" }],
      }),
    ).rejects.toThrow(/All 1 edits failed/);
  });

  it("throws when file not found", async () => {
    const tool = createMultiEditTool({ cwd: tmpDir });
    await expect(
      tool.execute("call-6", {
        filePath: "nonexistent.txt",
        edits: [{ oldString: "a", newString: "b" }],
      }),
    ).rejects.toThrow(/File not found/);
  });

  it("skips no-op edits where oldString equals newString", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "hello world", "utf-8");

    const tool = createMultiEditTool({ cwd: tmpDir });
    const result = await tool.execute("call-7", {
      filePath: "test.txt",
      edits: [
        { oldString: "hello", newString: "hello" },
        { oldString: "world", newString: "universe" },
      ],
    });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("hello universe");
    expect(result.details?.appliedEdits).toBe(1);
    expect(result.details?.failedEdits).toHaveLength(1);
    expect(result.details?.failedEdits[0].reason).toContain("identical");
  });

  it("edits are applied sequentially (later edits see earlier changes)", async () => {
    const filePath = path.join(tmpDir, "test.txt");
    await fs.writeFile(filePath, "aaa", "utf-8");

    const tool = createMultiEditTool({ cwd: tmpDir });
    await tool.execute("call-8", {
      filePath: "test.txt",
      edits: [
        { oldString: "aaa", newString: "bbb" },
        { oldString: "bbb", newString: "ccc" },
      ],
    });

    const content = await fs.readFile(filePath, "utf-8");
    expect(content).toBe("ccc");
  });
});
