/**
 * CLI commands for managing secrets.
 *
 * Usage:
 *   openclaw secrets set <name> [--description "desc"]   # prompts for value
 *   openclaw secrets get <name>                          # outputs value (for scripts)
 *   openclaw secrets list                                # lists names only
 *   openclaw secrets remove <name>                       # deletes secret
 *   openclaw secrets resolve                             # stdin pipeline resolver
 */

import readline from "node:readline";
import { getSecret, hasSecret, listSecrets, removeSecret, setSecret } from "./store.js";

// ANSI codes for terminal output
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";

function promptForValue(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stderr, // Use stderr so stdout stays clean for piping
      terminal: true,
    });

    // Hide input for password-like entry
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;

    if (stdin.isTTY && stdin.setRawMode) {
      stdin.setRawMode(true);
    }

    let value = "";
    process.stderr.write(prompt);

    stdin.on("data", (chunk: Buffer) => {
      const char = chunk.toString();
      if (char === "\n" || char === "\r") {
        if (stdin.isTTY && stdin.setRawMode) {
          stdin.setRawMode(wasRaw ?? false);
        }
        process.stderr.write("\n");
        rl.close();
        resolve(value);
      } else if (char === "\x7f" || char === "\b") {
        // Backspace
        if (value.length > 0) {
          value = value.slice(0, -1);
          process.stderr.write("\b \b");
        }
      } else if (char === "\x03") {
        // Ctrl+C
        process.stderr.write("\n");
        process.exit(1);
      } else {
        value += char;
        process.stderr.write("*");
      }
    });
  });
}

export async function secretsSetCommand(
  name: string,
  options: { description?: string; value?: string },
): Promise<void> {
  // Validate name format (UPPER_SNAKE_CASE recommended)
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) {
    console.error(
      `${YELLOW}Warning: Secret names should be UPPER_SNAKE_CASE (e.g., GITHUB_TOKEN)${RESET}`,
    );
  }

  let value = options.value;

  if (!value) {
    if (!process.stdin.isTTY) {
      // Read from stdin if piped
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(chunk);
      }
      value = Buffer.concat(chunks).toString().trim();
    } else {
      // Interactive prompt
      value = await promptForValue(`Enter value for ${name}: `);
    }
  }

  if (!value) {
    console.error(`${RED}Error: No value provided${RESET}`);
    process.exit(1);
  }

  const success = await setSecret(name, value, options.description);

  if (success) {
    console.error(`${GREEN}✓${RESET} Secret ${BOLD}${name}${RESET} saved`);
  } else {
    console.error(`${RED}✗${RESET} Failed to save secret`);
    process.exit(1);
  }
}

export function secretsGetCommand(name: string): void {
  const value = getSecret(name);

  if (value === undefined) {
    console.error(`[ERROR: ${name} not found!]`);
    process.exit(1);
  }

  // Output to stdout (for piping/scripting)
  process.stdout.write(value);
}

export function secretsListCommand(options: { verbose?: boolean }): void {
  const secrets = listSecrets();

  if (secrets.length === 0) {
    console.log(`${DIM}No secrets configured${RESET}`);
    console.log(`${DIM}Run: openclaw secrets set <NAME> to add one${RESET}`);
    return;
  }

  console.log(`${BOLD}Available secrets:${RESET}\n`);

  for (const secret of secrets) {
    if (options.verbose) {
      console.log(`  ${BOLD}$${secret.name}${RESET}`);
      if (secret.description) {
        console.log(`    ${DIM}${secret.description}${RESET}`);
      }
      console.log(`    ${DIM}Updated: ${secret.updatedAt}${RESET}`);
      console.log();
    } else {
      const desc = secret.description ? ` ${DIM}— ${secret.description}${RESET}` : "";
      console.log(`  $${secret.name}${desc}`);
    }
  }
}

export async function secretsRemoveCommand(name: string): Promise<void> {
  if (!hasSecret(name)) {
    console.error(`${RED}Error: Secret ${name} not found${RESET}`);
    process.exit(1);
  }

  const success = await removeSecret(name);

  if (success) {
    console.log(`${GREEN}✓${RESET} Secret ${BOLD}${name}${RESET} removed`);
  } else {
    console.error(`${RED}✗${RESET} Failed to remove secret`);
    process.exit(1);
  }
}

/**
 * Pipeline resolver: reads stdin, replaces [secret:NAME] patterns with values.
 * Outputs to stdout.
 */
export async function secretsResolveCommand(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString();

  // Pattern: [secret:NAME] where NAME is alphanumeric + underscore
  const pattern = /\[secret:([A-Za-z_][A-Za-z0-9_]*)\]/g;

  const output = input.replace(pattern, (_match, name) => {
    const value = getSecret(name);
    if (value === undefined) {
      return `[ERROR: ${name} not found!]`;
    }
    return value;
  });

  process.stdout.write(output);
}

/**
 * Main CLI entry point.
 */
export async function secretsCommand(args: string[]): Promise<void> {
  const [subcommand, ...rest] = args;

  switch (subcommand) {
    case "set": {
      const name = rest[0];
      if (!name) {
        console.error('Usage: openclaw secrets set <name> [--description "desc"]');
        process.exit(1);
      }
      const descIndex = rest.indexOf("--description");
      const description = descIndex >= 0 ? rest[descIndex + 1] : undefined;
      const valueIndex = rest.indexOf("--value");
      const value = valueIndex >= 0 ? rest[valueIndex + 1] : undefined;
      await secretsSetCommand(name, { description, value });
      break;
    }

    case "get": {
      const name = rest[0];
      if (!name) {
        console.error("Usage: openclaw secrets get <name>");
        process.exit(1);
      }
      secretsGetCommand(name);
      break;
    }

    case "list":
    case "ls": {
      const verbose = rest.includes("-v") || rest.includes("--verbose");
      secretsListCommand({ verbose });
      break;
    }

    case "remove":
    case "rm":
    case "delete": {
      const name = rest[0];
      if (!name) {
        console.error("Usage: openclaw secrets remove <name>");
        process.exit(1);
      }
      await secretsRemoveCommand(name);
      break;
    }

    case "resolve": {
      await secretsResolveCommand();
      break;
    }

    default: {
      console.log(`${BOLD}openclaw secrets${RESET} — Manage secrets for agent tool use\n`);
      console.log("Commands:");
      console.log("  set <name>      Set a secret (prompts for value)");
      console.log("  get <name>      Get a secret value (for scripts)");
      console.log("  list            List all secret names");
      console.log("  remove <name>   Remove a secret");
      console.log("  resolve         Pipeline: resolve [secret:X] in stdin");
      console.log("\nExamples:");
      console.log("  openclaw secrets set GITHUB_TOKEN");
      console.log('  openclaw secrets set DB_PASS --description "Production DB"');
      console.log("  openclaw secrets get GITHUB_TOKEN | xargs -I {} curl -H 'Authorization: {}'");
      console.log('  echo "token=[secret:API_KEY]" | openclaw secrets resolve');
      break;
    }
  }
}
