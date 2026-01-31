/**
 * Type definitions for the Cursor MCP server
 */

export type CursorMcpConfig = {
  enabled?: boolean;
  port?: number;
  autoApproveTools?: string[];
  gatewayUrl?: string;
  gatewayToken?: string;
  gatewayPassword?: string;
  defaultSessionKey?: string;
};

export type McpToolResult = {
  content: Array<{
    type: "text" | "image" | "resource";
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
  }>;
  isError?: boolean;
};

export type ChatRequest = {
  message: string;
  sessionKey?: string;
  model?: string;
  stream?: boolean;
};

export type SessionInfo = {
  sessionKey: string;
  agentId: string;
  messageCount: number;
  lastActivity?: string;
  model?: string;
};

export type ChannelStatus = {
  channelId: string;
  accountId: string;
  status: "connected" | "disconnected" | "error";
  lastHeartbeat?: string;
  error?: string;
};

export type GatewayHealth = {
  status: "healthy" | "degraded" | "unhealthy";
  uptime: number;
  version: string;
  channels: ChannelStatus[];
  activeSessionCount: number;
};
