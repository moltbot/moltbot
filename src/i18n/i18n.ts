export type MoltbotLocale = "en" | "zh-TW";

export function resolveLocaleFromEnv(env: NodeJS.ProcessEnv = process.env): MoltbotLocale {
  const raw = (env.MOLTBOT_LANG ?? env.CLAWDBOT_LANG ?? env.LANG ?? env.LC_ALL ?? "").trim();
  const norm = raw.replace("_", "-");
  if (!norm) return "en";

  // Common forms:
  // - zh_TW.UTF-8
  // - zh-TW
  // - zh-Hant
  // - zh-Hant-TW
  const lower = norm.toLowerCase();
  if (lower.startsWith("zh")) {
    if (lower.includes("tw") || lower.includes("hant")) return "zh-TW";
    // If user explicitly asked for Chinese, default to Traditional.
    return "zh-TW";
  }

  return "en";
}

const dict: Record<MoltbotLocale, Record<string, string>> = {
  en: {
    "onboard.intro": "Moltbot onboarding",
    "onboard.mode": "Onboarding mode",
    "onboard.mode.quickstart": "QuickStart",
    "onboard.mode.manual": "Manual",

    "onboard.quickstart.title": "QuickStart",
    "onboard.quickstart.keepExisting": "Keeping your current gateway settings:",
    "onboard.quickstart.direct": "Direct to chat channels.",

    "onboard.whatToSetup": "What do you want to set up?",
    "onboard.localGateway": "Local gateway (this machine)",
    "onboard.remoteGateway": "Remote gateway (info-only)",

    "onboard.configExisting": "Existing config detected",
    "onboard.configInvalid": "Invalid config",
    "onboard.configIssues": "Config issues",
    "onboard.configHandling": "Config handling",
    "onboard.config.keep": "Use existing values",
    "onboard.config.modify": "Update values",
    "onboard.config.reset": "Reset",

    "onboard.resetScope": "Reset scope",
    "onboard.reset.config": "Config only",
    "onboard.reset.configCredsSessions": "Config + creds + sessions",
    "onboard.reset.full": "Full reset (config + creds + sessions + workspace)",

    "onboard.workspaceDir": "Workspace directory",

    "security.title": "Security",
    "security.noteTitle": "Security warning — please read.",
    "security.confirm": "I understand this is powerful and inherently risky. Continue?",

    "windows.detected": "Windows detected.",
    "windows.recommend": "WSL2 is strongly recommended; native Windows is untested and more problematic.",
    "windows.guide": "Guide: https://docs.molt.bot/windows",

    "onboard.skipChannels": "Skipping channel setup.",
    "onboard.channelsTitle": "Channels",
    "onboard.skipSkills": "Skipping skills setup.",
    "onboard.skillsTitle": "Skills",

    "onboard.remoteConfigured": "Remote gateway configured.",
  },
  "zh-TW": {
    "onboard.intro": "Moltbot 初始設定（Onboarding）",
    "onboard.mode": "安裝/初始化模式",
    "onboard.mode.quickstart": "快速開始（QuickStart）",
    "onboard.mode.manual": "手動設定（Manual）",

    "onboard.quickstart.title": "快速開始（QuickStart）",
    "onboard.quickstart.keepExisting": "保留你目前的 Gateway 設定：",
    "onboard.quickstart.direct": "直接導向聊天管道設定。",

    "onboard.whatToSetup": "你想要設定哪一種？",
    "onboard.localGateway": "本機 Gateway（這台機器）",
    "onboard.remoteGateway": "遠端 Gateway（僅寫入設定/不做本機安裝）",

    "onboard.configExisting": "偵測到既有設定",
    "onboard.configInvalid": "設定檔不合法",
    "onboard.configIssues": "設定問題",
    "onboard.configHandling": "設定檔處理方式",
    "onboard.config.keep": "沿用既有值",
    "onboard.config.modify": "更新設定",
    "onboard.config.reset": "重置",

    "onboard.resetScope": "重置範圍",
    "onboard.reset.config": "只重置設定檔",
    "onboard.reset.configCredsSessions": "設定檔 + 憑證 + sessions",
    "onboard.reset.full": "完整重置（設定檔 + 憑證 + sessions + workspace）",

    "onboard.workspaceDir": "Workspace 目錄",

    "security.title": "安全性",
    "security.noteTitle": "安全警告 — 請務必先閱讀",
    "security.confirm": "我了解這很強大且有風險，仍要繼續嗎？",

    "windows.detected": "偵測到 Windows。",
    "windows.recommend": "強烈建議使用 WSL2；原生 Windows 尚未完整測試，問題也比較多。",
    "windows.guide": "指南：https://docs.molt.bot/windows",

    "onboard.skipChannels": "略過聊天管道設定。",
    "onboard.channelsTitle": "聊天管道（Channels）",
    "onboard.skipSkills": "略過技能（Skills）安裝。",
    "onboard.skillsTitle": "技能（Skills）",

    "onboard.remoteConfigured": "已完成遠端 Gateway 設定。",
  },
};

export function t(locale: MoltbotLocale, key: string): string {
  return dict[locale]?.[key] ?? dict.en[key] ?? key;
}
