import crypto from "node:crypto";
import chalk from "chalk";
import type { RuntimeEnv } from "../runtime.js";
import {
  deleteMapping,
  getMapping,
  listMappings,
  setMapping,
} from "../identity/storage.js";
import type { IdentityMapping } from "../identity/types.js";
import { danger, info, success, warn } from "../globals.js";

type IdentityLinkOpts = {
  whatsapp?: string;
  telegram?: string;
  twilio?: string;
  name?: string;
};

type IdentityListOpts = {
  json?: boolean;
};

type IdentityShowOpts = {
  id: string;
  json?: boolean;
};

type IdentityUnlinkOpts = {
  id: string;
};

/**
 * Validates E.164 phone number format (+country code + number)
 */
function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

/**
 * Validates Telegram username (@username) or numeric user ID
 */
function isValidTelegram(telegram: string): boolean {
  // Allow @username or numeric user ID
  return /^@[a-zA-Z0-9_]{5,32}$/.test(telegram) || /^\d+$/.test(telegram);
}

/**
 * Generate a random shared ID for a new identity mapping
 */
function generateSharedId(): string {
  const randomBytes = crypto.randomBytes(8).toString("hex");
  return `shared-${randomBytes.slice(0, 8)}-${randomBytes.slice(8)}`;
}

/**
 * Link multiple provider identities to share a single Claude session
 */
export async function identityLinkCommand(
  opts: IdentityLinkOpts,
  runtime: RuntimeEnv,
): Promise<void> {
  const { whatsapp, telegram, twilio, name } = opts;

  // Validate that at least two providers are specified
  const providers = [whatsapp, telegram, twilio].filter(Boolean);
  if (providers.length < 2) {
    runtime.error(
      danger(
        "At least two provider identities must be specified (--whatsapp, --telegram, or --twilio)",
      ),
    );
    runtime.exit(1);
    return;
  }

  // Validate formats
  if (whatsapp && !isValidE164(whatsapp)) {
    runtime.error(
      danger(
        `Invalid WhatsApp number format: ${whatsapp}. Must be E.164 format (e.g., +1234567890)`,
      ),
    );
    runtime.exit(1);
    return;
  }

  if (telegram && !isValidTelegram(telegram)) {
    runtime.error(
      danger(
        `Invalid Telegram format: ${telegram}. Must be @username or numeric user ID`,
      ),
    );
    runtime.exit(1);
    return;
  }

  if (twilio && !isValidE164(twilio)) {
    runtime.error(
      danger(
        `Invalid Twilio number format: ${twilio}. Must be E.164 format (e.g., +1234567890)`,
      ),
    );
    runtime.exit(1);
    return;
  }

  // Create the identity mapping
  const sharedId = generateSharedId();
  const mapping: IdentityMapping = {
    id: sharedId,
    name,
    identities: {
      whatsapp,
      telegram,
      twilio,
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  try {
    await setMapping(mapping);
    runtime.log(
      success(`✓ Identity mapping created with shared ID: ${chalk.cyan(sharedId)}`),
    );
    runtime.log("");
    runtime.log(info("Linked identities:"));
    if (whatsapp) runtime.log(`  WhatsApp: ${whatsapp}`);
    if (telegram) runtime.log(`  Telegram: ${telegram}`);
    if (twilio) runtime.log(`  Twilio:   ${twilio}`);
    if (name) runtime.log(`  Name:     ${name}`);
    runtime.log("");
    runtime.log(
      info(
        "Messages from any of these identities will now share the same Claude session.",
      ),
    );
  } catch (err) {
    runtime.error(danger(`Failed to create identity mapping: ${String(err)}`));
    runtime.exit(1);
  }
}

/**
 * List all identity mappings
 */
export async function identityListCommand(
  opts: IdentityListOpts,
  runtime: RuntimeEnv,
): Promise<void> {
  try {
    const mappings = await listMappings();

    if (opts.json) {
      console.log(JSON.stringify(mappings, null, 2));
      return;
    }

    if (mappings.length === 0) {
      runtime.log(
        info(
          "No identity mappings found. Use 'warelay identity link' to create one.",
        ),
      );
      return;
    }

    runtime.log(chalk.bold.cyan(`\nIdentity Mappings (${mappings.length}):\n`));

    for (const mapping of mappings) {
      runtime.log(chalk.bold(`  ${mapping.id}`));
      if (mapping.name) {
        runtime.log(`    Name:     ${chalk.white(mapping.name)}`);
      }
      if (mapping.identities.whatsapp) {
        runtime.log(
          `    WhatsApp: ${chalk.green(mapping.identities.whatsapp)}`,
        );
      }
      if (mapping.identities.telegram) {
        runtime.log(
          `    Telegram: ${chalk.blue(mapping.identities.telegram)}`,
        );
      }
      if (mapping.identities.twilio) {
        runtime.log(`    Twilio:   ${chalk.yellow(mapping.identities.twilio)}`);
      }
      runtime.log(
        `    Created:  ${chalk.gray(new Date(mapping.createdAt).toLocaleString())}`,
      );
      if (mapping.updatedAt !== mapping.createdAt) {
        runtime.log(
          `    Updated:  ${chalk.gray(new Date(mapping.updatedAt).toLocaleString())}`,
        );
      }
      runtime.log("");
    }
  } catch (err) {
    runtime.error(danger(`Failed to list identity mappings: ${String(err)}`));
    runtime.exit(1);
  }
}

/**
 * Show details of a specific identity mapping
 */
export async function identityShowCommand(
  opts: IdentityShowOpts,
  runtime: RuntimeEnv,
): Promise<void> {
  try {
    const mapping = await getMapping(opts.id);

    if (!mapping) {
      runtime.error(danger(`Identity mapping not found: ${opts.id}`));
      runtime.exit(1);
      return;
    }

    if (opts.json) {
      console.log(JSON.stringify(mapping, null, 2));
      return;
    }

    runtime.log(chalk.bold.cyan(`\nIdentity Mapping: ${mapping.id}\n`));
    if (mapping.name) {
      runtime.log(`  Name:     ${chalk.white(mapping.name)}`);
    }
    runtime.log(chalk.bold("  Linked Identities:"));
    if (mapping.identities.whatsapp) {
      runtime.log(`    WhatsApp: ${chalk.green(mapping.identities.whatsapp)}`);
    }
    if (mapping.identities.telegram) {
      runtime.log(`    Telegram: ${chalk.blue(mapping.identities.telegram)}`);
    }
    if (mapping.identities.twilio) {
      runtime.log(`    Twilio:   ${chalk.yellow(mapping.identities.twilio)}`);
    }
    runtime.log("");
    runtime.log(
      `  Created:  ${chalk.gray(new Date(mapping.createdAt).toLocaleString())}`,
    );
    if (mapping.updatedAt !== mapping.createdAt) {
      runtime.log(
        `  Updated:  ${chalk.gray(new Date(mapping.updatedAt).toLocaleString())}`,
      );
    }
    runtime.log("");
  } catch (err) {
    runtime.error(
      danger(`Failed to show identity mapping: ${String(err)}`),
    );
    runtime.exit(1);
  }
}

/**
 * Unlink an identity mapping
 */
export async function identityUnlinkCommand(
  opts: IdentityUnlinkOpts,
  runtime: RuntimeEnv,
): Promise<void> {
  try {
    // First check if the mapping exists
    const mapping = await getMapping(opts.id);
    if (!mapping) {
      runtime.error(danger(`Identity mapping not found: ${opts.id}`));
      runtime.exit(1);
      return;
    }

    // Show what will be unlinked
    runtime.log("");
    runtime.log(warn(`Unlinking identity mapping: ${chalk.bold(opts.id)}`));
    if (mapping.name) {
      runtime.log(`  Name:     ${mapping.name}`);
    }
    if (mapping.identities.whatsapp) {
      runtime.log(`  WhatsApp: ${mapping.identities.whatsapp}`);
    }
    if (mapping.identities.telegram) {
      runtime.log(`  Telegram: ${mapping.identities.telegram}`);
    }
    if (mapping.identities.twilio) {
      runtime.log(`  Twilio:   ${mapping.identities.twilio}`);
    }
    runtime.log("");
    runtime.log(
      warn(
        "After unlinking, each provider will have its own separate Claude session.",
      ),
    );
    runtime.log("");

    // Delete the mapping
    const deleted = await deleteMapping(opts.id);

    if (deleted) {
      runtime.log(success(`✓ Identity mapping ${opts.id} has been unlinked.`));
    } else {
      runtime.error(danger(`Failed to unlink identity mapping: ${opts.id}`));
      runtime.exit(1);
    }
  } catch (err) {
    runtime.error(
      danger(`Failed to unlink identity mapping: ${String(err)}`),
    );
    runtime.exit(1);
  }
}
