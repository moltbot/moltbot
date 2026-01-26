/**
 * Plivo SMS Channel Types
 */

// Plivo account configuration
export type PlivoAccountConfig = {
  name?: string;
  enabled?: boolean;
  authId?: string;
  authToken?: string;
  authIdFile?: string;
  authTokenFile?: string;
  phoneNumber?: string;
  webhookUrl?: string;
  webhookPath?: string;
  webhookSecret?: string;
  dmPolicy?: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom?: string[];
  enableQuickCommands?: boolean;
  quickCommands?: QuickCommand[];
};

// Multi-account configuration
export type PlivoConfig = {
  accounts?: Record<string, PlivoAccountConfig>;
} & PlivoAccountConfig;

// Resolved account with required fields
export type PlivoResolvedAccount = {
  authId: string;
  authToken: string;
  phoneNumber: string;
  webhookUrl?: string;
  webhookPath: string;
  webhookSecret?: string;
  dmPolicy: "pairing" | "allowlist" | "open" | "disabled";
  allowFrom: string[];
  enableQuickCommands: boolean;
  quickCommands: QuickCommand[];
};

// Quick command shortcut
export type QuickCommand = {
  trigger: string;
  fullCommand: string;
  description: string;
};

// Inbound webhook payload from Plivo
export type PlivoInboundWebhook = {
  From: string;
  To: string;
  Text: string;
  MessageUUID: string;
  Type: "sms" | "mms";
  MediaUrl0?: string;
  MediaUrl1?: string;
  MediaUrl2?: string;
  MediaContentType0?: string;
  MediaContentType1?: string;
  MediaContentType2?: string;
};

// Delivery report from Plivo
export type PlivoDeliveryReport = {
  MessageUUID: string;
  Status: string;
  From: string;
  To: string;
  ErrorCode?: string;
};

// Runtime state for a Plivo account
export type PlivoRuntimeState = {
  client: unknown; // Plivo.Client
  server?: unknown; // HTTP server
  phoneNumber: string;
  webhookConfigured: boolean;
};

// Default quick commands
export const DEFAULT_QUICK_COMMANDS: QuickCommand[] = [
  { trigger: "cal", fullCommand: "show my calendar for today", description: "View today's calendar" },
  { trigger: "todo", fullCommand: "show my todo list", description: "View todo list" },
  { trigger: "weather", fullCommand: "what's the weather today", description: "Get weather forecast" },
  { trigger: "remind", fullCommand: "set a reminder", description: "Create a reminder" },
  { trigger: "note", fullCommand: "save a note", description: "Save a quick note" },
  { trigger: "help", fullCommand: "show available commands", description: "List all quick commands" },
];
