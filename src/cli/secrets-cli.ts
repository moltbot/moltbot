/**
 * CLI for managing user secrets.
 *
 * openclaw secrets set <name>     - Set a secret (prompts for value)
 * openclaw secrets get <name>     - Get a secret value (for scripts)
 * openclaw secrets list           - List all secret names
 * openclaw secrets remove <name>  - Remove a secret
 * openclaw secrets resolve        - Pipeline resolver for [secret:X] patterns
 */

import type { Command } from "commander";
import {
  secretsGetCommand,
  secretsListCommand,
  secretsRemoveCommand,
  secretsResolveCommand,
  secretsSetCommand,
} from "../secrets/cli.js";

export function registerSecretsCli(program: Command): void {
  const secrets = program
    .command("secrets")
    .description("Manage secrets for agent tool use")
    .addHelpText(
      "after",
      `
Examples:
  openclaw secrets set GITHUB_TOKEN              # Set secret (prompts for value)
  openclaw secrets set DB_PASS -d "Prod DB"      # Set with description
  openclaw secrets get GITHUB_TOKEN              # Output value (for scripts)
  openclaw secrets list                          # List all secret names
  openclaw secrets remove GITHUB_TOKEN           # Remove a secret
  echo "[secret:KEY]" | openclaw secrets resolve # Resolve placeholders in stdin

Security:
  Secret values are stored in ~/.openclaw/secrets.json (mode 600).
  Values are never sent to the model - only names are exposed.
  Use secrets as env vars in commands: curl -H "Authorization: $GITHUB_TOKEN"
`,
    );

  secrets
    .command("set <name>")
    .description("Set a secret (prompts for value if not piped)")
    .option("-d, --description <desc>", "Description shown to the agent")
    .option("-v, --value <value>", "Secret value (use stdin or prompt instead for security)")
    .action(async (name: string, options: { description?: string; value?: string }) => {
      await secretsSetCommand(name, options);
    });

  secrets
    .command("get <name>")
    .description("Get a secret value (outputs to stdout for scripting)")
    .action((name: string) => {
      secretsGetCommand(name);
    });

  secrets
    .command("list")
    .alias("ls")
    .description("List all secret names (not values)")
    .option("-v, --verbose", "Show descriptions and timestamps")
    .action((options: { verbose?: boolean }) => {
      secretsListCommand(options);
    });

  secrets
    .command("remove <name>")
    .alias("rm")
    .alias("delete")
    .description("Remove a secret")
    .action(async (name: string) => {
      await secretsRemoveCommand(name);
    });

  secrets
    .command("resolve")
    .description("Resolve [secret:NAME] patterns in stdin, output to stdout")
    .action(async () => {
      await secretsResolveCommand();
    });
}
