import { spawn } from "node:child_process";

export function getShellConfig(): { shell: string; args: string[] } {
  if (process.platform === "win32") {
    const shell = process.env.COMSPEC?.trim() || "cmd.exe";
    return { shell, args: ["/d", "/s", "/c"] };
  }

  const shell = process.env.SHELL?.trim() || "sh";
  return { shell, args: ["-c"] };
}

export function sanitizeBinaryOutput(text: string): string {
  const scrubbed = text.replace(/[\p{Format}\p{Surrogate}]/gu, "");
  if (!scrubbed) return scrubbed;
  const chunks: string[] = [];
  for (const char of scrubbed) {
    const code = char.codePointAt(0);
    if (code == null) continue;
    if (code === 0x09 || code === 0x0a || code === 0x0d) {
      chunks.push(char);
      continue;
    }
    if (code < 0x20) continue;
    chunks.push(char);
  }
  return chunks.join("");
}

export function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    try {
      spawn("taskkill", ["/F", "/T", "/PID", String(pid)], {
        stdio: "ignore",
        detached: true,
      });
    } catch {
      // ignore errors if taskkill fails
    }
    return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // process already dead
    }
  }
}
