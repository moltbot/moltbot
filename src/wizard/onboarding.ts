import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import { listChannelPlugins } from "../channels/plugins/index.js";
import {
  applyAuthChoice,
  resolvePreferredProviderForAuthChoice,
  warnIfModelConfigLooksOff,
} from "../commands/auth-choice.js";
import { promptAuthChoiceGrouped } from "../commands/auth-choice-prompt.js";
import { applyPrimaryModel, promptDefaultModel } from "../commands/model-picker.js";
import { setupChannels } from "../commands/onboard-channels.js";
import {
  applyWizardMetadata,
  DEFAULT_WORKSPACE,
  ensureWorkspaceAndSessions,
  handleReset,
  printWizardHeader,
  probeGatewayReachable,
  summarizeExistingConfig,
} from "../commands/onboard-helpers.js";
import { promptRemoteGatewayConfig } from "../commands/onboard-remote.js";
import { setupSkills } from "../commands/onboard-skills.js";
import { setupInternalHooks } from "../commands/onboard-hooks.js";
import type {
  GatewayAuthChoice,
  OnboardMode,
  OnboardOptions,
  ResetScope,
} from "../commands/onboard-types.js";
import { formatCliCommand } from "../cli/command-format.js";
import type { OpenClawConfig } from "../config/config.js";
import {
  DEFAULT_GATEWAY_PORT,
  readConfigFileSnapshot,
  resolveGatewayPort,
  writeConfigFile,
} from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { t } from "../i18n/index.js";
import { resolveUserPath } from "../utils.js";
import { finalizeOnboardingWizard } from "./onboarding.finalize.js";
import { configureGatewayForOnboarding } from "./onboarding.gateway-config.js";
import type { QuickstartGatewayDefaults, WizardFlow } from "./onboarding.types.js";
import { WizardCancelledError, type WizardPrompter } from "./prompts.js";
import { installCompletion } from "../cli/completion-cli.js";

async function requireRiskAcknowledgement(params: {
  opts: OnboardOptions;
  prompter: WizardPrompter;
}) {
  if (params.opts.acceptRisk === true) return;

  await params.prompter.note(
    [
      t("Security warning — please read."),
      "",
      t("OpenClaw is a hobby project and still in beta. Expect sharp edges."),
      t("This bot can read files and run actions if tools are enabled."),
      t("A bad prompt can trick it into doing unsafe things."),
      "",
      t("If you’re not comfortable with basic security and access control, don’t run OpenClaw."),
      t("Ask someone experienced to help before enabling tools or exposing it to the internet."),
      "",
      t("Recommended baseline:"),
      t("- Pairing/allowlists + mention gating."),
      t("- Sandbox + least-privilege tools."),
      t("- Keep secrets out of the agent’s reachable filesystem."),
      t("- Use the strongest available model for any bot with tools or untrusted inboxes."),
      "",
      t("Run regularly:"),
      t("openclaw security audit --deep"),
      t("openclaw security audit --fix"),
      "",
      `${t("Must read:")} https://docs.openclaw.ai/gateway/security`,
    ].join("\n"),
    t("Security"),
  );

  const ok = await params.prompter.confirm({
    message: t("I understand this is powerful and inherently risky. Continue?"),
    initialValue: false,
  });
  if (!ok) {
    throw new WizardCancelledError("risk not accepted");
  }
}

export async function runOnboardingWizard(
  opts: OnboardOptions,
  runtime: RuntimeEnv = defaultRuntime,
  prompter: WizardPrompter,
) {
  printWizardHeader(runtime);
  await prompter.intro("OpenClaw onboarding");
  await requireRiskAcknowledgement({ opts, prompter });

  const snapshot = await readConfigFileSnapshot();
  let baseConfig: OpenClawConfig = snapshot.valid ? snapshot.config : {};

  if (snapshot.exists && !snapshot.valid) {
    await prompter.note(summarizeExistingConfig(baseConfig), t("Invalid config"));
    if (snapshot.issues.length > 0) {
      await prompter.note(
        [
          ...snapshot.issues.map((iss) => `- ${iss.path}: ${iss.message}`),
          "",
          "Docs: https://docs.openclaw.ai/gateway/configuration",
        ].join("\n"),
        t("Config issues"),
      );
    }
    await prompter.outro(
      t(
        `Config invalid. Run \`${formatCliCommand("openclaw doctor")}\` to repair it, then re-run onboarding.`,
      ),
    );
    runtime.exit(1);
    return;
  }

  const quickstartHint = t(
    `Configure details later via ${formatCliCommand("openclaw configure")}.`,
  );
  const manualHint = t("Configure port, network, Tailscale, and auth options.");
  const explicitFlowRaw = opts.flow?.trim();
  const normalizedExplicitFlow = explicitFlowRaw === "manual" ? "advanced" : explicitFlowRaw;
  if (
    normalizedExplicitFlow &&
    normalizedExplicitFlow !== "quickstart" &&
    normalizedExplicitFlow !== "advanced"
  ) {
    runtime.error(t("Invalid --flow (use quickstart, manual, or advanced)."));
    runtime.exit(1);
    return;
  }
  const explicitFlow: WizardFlow | undefined =
    normalizedExplicitFlow === "quickstart" || normalizedExplicitFlow === "advanced"
      ? normalizedExplicitFlow
      : undefined;
  let flow: WizardFlow =
    explicitFlow ??
    ((await prompter.select({
      message: t("Onboarding mode"),
      options: [
        { value: "quickstart", label: t("QuickStart"), hint: quickstartHint },
        { value: "advanced", label: t("Manual"), hint: manualHint },
      ],
      initialValue: "quickstart",
    })) as "quickstart" | "advanced");

  if (opts.mode === "remote" && flow === "quickstart") {
    await prompter.note(
      t("QuickStart only supports local gateway. Switching to manual mode."),
      t("QuickStart"),
    );
    flow = "advanced";
  }

  if (snapshot.exists) {
    await prompter.note(summarizeExistingConfig(baseConfig), t("Existing config detected"));

    const action = (await prompter.select({
      message: t("Config handling"),
      options: [
        { value: "keep", label: t("Use existing values") },
        { value: "modify", label: t("Update values") },
        { value: "reset", label: t("Reset") },
      ],
    })) as "keep" | "modify" | "reset";

    if (action === "reset") {
      const workspaceDefault = baseConfig.agents?.defaults?.workspace ?? DEFAULT_WORKSPACE;
      const resetScope = (await prompter.select({
        message: t("Reset scope"),
        options: [
          { value: "config", label: t("Config only") },
          {
            value: "config+creds+sessions",
            label: t("Config + creds + sessions"),
          },
          {
            value: "full",
            label: t("Full reset (config + creds + sessions + workspace)"),
          },
        ],
      })) as ResetScope;
      await handleReset(resetScope, resolveUserPath(workspaceDefault), runtime);
      baseConfig = {};
    }
  }

  const quickstartGateway: QuickstartGatewayDefaults = (() => {
    const hasExisting =
      typeof baseConfig.gateway?.port === "number" ||
      baseConfig.gateway?.bind !== undefined ||
      baseConfig.gateway?.auth?.mode !== undefined ||
      baseConfig.gateway?.auth?.token !== undefined ||
      baseConfig.gateway?.auth?.password !== undefined ||
      baseConfig.gateway?.customBindHost !== undefined ||
      baseConfig.gateway?.tailscale?.mode !== undefined;

    const bindRaw = baseConfig.gateway?.bind;
    const bind =
      bindRaw === "loopback" ||
      bindRaw === "lan" ||
      bindRaw === "auto" ||
      bindRaw === "custom" ||
      bindRaw === "tailnet"
        ? bindRaw
        : "loopback";

    let authMode: GatewayAuthChoice = "token";
    if (
      baseConfig.gateway?.auth?.mode === "token" ||
      baseConfig.gateway?.auth?.mode === "password"
    ) {
      authMode = baseConfig.gateway.auth.mode;
    } else if (baseConfig.gateway?.auth?.token) {
      authMode = "token";
    } else if (baseConfig.gateway?.auth?.password) {
      authMode = "password";
    }

    const tailscaleRaw = baseConfig.gateway?.tailscale?.mode;
    const tailscaleMode =
      tailscaleRaw === "off" || tailscaleRaw === "serve" || tailscaleRaw === "funnel"
        ? tailscaleRaw
        : "off";

    return {
      hasExisting,
      port: resolveGatewayPort(baseConfig),
      bind,
      authMode,
      tailscaleMode,
      token: baseConfig.gateway?.auth?.token,
      password: baseConfig.gateway?.auth?.password,
      customBindHost: baseConfig.gateway?.customBindHost,
      tailscaleResetOnExit: baseConfig.gateway?.tailscale?.resetOnExit ?? false,
    };
  })();

  if (flow === "quickstart") {
    const formatBind = (value: "loopback" | "lan" | "auto" | "custom" | "tailnet") => {
      if (value === "loopback") return t("Loopback (127.0.0.1)");
      if (value === "lan") return t("Local network");
      if (value === "custom") return t("Custom IP");
      if (value === "tailnet") return t("Tailnet (Tailscale IP)");
      return t("Auto");
    };
    const formatAuth = (value: GatewayAuthChoice) => {
      if (value === "token") return t("Token (default)");
      return t("Password");
    };
    const formatTailscale = (value: "off" | "serve" | "funnel") => {
      if (value === "off") return t("Off");
      if (value === "serve") return t("Serve");
      return t("Funnel");
    };
    const quickstartLines = quickstartGateway.hasExisting
      ? [
          t("Keeping your current gateway settings:"),
          `${t("Gateway port")}: ${quickstartGateway.port}`,
          `${t("Gateway bind")}: ${formatBind(quickstartGateway.bind)}`,
          ...(quickstartGateway.bind === "custom" && quickstartGateway.customBindHost
            ? [`${t("Gateway custom IP")}: ${quickstartGateway.customBindHost}`]
            : []),
          `${t("Gateway auth")}: ${formatAuth(quickstartGateway.authMode)}`,
          `${t("Tailscale exposure")}: ${formatTailscale(quickstartGateway.tailscaleMode)}`,
          t("Direct to chat channels."),
        ]
      : [
          `${t("Gateway port")}: ${DEFAULT_GATEWAY_PORT}`,
          `${t("Gateway bind")}: ${t("Loopback (127.0.0.1)")}`,
          `${t("Gateway auth")}: ${t("Token (default)")}`,
          `${t("Tailscale exposure")}: ${t("Off")}`,
          t("Direct to chat channels."),
        ];
    await prompter.note(quickstartLines.join("\n"), t("QuickStart"));
  }

  const localPort = resolveGatewayPort(baseConfig);
  const localUrl = `ws://127.0.0.1:${localPort}`;
  const localProbe = await probeGatewayReachable({
    url: localUrl,
    token: baseConfig.gateway?.auth?.token ?? process.env.OPENCLAW_GATEWAY_TOKEN,
    password: baseConfig.gateway?.auth?.password ?? process.env.OPENCLAW_GATEWAY_PASSWORD,
  });
  const remoteUrl = baseConfig.gateway?.remote?.url?.trim() ?? "";
  const remoteProbe = remoteUrl
    ? await probeGatewayReachable({
        url: remoteUrl,
        token: baseConfig.gateway?.remote?.token,
      })
    : null;

  const mode =
    opts.mode ??
    (flow === "quickstart"
      ? "local"
      : ((await prompter.select({
          message: t("What do you want to set up?"),
          options: [
            {
              value: "local",
              label: t("Local gateway (this machine)"),
              hint: localProbe.ok
                ? `${t("Gateway reachable")} (${localUrl})`
                : `${t("No gateway detected")} (${localUrl})`,
            },
            {
              value: "remote",
              label: t("Remote gateway (info-only)"),
              hint: !remoteUrl
                ? t("No remote URL configured yet")
                : remoteProbe?.ok
                  ? `${t("Gateway reachable")} (${remoteUrl})`
                  : `${t("Configured but unreachable")} (${remoteUrl})`,
            },
          ],
        })) as OnboardMode));

  if (mode === "remote") {
    let nextConfig = await promptRemoteGatewayConfig(baseConfig, prompter);
    nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
    await writeConfigFile(nextConfig);
    logConfigUpdated(runtime);
    await prompter.outro(t("Remote gateway configured."));
    return;
  }

  const workspaceInput =
    opts.workspace ??
    (flow === "quickstart"
      ? (baseConfig.agents?.defaults?.workspace ?? DEFAULT_WORKSPACE)
      : await prompter.text({
          message: t("Workspace directory"),
          initialValue: baseConfig.agents?.defaults?.workspace ?? DEFAULT_WORKSPACE,
        }));

  const workspaceDir = resolveUserPath(workspaceInput.trim() || DEFAULT_WORKSPACE);

  let nextConfig: OpenClawConfig = {
    ...baseConfig,
    agents: {
      ...baseConfig.agents,
      defaults: {
        ...baseConfig.agents?.defaults,
        workspace: workspaceDir,
      },
    },
    gateway: {
      ...baseConfig.gateway,
      mode: "local",
    },
  };

  const authStore = ensureAuthProfileStore(undefined, {
    allowKeychainPrompt: false,
  });
  const authChoiceFromPrompt = opts.authChoice === undefined;
  const authChoice =
    opts.authChoice ??
    (await promptAuthChoiceGrouped({
      prompter,
      store: authStore,
      includeSkip: true,
    }));

  const authResult = await applyAuthChoice({
    authChoice,
    config: nextConfig,
    prompter,
    runtime,
    setDefaultModel: true,
    opts: {
      tokenProvider: opts.tokenProvider,
      token: opts.authChoice === "apiKey" && opts.token ? opts.token : undefined,
    },
  });
  nextConfig = authResult.config;

  if (authChoiceFromPrompt) {
    const modelSelection = await promptDefaultModel({
      config: nextConfig,
      prompter,
      allowKeep: true,
      ignoreAllowlist: true,
      preferredProvider: resolvePreferredProviderForAuthChoice(authChoice),
    });
    if (modelSelection.model) {
      nextConfig = applyPrimaryModel(nextConfig, modelSelection.model);
    }
  }

  await warnIfModelConfigLooksOff(nextConfig, prompter);

  const gateway = await configureGatewayForOnboarding({
    flow,
    baseConfig,
    nextConfig,
    localPort,
    quickstartGateway,
    prompter,
    runtime,
  });
  nextConfig = gateway.nextConfig;
  const settings = gateway.settings;

  if (opts.skipChannels ?? opts.skipProviders) {
    await prompter.note(t("Skipping channel setup."), t("Channels"));
  } else {
    const quickstartAllowFromChannels =
      flow === "quickstart"
        ? listChannelPlugins()
            .filter((plugin) => plugin.meta.quickstartAllowFrom)
            .map((plugin) => plugin.id)
        : [];
    nextConfig = await setupChannels(nextConfig, runtime, prompter, {
      allowSignalInstall: true,
      forceAllowFromChannels: quickstartAllowFromChannels,
      skipDmPolicyPrompt: flow === "quickstart",
      skipConfirm: flow === "quickstart",
      quickstartDefaults: flow === "quickstart",
    });
  }

  await writeConfigFile(nextConfig);
  logConfigUpdated(runtime);
  await ensureWorkspaceAndSessions(workspaceDir, runtime, {
    skipBootstrap: Boolean(nextConfig.agents?.defaults?.skipBootstrap),
  });

  if (opts.skipSkills) {
    await prompter.note(t("Skipping skills setup."), t("Skills"));
  } else {
    nextConfig = await setupSkills(nextConfig, workspaceDir, runtime, prompter);
  }

  // Setup hooks (session memory on /new)
  nextConfig = await setupInternalHooks(nextConfig, runtime, prompter);

  nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
  await writeConfigFile(nextConfig);

  await finalizeOnboardingWizard({
    flow,
    opts,
    baseConfig,
    nextConfig,
    workspaceDir,
    settings,
    prompter,
    runtime,
  });

  const installShell = await prompter.confirm({
    message: "Install shell completion script?",
    initialValue: true,
  });

  if (installShell) {
    const shell = process.env.SHELL?.split("/").pop() || "zsh";
    // We pass 'yes=true' to skip any double-confirmation inside the helper,
    // as the wizard prompt above serves as confirmation.
    await installCompletion(shell, true);
  }
}
