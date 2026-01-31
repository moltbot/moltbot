import { intro, note, outro, spinner } from "@clack/prompts";

import { ensureAuthProfileStore, upsertAuthProfile } from "../agents/auth-profiles.js";
import { updateConfig } from "../commands/models/shared.js";
import { applyAuthProfileConfig } from "../commands/onboard-auth.js";
import { logConfigUpdated } from "../config/logging.js";
import type { RuntimeEnv } from "../runtime.js";
import { stylePromptTitle } from "../terminal/prompt-style.js";
import {
  getCopilotAuthStatus,
  ensureCopilotClientStarted,
  stopCopilotClient,
} from "./github-copilot-sdk.js";

export async function githubCopilotLoginCommand(
  opts: { profileId?: string; yes?: boolean },
  runtime: RuntimeEnv,
) {
  if (!process.stdin.isTTY) {
    throw new Error("github-copilot login requires an interactive TTY.");
  }

  intro(stylePromptTitle("GitHub Copilot login"));

  const profileId = opts.profileId?.trim() || "github-copilot:github";
  const store = ensureAuthProfileStore(undefined, {
    allowKeychainPrompt: false,
  });

  if (store.profiles[profileId] && !opts.yes) {
    note(
      `Auth profile already exists: ${profileId}\nRe-running will overwrite it.`,
      stylePromptTitle("Existing credentials"),
    );
  }

  const spin = spinner();
  spin.start("Checking GitHub Copilot authentication status...");

  try {
    await ensureCopilotClientStarted();
    const authStatus = await getCopilotAuthStatus();

    if (!authStatus.isAuthenticated) {
      spin.stop("Not authenticated");
      note(
        [
          "GitHub Copilot CLI is not authenticated.",
          "Please run 'copilot auth login' in your terminal first,",
          "then retry this command.",
        ].join("\n"),
        stylePromptTitle("Authentication required"),
      );
      await stopCopilotClient();
      throw new Error("GitHub Copilot not authenticated. Run 'copilot auth login' first.");
    }

    spin.stop(`Authenticated as ${authStatus.login ?? authStatus.authType ?? "user"}`);

    // Store a marker profile indicating SDK-managed authentication
    upsertAuthProfile({
      profileId,
      credential: {
        type: "token",
        provider: "github-copilot",
        // The SDK manages tokens internally, so we store a marker token
        token: "sdk-managed",
      },
    });

    await updateConfig((cfg) =>
      applyAuthProfileConfig(cfg, {
        provider: "github-copilot",
        profileId,
        mode: "token",
      }),
    );

    logConfigUpdated(runtime);
    runtime.log(`Auth profile: ${profileId} (github-copilot/sdk-managed)`);
    if (authStatus.login) {
      runtime.log(`Logged in as: ${authStatus.login}`);
    }
    if (authStatus.statusMessage) {
      note(authStatus.statusMessage, stylePromptTitle("Status"));
    }
  } catch (err) {
    spin.stop("Error");
    await stopCopilotClient();
    throw err;
  }

  await stopCopilotClient();
  outro("Done");
}
