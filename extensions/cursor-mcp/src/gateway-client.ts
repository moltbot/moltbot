/**
 * Gateway client for MCP server
 *
 * This module provides a standalone WebSocket client for communicating
 * with the OpenClaw gateway. It implements the gateway's JSON-RPC protocol.
 */

import { randomUUID } from "node:crypto";
import { WebSocket } from "ws";

import type { CursorMcpConfig } from "./types.js";

type RequestFrame = {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
};

type ResponseFrame = {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { message?: string };
};

type EventFrame = {
  type: "evt";
  event: string;
  payload?: unknown;
  seq?: number;
};

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
};

const PROTOCOL_VERSION = 6;

export class McpGatewayClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private config: CursorMcpConfig;
  private pending = new Map<string, Pending>();
  private eventHandlers: Map<string, ((payload: unknown) => void)[]> = new Map();
  private connectResolve: ((value: void) => void) | null = null;
  private connectReject: ((err: Error) => void) | null = null;
  private connectNonce: string | null = null;
  private connectSent = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: CursorMcpConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connectResolve = resolve;
      this.connectReject = reject;

      const gatewayUrl = this.config.gatewayUrl ?? "ws://127.0.0.1:18789";

      try {
        this.ws = new WebSocket(gatewayUrl, {
          maxPayload: 25 * 1024 * 1024,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      this.ws.on("open", () => {
        this.queueConnect();
      });

      this.ws.on("message", (data) => {
        const raw = typeof data === "string" ? data : data.toString("utf8");
        this.handleMessage(raw);
      });

      this.ws.on("close", (code, reason) => {
        const reasonText = typeof reason === "string" ? reason : reason.toString("utf8");
        this.ws = null;
        this.connected = false;
        this.flushPendingErrors(new Error(`Gateway closed (${code}): ${reasonText}`));
      });

      this.ws.on("error", (err) => {
        if (!this.connectSent && this.connectReject) {
          this.connectReject(err instanceof Error ? err : new Error(String(err)));
          this.connectResolve = null;
          this.connectReject = null;
        }
      });
    });
  }

  disconnect(): void {
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.flushPendingErrors(new Error("Client disconnected"));
  }

  isConnected(): boolean {
    return this.connected;
  }

  private queueConnect(): void {
    this.connectNonce = null;
    this.connectSent = false;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    // Wait a bit for optional challenge before sending connect
    this.connectTimer = setTimeout(() => {
      this.sendConnect();
    }, 500);
  }

  private sendConnect(): void {
    if (this.connectSent) return;
    this.connectSent = true;
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }

    const params = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: "mcp",
        displayName: "Cursor MCP",
        version: "2026.1.29",
        platform: process.platform,
        mode: "backend",
      },
      caps: [],
      auth: {
        token: this.config.gatewayToken,
        password: this.config.gatewayPassword,
      },
      role: "operator",
      scopes: ["operator.admin"],
    };

    this.request("connect", params)
      .then(() => {
        this.connected = true;
        if (this.connectResolve) {
          this.connectResolve();
          this.connectResolve = null;
          this.connectReject = null;
        }
      })
      .catch((err) => {
        if (this.connectReject) {
          this.connectReject(err instanceof Error ? err : new Error(String(err)));
          this.connectResolve = null;
          this.connectReject = null;
        }
        this.ws?.close(1008, "connect failed");
      });
  }

  private handleMessage(raw: string): void {
    try {
      const parsed = JSON.parse(raw);

      // Handle events
      if (parsed.type === "evt" || parsed.event) {
        const evt = parsed as EventFrame;

        // Handle connect challenge
        if (evt.event === "connect.challenge") {
          const payload = evt.payload as { nonce?: unknown } | undefined;
          const nonce = payload && typeof payload.nonce === "string" ? payload.nonce : null;
          if (nonce) {
            this.connectNonce = nonce;
            this.sendConnect();
          }
          return;
        }

        // Dispatch to event handlers
        const handlers = this.eventHandlers.get(evt.event);
        if (handlers) {
          for (const handler of handlers) {
            try {
              handler(evt.payload);
            } catch (err) {
              console.error(`Event handler error for ${evt.event}:`, err);
            }
          }
        }
        return;
      }

      // Handle responses
      if (parsed.type === "res" || (parsed.id && (parsed.ok !== undefined || parsed.error))) {
        const res = parsed as ResponseFrame;
        const pending = this.pending.get(res.id);
        if (!pending) return;

        this.pending.delete(res.id);
        if (res.ok) {
          pending.resolve(res.payload);
        } else {
          pending.reject(new Error(res.error?.message ?? "Unknown error"));
        }
      }
    } catch (err) {
      console.error(`Gateway message parse error: ${String(err)}`);
    }
  }

  private flushPendingErrors(err: Error): void {
    for (const [, p] of this.pending) {
      p.reject(err);
    }
    this.pending.clear();
  }

  onEvent(eventName: string, handler: (payload: unknown) => void): () => void {
    const handlers = this.eventHandlers.get(eventName) ?? [];
    handlers.push(handler);
    this.eventHandlers.set(eventName, handlers);

    return () => {
      const idx = handlers.indexOf(handler);
      if (idx >= 0) handlers.splice(idx, 1);
    };
  }

  async request<T = unknown>(method: string, params?: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Gateway not connected");
    }

    const id = randomUUID();
    const frame: RequestFrame = { type: "req", id, method, params };

    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
      });
      this.ws!.send(JSON.stringify(frame));
    });
  }

  // Convenience methods for common operations

  async chat(params: {
    message: string;
    sessionKey?: string;
    model?: string;
    deliver?: boolean;
  }): Promise<unknown> {
    return this.request("chat.run", {
      message: params.message,
      sessionKey: params.sessionKey ?? this.config.defaultSessionKey ?? "agent:main:cursor",
      model: params.model,
      deliver: params.deliver ?? false,
    });
  }

  async listSessions(): Promise<unknown> {
    return this.request("sessions.list", {});
  }

  async getSessionInfo(sessionKey: string): Promise<unknown> {
    return this.request("sessions.get", { sessionKey });
  }

  async clearSession(sessionKey: string): Promise<unknown> {
    return this.request("sessions.clear", { sessionKey });
  }

  async getChannelStatus(): Promise<unknown> {
    return this.request("channels.status", {});
  }

  async getHealth(): Promise<unknown> {
    return this.request("health", {});
  }

  async getModels(): Promise<unknown> {
    return this.request("models.list", {});
  }

  async executeCommand(command: string): Promise<unknown> {
    return this.request("command", { command });
  }
}
