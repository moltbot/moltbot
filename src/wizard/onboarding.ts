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
import type { MoltbotConfig } from "../config/config.js";
import {
  DEFAULT_GATEWAY_PORT,
  readConfigFileSnapshot,
  resolveGatewayPort,
  writeConfigFile,
} from "../config/config.js";
import { logConfigUpdated } from "../config/logging.js";
import type { RuntimeEnv } from "../runtime.js";
import { defaultRuntime } from "../runtime.js";
import { resolveUserPath } from "../utils.js";
import { resolveLocaleFromEnv, t } from "../i18n/i18n.js";
import { finalizeOnboardingWizard } from "./onboarding.finalize.js";
import { configureGatewayForOnboarding } from "./onboarding.gateway-config.js";
import type { QuickstartGatewayDefaults, WizardFlow } from "./onboarding.types.js";
import { WizardCancelledError, type WizardPrompter } from "./prompts.js";

async function requireRiskAcknowledgement(params: {
  opts: OnboardOptions;
  prompter: WizardPrompter;
}) {
  if (params.opts.acceptRisk === true) return;

  const locale = resolveLocaleFromEnv();

  const securityBodyEn = [
    "Security warning — please read.",
    "",
    "Moltbot is a hobby project and still in beta. Expect sharp edges.",
    "This bot can read files and run actions if tools are enabled.",
    "A bad prompt can trick it into doing unsafe things.",
    "",
    "If you’re not comfortable with basic security and access control, don’t run Moltbot.",
    "Ask someone experienced to help before enabling tools or exposing it to the internet.",
    "",
    "Recommended baseline:",
    "- Pairing/allowlists + mention gating.",
    "- Sandbox + least-privilege tools.",
    "- Keep secrets out of the agent’s reachable filesystem.",
    "- Use the strongest available model for any bot with tools or untrusted inboxes.",
    "",
    "Run regularly:",
    "moltbot security audit --deep",
    "moltbot security audit --fix",
    "",
    "Must read: https://docs.molt.bot/gateway/security",
  ];

  const securityBodyZhTw = [
    "安全警告 — 請務必先閱讀。",
    "",
    "Moltbot 是一個興趣專案，目前仍在 beta，請預期會有一些粗糙邊角。",
    "當你啟用工具（tools）後，這個 bot 可能具備讀檔/執行動作的能力。",
    "不良提示（prompt）可能誘導它做出不安全的操作。",
    "",
    "如果你不熟悉基本資安與存取控制，建議不要直接在生產環境跑 Moltbot。",
    "在啟用工具或把它暴露到網路前，請找有經驗的人協助檢視設定。",
    "",
    "建議底線（baseline）：",
    "- Pairing/allowlists + mention gating（配對/白名單 + 只回應@提及）",
    "- Sandbox + 最小權限工具",
    "- 不要把機密放在 agent 可讀到的檔案系統",
    "- 有工具或會讀不受信任訊息時，請用你能用到的最強模型",
    "",
    "建議定期執行：",
    "moltbot security audit --deep",
    "moltbot security audit --fix",
    "",
    "必讀：https://docs.molt.bot/gateway/security",
  ];

  await params.prompter.note(
    (locale === "zh-TW" ? securityBodyZhTw : securityBodyEn).join("\n"),
    t(locale, "security.title"),
  );

  const ok = await params.prompter.confirm({
    message: t(locale, "security.confirm"),
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
  const locale = resolveLocaleFromEnv();

  printWizardHeader(runtime);
  await prompter.intro(t(locale, "onboard.intro"));
  await requireRiskAcknowledgement({ opts, prompter });

  const snapshot = await readConfigFileSnapshot();
  let baseConfig: MoltbotConfig = snapshot.valid ? snapshot.config : {};

  if (snapshot.exists && !snapshot.valid) {
    await prompter.note(summarizeExistingConfig(baseConfig), t(locale, "onboard.configInvalid"));
    if (snapshot.issues.length > 0) {
      await prompter.note(
        [
          ...snapshot.issues.map((iss) => `- ${iss.path}: ${iss.message}`),
          "",
          locale === "zh-TW"
            ? "文件：https://docs.molt.bot/gateway/configuration"
            : "Docs: https://docs.molt.bot/gateway/configuration",
        ].join("\n"),
        t(locale, "onboard.configIssues"),
      );
    }
    await prompter.outro(
      `Config invalid. Run \`${formatCliCommand("moltbot doctor")}\` to repair it, then re-run onboarding.`,
    );
    runtime.exit(1);
    return;
  }

  const quickstartHint = `Configure details later via ${formatCliCommand("moltbot configure")}.`;
  const manualHint = "Configure port, network, Tailscale, and auth options.";
  const explicitFlowRaw = opts.flow?.trim();
  const normalizedExplicitFlow = explicitFlowRaw === "manual" ? "advanced" : explicitFlowRaw;
  if (
    normalizedExplicitFlow &&
    normalizedExplicitFlow !== "quickstart" &&
    normalizedExplicitFlow !== "advanced"
  ) {
    runtime.error("Invalid --flow (use quickstart, manual, or advanced).");
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
      message: t(locale, "onboard.mode"),
      options: [
        { value: "quickstart", label: t(locale, "onboard.mode.quickstart"), hint: quickstartHint },
        { value: "advanced", label: t(locale, "onboard.mode.manual"), hint: manualHint },
      ],
      initialValue: "quickstart",
    })) as "quickstart" | "advanced");

  if (opts.mode === "remote" && flow === "quickstart") {
    await prompter.note(
      locale === "zh-TW"
        ? "快速開始（QuickStart）只支援本機 Gateway，將切換為手動模式（Manual）。"
        : "QuickStart only supports local gateways. Switching to Manual mode.",
      t(locale, "onboard.quickstart.title"),
    );
    flow = "advanced";
  }

  if (snapshot.exists) {
    await prompter.note(summarizeExistingConfig(baseConfig), t(locale, "onboard.configExisting"));

    const action = (await prompter.select({
      message: t(locale, "onboard.configHandling"),
      options: [
        { value: "keep", label: t(locale, "onboard.config.keep") },
        { value: "modify", label: t(locale, "onboard.config.modify") },
        { value: "reset", label: t(locale, "onboard.config.reset") },
      ],
    })) as "keep" | "modify" | "reset";

    if (action === "reset") {
      const workspaceDefault = baseConfig.agents?.defaults?.workspace ?? DEFAULT_WORKSPACE;
      const resetScope = (await prompter.select({
        message: t(locale, "onboard.resetScope"),
        options: [
          { value: "config", label: t(locale, "onboard.reset.config") },
          {
            value: "config+creds+sessions",
            label: t(locale, "onboard.reset.configCredsSessions"),
          },
          {
            value: "full",
            label: t(locale, "onboard.reset.full"),
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
      if (value === "loopback") return "Loopback (127.0.0.1)";
      if (value === "lan") return "LAN";
      if (value === "custom") return "Custom IP";
      if (value === "tailnet") return "Tailnet (Tailscale IP)";
      return "Auto";
    };
    const formatAuth = (value: GatewayAuthChoice) => {
      if (value === "token") return "Token (default)";
      return "Password";
    };
    const formatTailscale = (value: "off" | "serve" | "funnel") => {
      if (value === "off") return "Off";
      if (value === "serve") return "Serve";
      return "Funnel";
    };
    const quickstartLines = quickstartGateway.hasExisting
      ? [
          t(locale, "onboard.quickstart.keepExisting"),
          `Gateway port: ${quickstartGateway.port}`,
          `Gateway bind: ${formatBind(quickstartGateway.bind)}`,
          ...(quickstartGateway.bind === "custom" && quickstartGateway.customBindHost
            ? [`Gateway custom IP: ${quickstartGateway.customBindHost}`]
            : []),
          `Gateway auth: ${formatAuth(quickstartGateway.authMode)}`,
          `Tailscale exposure: ${formatTailscale(quickstartGateway.tailscaleMode)}`,
          t(locale, "onboard.quickstart.direct"),
        ]
      : [
          `Gateway port: ${DEFAULT_GATEWAY_PORT}`,
          "Gateway bind: Loopback (127.0.0.1)",
          "Gateway auth: Token (default)",
          "Tailscale exposure: Off",
          t(locale, "onboard.quickstart.direct"),
        ];
    await prompter.note(quickstartLines.join("\n"), t(locale, "onboard.quickstart.title"));
  }

  const localPort = resolveGatewayPort(baseConfig);
  const localUrl = `ws://127.0.0.1:${localPort}`;
  const localProbe = await probeGatewayReachable({
    url: localUrl,
    token: baseConfig.gateway?.auth?.token ?? process.env.CLAWDBOT_GATEWAY_TOKEN,
    password: baseConfig.gateway?.auth?.password ?? process.env.CLAWDBOT_GATEWAY_PASSWORD,
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
          message: t(locale, "onboard.whatToSetup"),
          options: [
            {
              value: "local",
              label: t(locale, "onboard.localGateway"),
              hint: localProbe.ok
                ? `Gateway reachable (${localUrl})`
                : `No gateway detected (${localUrl})`,
            },
            {
              value: "remote",
              label: t(locale, "onboard.remoteGateway"),
              hint: !remoteUrl
                ? "No remote URL configured yet"
                : remoteProbe?.ok
                  ? `Gateway reachable (${remoteUrl})`
                  : `Configured but unreachable (${remoteUrl})`,
            },
          ],
        })) as OnboardMode));

  if (mode === "remote") {
    let nextConfig = await promptRemoteGatewayConfig(baseConfig, prompter);
    nextConfig = applyWizardMetadata(nextConfig, { command: "onboard", mode });
    await writeConfigFile(nextConfig);
    logConfigUpdated(runtime);
    await prompter.outro(t(locale, "onboard.remoteConfigured"));
    return;
  }

  const workspaceInput =
    opts.workspace ??
    (flow === "quickstart"
      ? (baseConfig.agents?.defaults?.workspace ?? DEFAULT_WORKSPACE)
      : await prompter.text({
          message: t(locale, "onboard.workspaceDir"),
          initialValue: baseConfig.agents?.defaults?.workspace ?? DEFAULT_WORKSPACE,
        }));

  const workspaceDir = resolveUserPath(workspaceInput.trim() || DEFAULT_WORKSPACE);

  let nextConfig: MoltbotConfig = {
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
    await prompter.note(t(locale, "onboard.skipChannels"), t(locale, "onboard.channelsTitle"));
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
    await prompter.note(t(locale, "onboard.skipSkills"), t(locale, "onboard.skillsTitle"));
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
}
