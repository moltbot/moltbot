/**
 * AssureBot - Sandbox Execution
 *
 * Isolated code execution with multiple backends:
 * 1. Docker (local) - if Docker socket available
 * 2. Piston API (cloud) - free code execution API fallback
 *
 * Security-first: no network, read-only root, resource limits.
 */

import { spawn } from "node:child_process";
import type { SecureConfig } from "./config.js";
import type { AuditLogger } from "./audit.js";

export type SandboxResult = {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
};

export type SandboxRunner = {
  run: (command: string, stdin?: string) => Promise<SandboxResult>;
  runCode: (language: string, code: string) => Promise<SandboxResult>;
  isAvailable: () => Promise<boolean>;
  backend: "docker" | "piston" | "none";
};

// Piston API - free cloud-based code execution
const PISTON_API = "https://emkc.org/api/v2/piston";

// Supported languages for Piston
const PISTON_LANGUAGES: Record<string, { language: string; version: string }> = {
  python: { language: "python", version: "3.10" },
  python3: { language: "python", version: "3.10" },
  py: { language: "python", version: "3.10" },
  javascript: { language: "javascript", version: "18.15.0" },
  js: { language: "javascript", version: "18.15.0" },
  node: { language: "javascript", version: "18.15.0" },
  typescript: { language: "typescript", version: "5.0.3" },
  ts: { language: "typescript", version: "5.0.3" },
  bash: { language: "bash", version: "5.2.0" },
  sh: { language: "bash", version: "5.2.0" },
  shell: { language: "bash", version: "5.2.0" },
  rust: { language: "rust", version: "1.68.2" },
  go: { language: "go", version: "1.16.2" },
  c: { language: "c", version: "10.2.0" },
  cpp: { language: "c++", version: "10.2.0" },
  java: { language: "java", version: "15.0.2" },
  ruby: { language: "ruby", version: "3.0.1" },
  php: { language: "php", version: "8.2.3" },
};

/**
 * Check if Docker is available
 */
async function checkDocker(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn("docker", ["version"], {
      stdio: ["ignore", "ignore", "ignore"],
    });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}

/**
 * Check if Piston API is available
 */
async function checkPiston(): Promise<boolean> {
  try {
    const response = await fetch(`${PISTON_API}/runtimes`, {
      method: "GET",
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Execute code via Piston API
 */
async function runPiston(
  language: string,
  code: string,
  timeoutMs: number
): Promise<SandboxResult> {
  const startTime = Date.now();

  const langConfig = PISTON_LANGUAGES[language.toLowerCase()];
  if (!langConfig) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: `Unsupported language: ${language}\n\nSupported: ${Object.keys(PISTON_LANGUAGES).join(", ")}`,
      timedOut: false,
      durationMs: Date.now() - startTime,
    };
  }

  try {
    const response = await fetch(`${PISTON_API}/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        language: langConfig.language,
        version: langConfig.version,
        files: [{ content: code }],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      const text = await response.text();
      return {
        exitCode: 1,
        stdout: "",
        stderr: `Piston API error: ${response.status} ${text}`,
        timedOut: false,
        durationMs: Date.now() - startTime,
      };
    }

    const result = await response.json() as {
      run: { stdout: string; stderr: string; code: number; signal: string | null };
      compile?: { stdout: string; stderr: string; code: number };
    };

    // Check for compilation errors
    if (result.compile && result.compile.code !== 0) {
      return {
        exitCode: result.compile.code,
        stdout: result.compile.stdout || "",
        stderr: result.compile.stderr || "Compilation failed",
        timedOut: false,
        durationMs: Date.now() - startTime,
      };
    }

    return {
      exitCode: result.run.code,
      stdout: (result.run.stdout || "").slice(0, 10000),
      stderr: (result.run.stderr || "").slice(0, 10000),
      timedOut: result.run.signal === "SIGKILL",
      durationMs: Date.now() - startTime,
    };
  } catch (err) {
    const isTimeout = err instanceof Error && err.name === "TimeoutError";
    return {
      exitCode: 1,
      stdout: "",
      stderr: isTimeout ? "Execution timed out" : `Error: ${err instanceof Error ? err.message : String(err)}`,
      timedOut: isTimeout,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Build Docker run arguments for secure execution
 */
function buildDockerArgs(config: SecureConfig["sandbox"], command: string): string[] {
  const args: string[] = [
    "run",
    "--rm", // Remove container after exit
    "-i", // Interactive (for stdin)

    // Security: No network by default
    `--network=${config.network}`,

    // Security: Read-only root filesystem
    "--read-only",

    // Security: tmpfs for writable areas
    "--tmpfs=/tmp:rw,noexec,nosuid,size=64m",
    "--tmpfs=/var/tmp:rw,noexec,nosuid,size=64m",

    // Security: Drop all capabilities
    "--cap-drop=ALL",

    // Security: No new privileges
    "--security-opt=no-new-privileges",

    // Resource limits
    `--memory=${config.memory}`,
    `--cpus=${config.cpus}`,
    "--pids-limit=100",

    // Timeout handled externally, but set a ulimit too
    "--ulimit=cpu=60:60",

    // Working directory
    "--workdir=/workspace",

    // Image
    config.image,

    // Command (via shell for flexibility)
    "sh",
    "-c",
    command,
  ];

  return args;
}

/**
 * Execute command via Docker
 */
async function runDocker(
  config: SecureConfig["sandbox"],
  command: string,
  stdin?: string
): Promise<SandboxResult> {
  const startTime = Date.now();

  return new Promise((resolve) => {
    const args = buildDockerArgs(config, command);

    const proc = spawn("docker", args, {
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let resolved = false;

    const finish = (exitCode: number) => {
      if (resolved) return;
      resolved = true;

      resolve({
        exitCode,
        stdout: stdout.slice(0, 10000), // Limit output size
        stderr: stderr.slice(0, 10000),
        timedOut,
        durationMs: Date.now() - startTime,
      });
    };

    // Timeout
    const timeout = setTimeout(() => {
      timedOut = true;
      proc.kill("SIGKILL");
    }, config.timeoutMs);

    proc.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString();
      // Prevent memory exhaustion
      if (stdout.length > 100000) {
        proc.kill("SIGKILL");
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString();
      if (stderr.length > 100000) {
        proc.kill("SIGKILL");
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      stderr += `\nProcess error: ${err.message}`;
      finish(1);
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      finish(code ?? 1);
    });

    // Write stdin if provided
    if (stdin && proc.stdin) {
      proc.stdin.write(stdin);
      proc.stdin.end();
    } else {
      proc.stdin?.end();
    }
  });
}

export function createSandboxRunner(config: SecureConfig, audit: AuditLogger): SandboxRunner {
  const sandboxConfig = config.sandbox;

  // Detect available backend at creation time
  let detectedBackend: "docker" | "piston" | "none" = "none";
  let backendChecked = false;

  async function detectBackend(): Promise<"docker" | "piston" | "none"> {
    if (backendChecked) return detectedBackend;

    if (!sandboxConfig.enabled) {
      detectedBackend = "none";
      backendChecked = true;
      return detectedBackend;
    }

    // Try Docker first
    if (await checkDocker()) {
      detectedBackend = "docker";
      console.log("[sandbox] Using Docker backend");
    } else if (await checkPiston()) {
      // Fall back to Piston API
      detectedBackend = "piston";
      console.log("[sandbox] Using Piston API backend (Docker not available)");
    } else {
      detectedBackend = "none";
      console.log("[sandbox] No sandbox backend available");
    }

    backendChecked = true;
    return detectedBackend;
  }

  // Start detection immediately
  void detectBackend();

  return {
    get backend() {
      return detectedBackend;
    },

    async isAvailable(): Promise<boolean> {
      const backend = await detectBackend();
      return backend !== "none";
    },

    async run(command: string, stdin?: string): Promise<SandboxResult> {
      const backend = await detectBackend();
      const startTime = Date.now();

      if (backend === "none") {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "Sandbox is disabled or no backend available",
          timedOut: false,
          durationMs: 0,
        };
      }

      let result: SandboxResult;

      if (backend === "docker") {
        result = await runDocker(sandboxConfig, command, stdin);
      } else {
        // Piston: run as bash
        result = await runPiston("bash", command, sandboxConfig.timeoutMs);
      }

      audit.sandbox({
        command,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      });

      return result;
    },

    async runCode(language: string, code: string): Promise<SandboxResult> {
      const backend = await detectBackend();

      if (backend === "none") {
        return {
          exitCode: 1,
          stdout: "",
          stderr: "Sandbox is disabled or no backend available",
          timedOut: false,
          durationMs: 0,
        };
      }

      let result: SandboxResult;

      if (backend === "piston") {
        // Use Piston directly for language support
        result = await runPiston(language, code, sandboxConfig.timeoutMs);
      } else {
        // Docker: build command for the language
        const command = buildCommand(language, code);
        result = await runDocker(sandboxConfig, command);
      }

      audit.sandbox({
        command: `[${language}] ${code.slice(0, 100)}...`,
        exitCode: result.exitCode,
        durationMs: result.durationMs,
      });

      return result;
    },
  };
}

/**
 * Parse sandbox command from user message
 * Returns null if message doesn't request code execution
 */
export function parseSandboxRequest(text: string): {
  language: string;
  code: string;
} | null {
  // Match code blocks with language
  const codeBlockMatch = text.match(/```(\w+)?\n([\s\S]*?)```/);
  if (codeBlockMatch) {
    const language = codeBlockMatch[1] || "sh";
    const code = codeBlockMatch[2].trim();
    return { language, code };
  }

  // Match /run command
  const runMatch = text.match(/^\/run\s+(.+)$/s);
  if (runMatch) {
    return { language: "sh", code: runMatch[1].trim() };
  }

  // Match /python command
  const pythonMatch = text.match(/^\/python\s+(.+)$/s);
  if (pythonMatch) {
    return { language: "python", code: pythonMatch[1].trim() };
  }

  return null;
}

/**
 * Build execution command for language (Docker only)
 */
export function buildCommand(language: string, code: string): string {
  switch (language.toLowerCase()) {
    case "python":
    case "py":
      return `python3 -c ${JSON.stringify(code)}`;

    case "javascript":
    case "js":
    case "node":
      return `node -e ${JSON.stringify(code)}`;

    case "bash":
    case "sh":
    case "shell":
      return code;

    default:
      return code;
  }
}

/**
 * Format sandbox result for display
 */
export function formatSandboxResult(result: SandboxResult): string {
  let output = "";

  if (result.timedOut) {
    output += "**Timed out**\n\n";
  }

  if (result.stdout) {
    output += "**Output:**\n```\n" + result.stdout.trim() + "\n```\n";
  }

  if (result.stderr) {
    output += "**Errors:**\n```\n" + result.stderr.trim() + "\n```\n";
  }

  if (!result.stdout && !result.stderr) {
    output += result.exitCode === 0 ? "Command completed (no output)" : "Command failed (no output)";
  }

  output += `\n_Exit code: ${result.exitCode}, Duration: ${result.durationMs}ms_`;

  return output;
}
