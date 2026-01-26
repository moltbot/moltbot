import type {
  ChannelOnboardingAdapter,
  ChannelOnboardingDmPolicy,
  ClawdbotConfig,
  DmPolicy,
  WizardPrompter,
} from "clawdbot/plugin-sdk";
import {
  addWildcardAllowFrom,
  DEFAULT_ACCOUNT_ID,
  normalizeAccountId,
  promptAccountId,
} from "clawdbot/plugin-sdk";

import {
  listFeishuAccountIds,
  resolveDefaultFeishuAccountId,
  resolveFeishuAccount,
} from "./accounts.js";

const channel = "feishu" as const;

function setFeishuDmPolicy(cfg: ClawdbotConfig, policy: DmPolicy) {
  const allowFrom =
    policy === "open" ? addWildcardAllowFrom(cfg.channels?.feishu?.dm?.allowFrom) : undefined;
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...(cfg.channels?.feishu ?? {}),
        dm: {
          ...(cfg.channels?.feishu?.dm ?? {}),
          policy,
          ...(allowFrom ? { allowFrom } : {}),
        },
      },
    },
  } as ClawdbotConfig;
}

async function noteFeishuAppHelp(prompter: WizardPrompter): Promise<void> {
  await prompter.note(
    [
      "1) Create a Feishu app and enable the bot capability",
      "2) Configure event subscription callback: https://gateway.example.com/feishu",
      "3) Subscribe to the im.message.receive_v1 event",
      "4) Copy appId/appSecret + verification token (or encrypt key) into Clawdbot",
      "Docs: https://docs.clawd.bot/channels/feishu",
    ].join("\n"),
    "Feishu bot app",
  );
}

function applyAccountPatch(params: {
  cfg: ClawdbotConfig;
  accountId: string;
  patch: Record<string, unknown>;
}): ClawdbotConfig {
  const { cfg, accountId, patch } = params;
  if (accountId === DEFAULT_ACCOUNT_ID) {
    return {
      ...cfg,
      channels: {
        ...cfg.channels,
        feishu: {
          ...(cfg.channels?.feishu ?? {}),
          enabled: true,
          ...patch,
        },
      },
    } as ClawdbotConfig;
  }
  return {
    ...cfg,
    channels: {
      ...cfg.channels,
      feishu: {
        ...(cfg.channels?.feishu ?? {}),
        enabled: true,
        accounts: {
          ...(cfg.channels?.feishu?.accounts ?? {}),
          [accountId]: {
            ...(cfg.channels?.feishu?.accounts?.[accountId] ?? {}),
            enabled: true,
            ...patch,
          },
        },
      },
    },
  } as ClawdbotConfig;
}

async function promptFeishuAllowFrom(params: {
  cfg: ClawdbotConfig;
  prompter: WizardPrompter;
  accountId: string;
}): Promise<ClawdbotConfig> {
  const resolved = resolveFeishuAccount({ cfg: params.cfg, accountId: params.accountId });
  const existingAllowFrom = resolved.config.dm?.allowFrom ?? [];
  const entry = await params.prompter.text({
    message: "Feishu allowFrom (open id)",
    placeholder: "ou_xxx",
    initialValue: existingAllowFrom[0] ? String(existingAllowFrom[0]) : undefined,
    validate: (value) => {
      const raw = String(value ?? "").trim();
      if (!raw) return "Required";
      if (!/^ou_/i.test(raw)) return "Use a Feishu open id (starts with ou_)";
      return undefined;
    },
  });
  const normalized = String(entry).trim();
  const merged = [
    ...existingAllowFrom.map((item) => String(item).trim()).filter(Boolean),
    normalized,
  ];
  const unique = [...new Set(merged)];

  const existingDm = resolved.config.dm ?? {};
  return applyAccountPatch({
    cfg: params.cfg,
    accountId: params.accountId,
    patch: {
      dm: { ...existingDm, policy: "allowlist", allowFrom: unique },
    },
  });
}

const dmPolicy: ChannelOnboardingDmPolicy = {
  label: "Feishu",
  channel,
  policyKey: "channels.feishu.dm.policy",
  allowFromKey: "channels.feishu.dm.allowFrom",
  getCurrent: (cfg) => cfg.channels?.feishu?.dm?.policy ?? "pairing",
  setPolicy: (cfg, policy) => setFeishuDmPolicy(cfg as ClawdbotConfig, policy),
  promptAllowFrom: async ({ cfg, prompter, accountId }) => {
    const id =
      accountId && normalizeAccountId(accountId)
        ? (normalizeAccountId(accountId) ?? DEFAULT_ACCOUNT_ID)
        : resolveDefaultFeishuAccountId(cfg as ClawdbotConfig);
    return await promptFeishuAllowFrom({
      cfg: cfg as ClawdbotConfig,
      prompter,
      accountId: id,
    });
  },
};

export const feishuOnboardingAdapter: ChannelOnboardingAdapter = {
  channel,
  dmPolicy,
  getStatus: async ({ cfg }) => {
    const configured = listFeishuAccountIds(cfg as ClawdbotConfig).some((accountId) => {
      const account = resolveFeishuAccount({ cfg: cfg as ClawdbotConfig, accountId });
      return account.credentialSource !== "none";
    });
    return {
      channel,
      configured,
      statusLines: [`Feishu: ${configured ? "configured" : "needs appId/appSecret"}`],
      selectionHint: configured ? "configured" : "plugin · webhook",
      quickstartScore: configured ? 1 : 18,
    };
  },
  configure: async ({
    cfg,
    prompter,
    accountOverrides,
    shouldPromptAccountIds,
    forceAllowFrom,
  }) => {
    const override = accountOverrides.feishu?.trim();
    const defaultAccountId = resolveDefaultFeishuAccountId(cfg as ClawdbotConfig);
    let accountId = override ? normalizeAccountId(override) : defaultAccountId;
    if (shouldPromptAccountIds && !override) {
      accountId = await promptAccountId({
        cfg: cfg as ClawdbotConfig,
        prompter,
        label: "Feishu",
        currentId: accountId,
        listAccountIds: listFeishuAccountIds,
        defaultAccountId,
      });
    }

    let next = cfg as ClawdbotConfig;
    const resolved = resolveFeishuAccount({ cfg: next, accountId });
    const alreadyConfigured = resolved.credentialSource !== "none";

    if (!alreadyConfigured) {
      await noteFeishuAppHelp(prompter);
    }

    const keepCredentials = alreadyConfigured
      ? await prompter.confirm({
          message: "Feishu credentials already configured. Keep them?",
          initialValue: true,
        })
      : false;

    if (!keepCredentials) {
      const appId = String(
        await prompter.text({
          message: "Feishu appId",
          validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
        }),
      ).trim();
      const appSecret = String(
        await prompter.text({
          message: "Feishu appSecret",
          validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
        }),
      ).trim();

      const validationMode = await prompter.select({
        message: "Webhook validation",
        options: [
          { value: "token", label: "Verification token", hint: "Simple shared secret check" },
          { value: "encrypt", label: "Encrypt key", hint: "Signature + encrypted payload" },
        ],
        initialValue: "token",
      });

      const patch: Record<string, unknown> = { appId, appSecret };
      if (validationMode === "encrypt") {
        const encryptKey = String(
          await prompter.text({
            message: "Feishu encrypt key",
            validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
          }),
        ).trim();
        patch.encryptKey = encryptKey;
      } else {
        const verificationToken = String(
          await prompter.text({
            message: "Feishu verification token",
            validate: (value) => (String(value ?? "").trim() ? undefined : "Required"),
          }),
        ).trim();
        patch.verificationToken = verificationToken;
      }

      const wantsPath = await prompter.confirm({
        message: "Customize webhook path? (default: /feishu)",
        initialValue: false,
      });
      if (wantsPath) {
        const webhookPath = String(
          await prompter.text({
            message: "Webhook path (starts with /)",
            initialValue: resolved.config.webhookPath ?? "/feishu",
          }),
        ).trim();
        if (webhookPath) patch.webhookPath = webhookPath;
      }

      next = applyAccountPatch({ cfg: next, accountId, patch });
    }

    if (forceAllowFrom) {
      next = await promptFeishuAllowFrom({ cfg: next, prompter, accountId });
    }

    return { cfg: next, accountId };
  },
};
