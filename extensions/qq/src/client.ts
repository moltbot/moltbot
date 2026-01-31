import WebSocket from "ws";
import EventEmitter from "events";
import type { OneBotEvent, OneBotMessage } from "./types.js";

interface OneBotClientOptions {
  wsUrl: string;
  accessToken?: string;
}

export class OneBotClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private options: OneBotClientOptions;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private isAlive = false;

  constructor(options: OneBotClientOptions) {
    super();
    this.options = options;
  }

  connect() {
    const headers: Record<string, string> = {};
    if (this.options.accessToken) {
      headers["Authorization"] = `Bearer ${this.options.accessToken}`;
    }

    this.ws = new WebSocket(this.options.wsUrl, { headers });

    this.ws.on("open", () => {
      this.isAlive = true;
      this.emit("connect");
      console.log("[QQ] Connected to OneBot server");
    });

    this.ws.on("message", (data) => {
      try {
        const payload = JSON.parse(data.toString()) as OneBotEvent;
        if (payload.post_type === "meta_event" && payload.meta_event_type === "heartbeat") {
          this.isAlive = true;
          return;
        }
        this.emit("message", payload);
      } catch (err) {
        console.error("[QQ] Failed to parse message:", err);
      }
    });

    this.ws.on("close", () => {
      this.isAlive = false;
      this.emit("disconnect");
      console.log("[QQ] Disconnected. Reconnecting in 5s...");
      this.reconnectTimer = setTimeout(() => this.connect(), 5000);
    });

    this.ws.on("error", (err) => {
      console.error("[QQ] WebSocket error:", err);
      this.ws?.close();
    });
  }

  sendPrivateMsg(userId: number, message: OneBotMessage | string) {
    this.send("send_private_msg", { user_id: userId, message });
  }

  sendGroupMsg(groupId: number, message: OneBotMessage | string) {
    this.send("send_group_msg", { group_id: groupId, message });
  }

  private send(action: string, params: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action, params }));
    } else {
      console.warn("[QQ] Cannot send message, WebSocket not open");
    }
  }

  disconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
