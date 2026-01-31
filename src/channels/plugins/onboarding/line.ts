import type { MoltbotConfig } from "../../../config/config.js";
import type { DmPolicy } from "../../../config/types.js";
import { DEFAULT_ACCOUNT_ID } from "../../../routing/session-key.js";
import { formatDocsLink } from "../../../terminal/links.js";
import type { WizardPrompter } from "../../../wizard/prompts.js";
import type { ChannelOnboardingAdapter, ChannelOnboardingDmPolicy } from "../onboarding-types.js";
import { addWildcardAllowFrom } from "./helpers.js";

// ✨ LINE config 類型定義
type LineConfig = {
  enabled?: boolean;
  channelAccessToken?: string;
  channelSecret?: string;
  tokenFile?: string;
  secretFile?: string;
  dmPolicy?: DmPolicy;
  allowFrom?: Array<string | number>;
};

const channel = "line" as const;

function setLineDmPolicy(cfg: MoltbotConfig, dmPolicy: DmPolicy) {
  const lineConfig = (cfg.channels?.line ?? {}) as LineConfig;
  const allowFrom = dmPolicy === "open" ? addWildcardAllowFrom(lineConfig.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      line: {
        ...lineConfig,
        dmPolicy,
        ...(allowFrom ? { allowFrom } : {}),
      },
    },
  };
}

async function noteLineTokenHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Go to https://developers.line.biz/console/",
      "2) Create a Messaging API channel (or select existing)",
      "3) Go to 'Messaging API' tab",
      "4) Issue a Channel Access Token (long-lived)",
      "5) Copy the token",
      `Docs: ${formatDocsLink("/channels/line")}`,
      "Website: https://molt.bot",
    ].join("\n"),
    "LINE Channel Access Token",
  );
}

async function noteLineSecretHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) In the same Messaging API tab",
      "2) Find 'Channel Secret' section",
      "3) Copy the secret",
      `Docs: ${formatDocsLink("/channels/line")}`,
    ].join("\n"),
    "LINE Channel Secret",
  );
}

async function noteLineWebhookHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "📌 Webhook Setup Required:",
      "1) In LINE Developers Console, go to 'Messaging API' tab",
      "2) Set Webhook URL to: https://YOUR_PUBLIC_URL/webhook/line",
      "3) Enable 'Use webhook'",
      "4) Verify the webhook (it should show success)",
      "",
      "For local development:",
      "- Use ngrok: ngrok http 18789",
      "- Or use Tailscale Funnel (built into Moltbot)",
      `Docs: ${formatDocsLink("/channels/line")}`,
    ].join("\n"),
    "LINE Webhook",
  );
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "LINE",
  channel,
  policyKey: "channels.line.dmPolicy",
  allowFromKey: "channels.line.allowFrom",
  getCurrent: (cfg) => {
    const lineConfig = (cfg.channels?.line ?? {}) as LineConfig;
    return lineConfig.dmPolicy ?? "pairing";
  },
  setPolicy: (cfg, policy) => setLineDmPolicy(cfg, policy),
  promptAllowFrom: async ({ cfg, prompter }) => {
    const lineConfig = (cfg.channels?.line ?? {}) as LineConfig;
    const existingAllowFrom = lineConfig.allowFrom ?? [];

    await prompter.note(
      [
        "LINE User IDs are typically U followed by 32 hex characters.",
        "You can find user IDs in the Moltbot logs when users message your bot.",
        "Example: Ub1234567890abcdef1234567890abcdef",
      ].join("\n"),
      "LINE User ID",
    );

    const entry = await prompter.text({
      message: "LINE allowFrom (user ID)",
      placeholder: "",
      initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
      validate: (value) => {
        const trimmed = String(value ?? "").trim();
        if (!trimmed) return "Required";
        if (!/^U[a-f0-9]{32}$/i.test(trimmed)) {
          return "Invalid LINE user ID format (should be U + 32 hex characters)";
        }
        return undefined;
      },
    });

    const userId = String(entry).trim();
    const merged = [
      ...existingAllowFrom.map((item: string | number) => String(item).trim()).filter(Boolean),
      userId,
    ];
    const unique = [...new Set(merged)];

    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        line: {
          ...lineConfig,
          enabled: true,
          dmPolicy: "allowlist" as DmPolicy,
          allowFrom: unique,
        },
      },
    };
  },
};

export const lineOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  getStatus: async ({ cfg }) => {
    const lineConfig = (cfg.channels?.line ?? {}) as LineConfig;
    const configured = Boolean(
      lineConfig.channelAccessToken?.trim() || lineConfig.tokenFile?.trim(),
    );
    return {
      channel,
      configured,
      statusLines: [`LINE: ${configured ? "configured" : "needs credentials"}`],
      selectionHint: configured ? "configured" : "popular in Japan/Taiwan/Thailand",
      quickstartScore: configured ? 1 : 7,
    };
  },
  configure: async ({ cfg, prompter, forceAllowFrom }) => {
    let next = cfg;
    const lineConfig = (cfg.channels?.line ?? {}) as LineConfig;
    const hasToken = Boolean(lineConfig.channelAccessToken || lineConfig.tokenFile);
    const hasSecret = Boolean(lineConfig.channelSecret || lineConfig.secretFile);

    // Prompt for Channel Access Token
    let channelAccessToken: string | null = null;
    if (!hasToken) {
      await noteLineTokenHelp(prompter);
    } else {
      const keep = await prompter.confirm({
        message: "LINE Channel Access Token already configured. Keep it?",
        initialValue: true,
      });
      if (!keep) {
        await noteLineTokenHelp(prompter);
        channelAccessToken = null;
      }
    }

    if (!hasToken || channelAccessToken === null) {
      channelAccessToken = String(
        await prompter.text({
          message: "Enter LINE Channel Access Token",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
    }

    // Prompt for Channel Secret
    let channelSecret: string | null = null;
    if (!hasSecret) {
      await noteLineSecretHelp(prompter);
    } else {
      const keep = await prompter.confirm({
        message: "LINE Channel Secret already configured. Keep it?",
        initialValue: true,
      });
      if (!keep) {
        await noteLineSecretHelp(prompter);
        channelSecret = null;
      }
    }

    if (!hasSecret || channelSecret === null) {
      channelSecret = String(
        await prompter.text({
          message: "Enter LINE Channel Secret",
          validate: (value) => (value?.trim() ? undefined : "Required"),
        }),
      ).trim();
    }

    // Update config
    if (channelAccessToken || channelSecret) {
      next = {
        ...next,
        channels: {
          ...next.channels,
          line: {
            ...lineConfig,
            enabled: true,
            ...(channelAccessToken ? { channelAccessToken } : {}),
            ...(channelSecret ? { channelSecret } : {}),
          },
        },
      };
    }

    // Show webhook setup instructions
    await noteLineWebhookHelp(prompter);

    // Prompt for allowFrom if needed
    if (forceAllowFrom && dmPolicy.promptAllowFrom) {
      next = await dmPolicy.promptAllowFrom({ cfg: next, prompter });
    }

    return { cfg: next, accountId: DEFAULT_ACCOUNT_ID };
  },
  dmPolicy,
  disable: (cfg) => {
    const lineConfig = (cfg.channels?.line ?? {}) as LineConfig;
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        line: { ...lineConfig, enabled: false },
      },
    };
  },
};
