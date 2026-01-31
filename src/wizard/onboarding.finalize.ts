import fs from "node:fs/promises";
import path from "node:path";

import { DEFAULT_BOOTSTRAP_FILENAME } from "../agents/workspace.js";
import {
  DEFAULT_GATEWAY_DAEMON_RUNTIME,
  GATEWAY_DAEMON_RUNTIME_OPTIONS,
  type GatewayDaemonRuntime,
} from "../commands/daemon-runtime.js";
import { healthCommand } from "../commands/health.js";
import { formatHealthCheckFailure } from "../commands/health-format.js";
import {
  detectBrowserOpenSupport,
  formatControlUiSshHint,
  openUrl,
  openUrlInBackground,
  probeGatewayReachable,
  waitForGatewayReachable,
  resolveControlUiLinks,
} from "../commands/onboard-helpers.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { OnboardOptions } from "../commands/onboard-types.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveGatewayService } from "../daemon/service.js";
import { isSystemdUserServiceAvailable } from "../daemon/systemd.js";
import { ensureControlUiAssetsBuilt } from "../infra/control-ui-assets.js";
import type { RuntimeEnv } from "../runtime.js";
import { runTui } from "../tui/tui.js";
import { resolveUserPath } from "../utils.js";
import { t } from "../i18n/index.js";
import {
  buildGatewayInstallPlan,
  gatewayInstallErrorHint,
} from "../commands/daemon-install-helpers.js";
import type { GatewayWizardSettings, WizardFlow } from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";

type FinalizeOnboardingOptions = {
  flow: WizardFlow;
  opts: OnboardOptions;
  baseConfig: OpenClawConfig;
  nextConfig: OpenClawConfig;
  workspaceDir: string;
  settings: GatewayWizardSettings;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
};

export async function finalizeOnboardingWizard(options: FinalizeOnboardingOptions) {
  const { flow, opts, baseConfig, nextConfig, settings, prompter, runtime } = options;

  const withWizardProgress = async <T>(
    label: string,
    options: { doneMessage?: string },
    work: (progress: { update: (message: string) => void }) => Promise<T>,
  ): Promise<T> => {
    const progress = prompter.progress(label);
    try {
      return await work(progress);
    } finally {
      progress.stop(options.doneMessage);
    }
  };

  const systemdAvailable =
    process.platform === "linux" ? await isSystemdUserServiceAvailable() : true;
  if (process.platform === "linux" && !systemdAvailable) {
    await prompter.note(
      t("Systemd user service not available. Skipping persistence check and service install."),
      "Systemd",
    );
  }

  if (process.platform === "linux" && systemdAvailable) {
    const { ensureSystemdUserLingerInteractive } = await import("../commands/systemd-linger.js");
    await ensureSystemdUserLingerInteractive({
      runtime,
      prompter: {
        confirm: prompter.confirm,
        note: prompter.note,
      },
      reason: t(
        "Linux installs default to systemd user services. Without persistence, systemd stops user sessions on logout/idle and terminates the Gateway.",
      ),
      requireConfirm: false,
    });
  }

  const explicitInstallDaemon =
    typeof opts.installDaemon === "boolean" ? opts.installDaemon : undefined;
  let installDaemon: boolean;
  if (explicitInstallDaemon !== undefined) {
    installDaemon = explicitInstallDaemon;
  } else if (process.platform === "linux" && !systemdAvailable) {
    installDaemon = false;
  } else if (flow === "quickstart") {
    installDaemon = true;
  } else {
    installDaemon = await prompter.confirm({
      message: t("Install Gateway service (recommended)"),
      initialValue: true,
    });
  }

  if (process.platform === "linux" && !systemdAvailable && installDaemon) {
    await prompter.note(
      t(
        "Systemd user service not available; skipping service install. Use your container manager or `docker compose up -d`. ",
      ),
      t("Gateway service"),
    );
    installDaemon = false;
  }

  if (installDaemon) {
    const daemonRuntime =
      flow === "quickstart"
        ? (DEFAULT_GATEWAY_DAEMON_RUNTIME as GatewayDaemonRuntime)
        : ((await prompter.select({
            message: t("Gateway service runtime"),
            options: GATEWAY_DAEMON_RUNTIME_OPTIONS,
            initialValue: opts.daemonRuntime ?? DEFAULT_GATEWAY_DAEMON_RUNTIME,
          })) as GatewayDaemonRuntime);
    if (flow === "quickstart") {
      await prompter.note(
        t("QuickStart uses Node as the Gateway service (stable + supported)."),
        t("Gateway service runtime"),
      );
    }
    const service = resolveGatewayService();
    const loaded = await service.isLoaded({ env: process.env });
    if (loaded) {
      const action = (await prompter.select({
        message: t("Gateway service already installed"),
        options: [
          { value: "restart", label: t("Restart") },
          { value: "reinstall", label: t("Reinstall") },
          { value: "skip", label: t("Skip") },
        ],
      })) as "restart" | "reinstall" | "skip";
      if (action === "restart") {
        await withWizardProgress(
          t("Gateway service"),
          { doneMessage: t("Gateway service restarted.") },
          async (progress) => {
            progress.update(t("Restarting Gateway service…"));
            await service.restart({
              env: process.env,
              stdout: process.stdout,
            });
          },
        );
      } else if (action === "reinstall") {
        await withWizardProgress(
          t("Gateway service"),
          { doneMessage: t("Gateway service uninstalled.") },
          async (progress) => {
            progress.update(t("Uninstalling Gateway service…"));
            await service.uninstall({ env: process.env, stdout: process.stdout });
          },
        );
      }
    }

    if (!loaded || (loaded && (await service.isLoaded({ env: process.env })) === false)) {
      const progress = prompter.progress(t("Gateway service"));
      let installError: string | null = null;
      try {
        progress.update(t("Preparing Gateway service…"));
        const { programArguments, workingDirectory, environment } = await buildGatewayInstallPlan({
          env: process.env,
          port: settings.port,
          token: settings.gatewayToken,
          runtime: daemonRuntime,
          warn: (message, title) => prompter.note(message, title),
          config: nextConfig,
        });

        progress.update(t("Installing Gateway service…"));
        await service.install({
          env: process.env,
          stdout: process.stdout,
          programArguments,
          workingDirectory,
          environment,
        });
      } catch (err) {
        installError = err instanceof Error ? err.message : String(err);
      } finally {
        progress.stop(
          installError ? t("Gateway service install failed.") : t("Gateway service installed."),
        );
      }
      if (installError) {
        await prompter.note(t(`Gateway service install failed: ${installError}`), t("Gateway"));
        await prompter.note(gatewayInstallErrorHint(), t("Gateway"));
      }
    }
  }

  if (!opts.skipHealth) {
    const probeLinks = resolveControlUiLinks({
      bind: nextConfig.gateway?.bind ?? "loopback",
      port: settings.port,
      customBindHost: nextConfig.gateway?.customBindHost,
      basePath: undefined,
    });
    // Daemon install/restart can briefly flap the WS; wait a bit so health check doesn't false-fail.
    await waitForGatewayReachable({
      url: probeLinks.wsUrl,
      token: settings.gatewayToken,
      deadlineMs: 15_000,
    });
    try {
      await healthCommand({ json: false, timeoutMs: 10_000 }, runtime);
    } catch (err) {
      runtime.error(formatHealthCheckFailure(err));
      await prompter.note(
        [
          t("Docs:"),
          "https://docs.openclaw.ai/gateway/health",
          "https://docs.openclaw.ai/gateway/troubleshooting",
        ].join("\n"),
        t("Health check help"),
      );
    }
  }

  const controlUiEnabled =
    nextConfig.gateway?.controlUi?.enabled ?? baseConfig.gateway?.controlUi?.enabled ?? true;
  if (!opts.skipUi && controlUiEnabled) {
    const controlUiAssets = await ensureControlUiAssetsBuilt(runtime);
    if (!controlUiAssets.ok && controlUiAssets.message) {
      runtime.error(controlUiAssets.message);
    }
  }

  await prompter.note(
    [
      t("Add nodes for extra capabilities:"),
      t("- macOS app (system + notifications)"),
      t("- iOS app (camera/canvas)"),
      t("- Android app (camera/canvas)"),
    ].join("\n"),
    t("Optional apps"),
  );

  const controlUiBasePath =
    nextConfig.gateway?.controlUi?.basePath ?? baseConfig.gateway?.controlUi?.basePath;
  const links = resolveControlUiLinks({
    bind: settings.bind,
    port: settings.port,
    customBindHost: settings.customBindHost,
    basePath: controlUiBasePath,
  });
  const tokenParam =
    settings.authMode === "token" && settings.gatewayToken
      ? `?token=${encodeURIComponent(settings.gatewayToken)}`
      : "";
  const authedUrl = `${links.httpUrl}${tokenParam}`;
  const gatewayProbe = await probeGatewayReachable({
    url: links.wsUrl,
    token: settings.authMode === "token" ? settings.gatewayToken : undefined,
    password: settings.authMode === "password" ? nextConfig.gateway?.auth?.password : "",
  });
  const gatewayStatusLine = gatewayProbe.ok
    ? "Gateway: reachable"
    : `Gateway: not detected${gatewayProbe.detail ? ` (${gatewayProbe.detail})` : ""}`;
  const bootstrapPath = path.join(
    resolveUserPath(options.workspaceDir),
    DEFAULT_BOOTSTRAP_FILENAME,
  );
  const hasBootstrap = await fs
    .access(bootstrapPath)
    .then(() => true)
    .catch(() => false);

  await prompter.note(
    [
      `${t("Web UI")}: ${links.httpUrl}`,
      tokenParam ? `${t("Web UI (with token)")}: ${authedUrl}` : undefined,
      `${t("Gateway WS")}: ${links.wsUrl}`,
      gatewayStatusLine,
      `${t("Docs")}: https://docs.openclaw.ai/web/control-ui`,
    ]
      .filter(Boolean)
      .join("\n"),
    t("Control UI"),
  );

  let controlUiOpened = false;
  let controlUiOpenHint: string | undefined;
  let seededInBackground = false;
  let hatchChoice: "tui" | "web" | "later" | null = null;

  if (!opts.skipUi && gatewayProbe.ok) {
    if (hasBootstrap) {
      await prompter.note(
        [
          t("This is a critical step to define your agent's identity."),
          t("Please take your time."),
          t("The more you tell it, the better the experience will be."),
          t('We will send: "Wake up, my friend!"'),
        ].join("\n"),
        t("Launch TUI (best choice!)"),
      );
    }

    await prompter.note(
      [
        t("Gateway token: Shared auth for Gateway + Control UI."),
        t("Stored at: ~/.openclaw/openclaw.json (gateway.auth.token) or OPENCLAW_GATEWAY_TOKEN."),
        t("Web UI stores a copy in this browser's localStorage (openclaw.control.settings.v1)."),
        t(`Get token link anytime: openclaw dashboard --no-open`),
      ].join("\n"),
      t("Tokens"),
    );

    hatchChoice = (await prompter.select({
      message: t("How do you want to hatch your bot?"),
      options: [
        { value: "tui", label: t("Hatch in TUI (recommended)") },
        { value: "web", label: t("Open Web UI") },
        { value: "later", label: t("Do it later") },
      ],
      initialValue: "tui",
    })) as "tui" | "web" | "later";

    if (hatchChoice === "tui") {
      await runTui({
        url: links.wsUrl,
        token: settings.authMode === "token" ? settings.gatewayToken : undefined,
        password: settings.authMode === "password" ? nextConfig.gateway?.auth?.password : "",
        // Safety: onboarding TUI should not auto-deliver to lastProvider/lastTo.
        deliver: false,
        message: hasBootstrap ? "Wake up, my friend!" : undefined,
      });
      if (settings.authMode === "token" && settings.gatewayToken) {
        seededInBackground = await openUrlInBackground(authedUrl);
      }
      if (seededInBackground) {
        await prompter.note(
          t(`Web UI started in background. Open later with: openclaw dashboard --no-open`),
          t("Web UI"),
        );
      }
    } else if (hatchChoice === "web") {
      const browserSupport = await detectBrowserOpenSupport();
      if (browserSupport.ok) {
        controlUiOpened = await openUrl(authedUrl);
        if (!controlUiOpened) {
          controlUiOpenHint = formatControlUiSshHint({
            port: settings.port,
            basePath: controlUiBasePath,
            token: settings.gatewayToken,
          });
        }
      } else {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.gatewayToken,
        });
      }
      await prompter.note(
        [
          `${t("Dashboard link (with token)")}: ${authedUrl}`,
          controlUiOpened
            ? t("Opened in your browser. Keep that tab to control OpenClaw.")
            : t("Copy/paste this URL in your local browser to control OpenClaw."),
          controlUiOpenHint,
        ]
          .filter(Boolean)
          .join("\n"),
        t("Dashboard ready"),
      );
    } else {
      await prompter.note(t(`When ready: openclaw dashboard --no-open`), t("Later"));
    }
  } else if (opts.skipUi) {
    await prompter.note(t("Skipping Control UI/TUI prompt."), t("Control UI"));
  }

  await prompter.note(
    [
      t("Back up your agent workspace."),
      `${t("Docs:")} https://docs.openclaw.ai/concepts/agent-workspace`,
    ].join("\n"),
    t("Workspace backup"),
  );

  await prompter.note(
    t(
      "Running an agent on your machine carries risks — harden your setup: https://docs.openclaw.ai/security",
    ),
    t("Security"),
  );

  const shouldOpenControlUi =
    !opts.skipUi &&
    settings.authMode === "token" &&
    Boolean(settings.gatewayToken) &&
    hatchChoice === null;
  if (shouldOpenControlUi) {
    const browserSupport = await detectBrowserOpenSupport();
    if (browserSupport.ok) {
      controlUiOpened = await openUrl(authedUrl);
      if (!controlUiOpened) {
        controlUiOpenHint = formatControlUiSshHint({
          port: settings.port,
          basePath: controlUiBasePath,
          token: settings.gatewayToken,
        });
      }
    } else {
      controlUiOpenHint = formatControlUiSshHint({
        port: settings.port,
        basePath: controlUiBasePath,
        token: settings.gatewayToken,
      });
    }

    await prompter.note(
      [
        `Dashboard link (with token): ${authedUrl}`,
        controlUiOpened
          ? "Opened in your browser. Keep that tab to control OpenClaw."
          : "Copy/paste this URL in a browser on this machine to control OpenClaw.",
        controlUiOpenHint,
      ]
        .filter(Boolean)
        .join("\n"),
      "Dashboard ready",
    );
  }

  const webSearchKey = (nextConfig.tools?.web?.search?.apiKey ?? "").trim();
  const webSearchEnv = (process.env.BRAVE_API_KEY ?? "").trim();
  const hasWebSearchKey = Boolean(webSearchKey || webSearchEnv);
  await prompter.note(
    hasWebSearchKey
      ? [
          t("Web search enabled so your agent can find information online when needed."),
          "",
          webSearchKey
            ? t("API key: Stored in config (tools.web.search.apiKey).")
            : t("API key: Provided via BRAVE_API_KEY environment variable (Gateway env)."),
          `${t("Docs:")} https://docs.openclaw.ai/tools/web`,
        ].join("\n")
      : [
          t("If you want your agent to search the web, you need API keys."),
          "",
          t(
            "OpenClaw uses Brave Search for `web_search` tool. Without a Brave Search API key, web search won't work.",
          ),
          "",
          t("Interactive setup:"),
          `- ${t("Run:")} ${formatCliCommand("openclaw configure --section web")}`,
          `- ${t("Enable web_search and paste your Brave Search API key")}`,
          "",
          t("Alternative: Set BRAVE_API_KEY in Gateway environment (no config change needed)."),
          `${t("Docs:")} https://docs.openclaw.ai/tools/web`,
        ].join("\n"),
    t("Web search (optional)"),
  );

  await prompter.note(
    t('What\'s next: https://openclaw.ai/showcase ("what people are building").'),
    t("What's next"),
  );

  await prompter.outro(
    controlUiOpened
      ? t(
          "Onboarding complete. Dashboard opened with your token; keep that tab to control OpenClaw.",
        )
      : seededInBackground
        ? t(
            "Onboarding complete. Web UI started in background; open it anytime with the token link above.",
          )
        : t("Onboarding complete. Use the token dashboard link above to control OpenClaw."),
  );
}
