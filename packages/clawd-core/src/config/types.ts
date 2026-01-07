/**
 * Clawd Core Configuration Types
 */

export type ThinkLevel = "off" | "minimal" | "low" | "medium" | "high";
export type VerboseLevel = "on" | "off";

export type SessionScope = "per-sender" | "global";

export type SkillConfig = {
  enabled?: boolean;
  apiKey?: string;
  env?: Record<string, string>;
};

export type ClawdConfig = {
  agent?: {
    workspace?: string;
    model?: {
      provider?: string;
      model?: string;
      fallbacks?: Array<{ provider: string; model: string }>;
    };
    thinking?: ThinkLevel;
    verbose?: VerboseLevel;
    timeout?: number;
    bash?: {
      backgroundMs?: number;
      timeoutSec?: number;
    };
    tools?: {
      allow?: string[];
      deny?: string[];
    };
    models?: Record<string, { alias?: string }>;
  };
  session?: {
    scope?: SessionScope;
    mainKey?: string;
    idleMinutes?: number;
    store?: string;
  };
  skills?: {
    entries?: Record<string, SkillConfig>;
    allowBundled?: string[];
    load?: {
      extraDirs?: string[];
    };
    install?: {
      preferBrew?: boolean;
      nodeManager?: "npm" | "pnpm" | "yarn" | "bun";
    };
  };
  cron?: {
    /** Enable cron scheduler (default: true) */
    enabled?: boolean;
    /** Custom store path for cron jobs */
    store?: string;
    /** Maximum concurrent cron job runs */
    maxConcurrentRuns?: number;
  };
};

export type SessionEntry = {
  sessionId: string;
  updatedAt: number;
  thinkingLevel?: string;
  verboseLevel?: string;
  modelOverride?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  modelProvider?: string;
  model?: string;
  contextTokens?: number;
  compactionCount?: number;
  displayName?: string;
};
