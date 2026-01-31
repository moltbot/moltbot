import { normalizeGatewayTokenInput, randomToken } from "../commands/onboard-helpers.js";
import type { GatewayAuthChoice } from "../commands/onboard-types.js";
import type { OpenClawConfig } from "../config/config.js";
import { findTailscaleBinary } from "../infra/tailscale.js";
import type { RuntimeEnv } from "../runtime.js";
import { t } from "../i18n/index.js";
import type {
  GatewayWizardSettings,
  QuickstartGatewayDefaults,
  WizardFlow,
} from "./onboarding.types.js";
import type { WizardPrompter } from "./prompts.js";

type ConfigureGatewayOptions = {
  flow: WizardFlow;
  baseConfig: OpenClawConfig;
  nextConfig: OpenClawConfig;
  localPort: number;
  quickstartGateway: QuickstartGatewayDefaults;
  prompter: WizardPrompter;
  runtime: RuntimeEnv;
};

type ConfigureGatewayResult = {
  nextConfig: OpenClawConfig;
  settings: GatewayWizardSettings;
};

export async function configureGatewayForOnboarding(
  opts: ConfigureGatewayOptions,
): Promise<ConfigureGatewayResult> {
  const { flow, localPort, quickstartGateway, prompter } = opts;
  let { nextConfig } = opts;

  const port =
    flow === "quickstart"
      ? quickstartGateway.port
      : Number.parseInt(
          String(
            await prompter.text({
              message: t("Gateway port"),
              initialValue: String(localPort),
              validate: (value) => (Number.isFinite(Number(value)) ? undefined : t("Invalid port")),
            }),
          ),
          10,
        );

  let bind = (
    flow === "quickstart"
      ? quickstartGateway.bind
      : ((await prompter.select({
          message: t("Gateway bind"),
          options: [
            { value: "loopback", label: t("Loopback (127.0.0.1)") },
            { value: "lan", label: t("Local network (0.0.0.0)") },
            { value: "tailnet", label: t("Tailnet (Tailscale IP)") },
            { value: "auto", label: t("Auto (loopback → local network)") },
            { value: "custom", label: t("Custom IP") },
          ],
        })) as "loopback" | "lan" | "auto" | "custom" | "tailnet")
  ) as "loopback" | "lan" | "auto" | "custom" | "tailnet";

  let customBindHost = quickstartGateway.customBindHost;
  if (bind === "custom") {
    const needsPrompt = flow !== "quickstart" || !customBindHost;
    if (needsPrompt) {
      const input = await prompter.text({
        message: t("Custom IP address"),
        placeholder: "192.168.1.100",
        initialValue: customBindHost ?? "",
        validate: (value) => {
          if (!value) return t("Custom bind mode requires IP address");
          const trimmed = value.trim();
          const parts = trimmed.split(".");
          if (parts.length !== 4) return t("Invalid IPv4 address (e.g.: 192.168.1.100)");
          if (
            parts.every((part) => {
              const n = parseInt(part, 10);
              return !Number.isNaN(n) && n >= 0 && n <= 255 && part === String(n);
            })
          )
            return undefined;
          return t("Invalid IPv4 address (each octet must be between 0-255)");
        },
      });
      customBindHost = typeof input === "string" ? input.trim() : undefined;
    }
  }

  let authMode = (
    flow === "quickstart"
      ? quickstartGateway.authMode
      : ((await prompter.select({
          message: t("Gateway auth"),
          options: [
            {
              value: "token",
              label: t("Token"),
              hint: t("Recommended default (local + remote)"),
            },
            { value: "password", label: t("Password") },
          ],
          initialValue: "token",
        })) as GatewayAuthChoice)
  ) as GatewayAuthChoice;

  const tailscaleMode = (
    flow === "quickstart"
      ? quickstartGateway.tailscaleMode
      : ((await prompter.select({
          message: t("Tailscale exposure"),
          options: [
            { value: "off", label: t("Off"), hint: t("No Tailscale exposure") },
            {
              value: "serve",
              label: t("Serve"),
              hint: t("Private HTTPS for your tailnet (devices on Tailscale)"),
            },
            {
              value: "funnel",
              label: t("Funnel"),
              hint: t("Public HTTPS via Tailscale Funnel (internet)"),
            },
          ],
        })) as "off" | "serve" | "funnel")
  ) as "off" | "serve" | "funnel";

  // Detect Tailscale binary before proceeding with serve/funnel setup.
  if (tailscaleMode !== "off") {
    const tailscaleBin = await findTailscaleBinary();
    if (!tailscaleBin) {
      await prompter.note(
        [
          t("Tailscale binary not found in PATH or /Applications."),
          t("Please install Tailscale from:"),
          t("  https://tailscale.com/download/mac"),
          "",
          t("You can continue setup, but serve/funnel will fail at runtime."),
        ].join("\n"),
        t("Tailscale warning"),
      );
    }
  }

  let tailscaleResetOnExit = flow === "quickstart" ? quickstartGateway.tailscaleResetOnExit : false;
  if (tailscaleMode !== "off" && flow !== "quickstart") {
    await prompter.note(
      [
        t("Docs:"),
        "https://docs.openclaw.ai/gateway/tailscale",
        "https://docs.openclaw.ai/web",
      ].join("\n"),
      t("Tailscale"),
    );
    tailscaleResetOnExit = Boolean(
      await prompter.confirm({
        message: t("Reset Tailscale serve/funnel on exit?"),
        initialValue: false,
      }),
    );
  }

  // Safety + constraints:
  // - Tailscale wants bind=loopback so we never expose a non-loopback server + tailscale serve/funnel at once.
  // - Funnel requires password auth.
  if (tailscaleMode !== "off" && bind !== "loopback") {
    await prompter.note(
      t("Tailscale requires bind=loopback. Adjusting bind to loopback."),
      t("Note"),
    );
    bind = "loopback";
    customBindHost = undefined;
  }

  if (tailscaleMode === "funnel" && authMode !== "password") {
    await prompter.note(t("Tailscale funnel requires password auth."), t("Note"));
    authMode = "password";
  }

  let gatewayToken: string | undefined;
  if (authMode === "token") {
    if (flow === "quickstart") {
      gatewayToken = quickstartGateway.token ?? randomToken();
    } else {
      const tokenInput = await prompter.text({
        message: t("Gateway token (leave blank to generate)"),
        placeholder: t("Required for multi-machine or non-loopback access"),
        initialValue: quickstartGateway.token ?? "",
      });
      gatewayToken = normalizeGatewayTokenInput(tokenInput) || randomToken();
    }
  }

  if (authMode === "password") {
    const password =
      flow === "quickstart" && quickstartGateway.password
        ? quickstartGateway.password
        : await prompter.text({
            message: t("Gateway password"),
            validate: (value) => (value?.trim() ? undefined : t("Required")),
          });
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "password",
          password: String(password).trim(),
        },
      },
    };
  } else if (authMode === "token") {
    nextConfig = {
      ...nextConfig,
      gateway: {
        ...nextConfig.gateway,
        auth: {
          ...nextConfig.gateway?.auth,
          mode: "token",
          token: gatewayToken,
        },
      },
    };
  }

  nextConfig = {
    ...nextConfig,
    gateway: {
      ...nextConfig.gateway,
      port,
      bind,
      ...(bind === "custom" && customBindHost ? { customBindHost } : {}),
      tailscale: {
        ...nextConfig.gateway?.tailscale,
        mode: tailscaleMode,
        resetOnExit: tailscaleResetOnExit,
      },
    },
  };

  return {
    nextConfig,
    settings: {
      port,
      bind,
      customBindHost: bind === "custom" ? customBindHost : undefined,
      authMode,
      gatewayToken,
      tailscaleMode,
      tailscaleResetOnExit,
    },
  };
}
