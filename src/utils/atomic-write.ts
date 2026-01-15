import crypto from "node:crypto";
import fs from "node:fs/promises";

/**
 * Atomically write content to a file using temp-file-then-rename pattern.
 * This prevents partial writes from being visible to other processes.
 *
 * @param targetPath - Final destination path
 * @param content - Content to write
 * @param encoding - Text encoding (default: "utf8")
 */
export async function atomicWriteFile(
  targetPath: string,
  content: string,
  encoding: BufferEncoding = "utf8",
): Promise<void> {
  const tempPath = `${targetPath}.tmp.${crypto.randomUUID()}`;

  try {
    // Write to temp file
    await fs.writeFile(tempPath, content, encoding);

    // Atomic rename to final location
    await fs.rename(tempPath, targetPath);
  } catch (err) {
    // Clean up temp file on error
    await fs.rm(tempPath, { force: true }).catch(() => {});
    throw err;
  }
}
