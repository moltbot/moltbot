export type FeishuDmPolicy = "pairing" | "allowlist" | "open" | "disabled";

export type FeishuGroupPolicy = "open" | "disabled" | "allowlist";

export type FeishuDmConfig = {
  enabled?: boolean;
  policy?: FeishuDmPolicy;
  allowFrom?: Array<string | number>;
};

export type FeishuGroupConfig = {
  enabled?: boolean;
  allow?: boolean;
  requireMention?: boolean;
  users?: Array<string | number>;
  systemPrompt?: string;
};

export type FeishuAccountConfig = {
  name?: string;
  enabled?: boolean;
  appId?: string;
  appSecret?: string;
  verificationToken?: string;
  encryptKey?: string;
  webhookPath?: string;
  webhookUrl?: string;
  dm?: FeishuDmConfig;
  requireMention?: boolean;
  groupPolicy?: FeishuGroupPolicy;
  groupAllowFrom?: Array<string | number>;
  groups?: Record<string, FeishuGroupConfig | undefined>;
  textChunkLimit?: number;
  chunkMode?: "length" | "newline";
  blockStreaming?: boolean;
};

export type FeishuConfig = FeishuAccountConfig & {
  accounts?: Record<string, FeishuAccountConfig | undefined>;
  defaultAccount?: string;
};
