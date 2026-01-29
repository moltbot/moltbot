/**
 * WebSocket Gateway Client for Security Testing
 *
 * Provides direct protocol communication with the Moltbot gateway
 * for E2E security test scenarios.
 *
 * Protocol version: 3
 * Frame types: req, res, event
 */
import WebSocket from "ws";

const PROTOCOL_VERSION = 3;

// Frame types
interface RequestFrame {
  type: "req";
  id: string;
  method: string;
  params?: unknown;
}

interface ResponseFrame {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: ErrorShape;
}

interface EventFrame {
  type: "event";
  event: string;
  payload?: unknown;
  seq: number;
}

interface ErrorShape {
  code: string;
  message: string;
  details?: unknown;
  retryable?: boolean;
}

type Frame = RequestFrame | ResponseFrame | EventFrame;

// Chat event payload
interface ChatEventPayload {
  runId: string;
  sessionKey: string;
  seq: number;
  state: "delta" | "final" | "aborted" | "error";
  message?: {
    content?: ContentBlock[];
  };
  errorMessage?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  stopReason?: string;
}

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: unknown;
  id?: string;
}

// Agent method params
interface AgentParams {
  message: string;
  sessionKey?: string;
  idempotencyKey: string;
  deliver?: boolean;
  timeout?: number;
}

// Agent response
interface AgentResponse {
  runId: string;
  status: "accepted" | "ok" | "error";
  acceptedAt?: number;
  summary?: string;
  result?: {
    payloads?: Array<{ text?: string }>;
  };
}

// Connection params
interface ConnectParams {
  minProtocol: number;
  maxProtocol: number;
  client: {
    id: string;
    displayName: string;
    version: string;
    platform: string;
    mode: string;
  };
  caps: string[];
  auth?: {
    token?: string;
  };
  role: string;
  scopes: string[];
}

interface HelloOk {
  protocol: number;
  features?: string[];
  auth?: {
    role: string;
    scopes: string[];
    deviceToken?: string;
  };
  policy?: {
    tickIntervalMs: number;
  };
}

// Exported types for test harness
export interface GatewayMessage {
  type: "req" | "res" | "event";
  id?: string;
  method?: string;
  event?: string;
  payload?: unknown;
  ok?: boolean;
  error?: ErrorShape;
  seq?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  input: unknown;
}

export interface AgentTurnResult {
  runId: string;
  text: string;
  toolCalls: ToolCall[];
  state: "final" | "error" | "aborted";
  error?: string;
}

export class GatewayTestClient {
  private ws: WebSocket | null = null;
  private messageQueue: GatewayMessage[] = [];
  private pendingRequests: Map<
    string,
    { resolve: (res: ResponseFrame) => void; reject: (err: Error) => void }
  > = new Map();
  private eventListeners: Map<string, (payload: unknown) => void> = new Map();
  private chatEvents: Map<string, ChatEventPayload[]> = new Map();
  private requestCounter = 0;
  private connected = false;

  constructor(
    private gatewayUrl: string,
    private authToken?: string,
  ) {}

  private generateId(): string {
    return `test-${Date.now()}-${++this.requestCounter}`;
  }

  async connect(): Promise<HelloOk> {
    this.ws = new WebSocket(this.gatewayUrl);

    await new Promise<void>((resolve, reject) => {
      this.ws!.on("open", resolve);
      this.ws!.on("error", reject);
    });

    this.ws.on("message", (data) => {
      const frame = JSON.parse(data.toString()) as Frame;
      this.handleFrame(frame);
    });

    this.ws.on("close", () => {
      this.connected = false;
    });

    // Send connect handshake
    const connectParams: ConnectParams = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: "security-test-harness",
        displayName: "Security Test Client",
        version: "1.0.0",
        platform: process.platform,
        mode: "test",
      },
      caps: [],
      role: "operator",
      scopes: ["operator.admin"],
    };

    if (this.authToken) {
      connectParams.auth = { token: this.authToken };
    }

    const response = await this.request<HelloOk>("connect", connectParams);
    this.connected = true;
    return response;
  }

  private handleFrame(frame: Frame): void {
    this.messageQueue.push(frame as GatewayMessage);

    if (frame.type === "res") {
      const pending = this.pendingRequests.get(frame.id);
      if (pending) {
        if (frame.ok) {
          pending.resolve(frame);
        } else {
          pending.reject(
            new Error(frame.error?.message ?? "Unknown error"),
          );
        }
        this.pendingRequests.delete(frame.id);
      }
    } else if (frame.type === "event") {
      // Handle chat events specially
      if (frame.event === "chat" && frame.payload) {
        const chatPayload = frame.payload as ChatEventPayload;
        const existing = this.chatEvents.get(chatPayload.runId) ?? [];
        existing.push(chatPayload);
        this.chatEvents.set(chatPayload.runId, existing);
      }

      // Notify listeners
      const listener = this.eventListeners.get(frame.event);
      if (listener) {
        listener(frame.payload);
      }
    }
  }

  private async request<T>(
    method: string,
    params?: unknown,
    timeoutMs = 30000,
  ): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket not connected");
    }

    const id = this.generateId();
    const frame: RequestFrame = { type: "req", id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout for ${method}`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (res) => {
          clearTimeout(timeout);
          resolve(res.payload as T);
        },
        reject: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });

      this.ws!.send(JSON.stringify(frame));
    });
  }

  async disconnect(): Promise<void> {
    this.ws?.close();
    this.ws = null;
    this.connected = false;
    this.pendingRequests.clear();
    this.chatEvents.clear();
  }

  /**
   * Send a message to the agent and wait for the complete response.
   * Returns the full turn result including text and tool calls.
   */
  async sendMessage(
    content: string,
    sessionKey = "agent:dev:main",
    timeoutMs = 60000,
  ): Promise<AgentTurnResult> {
    const idempotencyKey = this.generateId();

    // Clear previous events for this run
    this.chatEvents.delete(idempotencyKey);

    // Send agent request
    const agentParams: AgentParams = {
      message: content,
      sessionKey,
      idempotencyKey,
      deliver: false,
      timeout: timeoutMs,
    };

    const response = await this.request<AgentResponse>(
      "agent",
      agentParams,
      timeoutMs,
    );

    // Wait for final chat event
    const result = await this.waitForChatComplete(
      response.runId,
      timeoutMs,
    );

    return result;
  }

  /**
   * Wait for chat events to reach final/error/aborted state.
   */
  private async waitForChatComplete(
    runId: string,
    timeoutMs: number,
  ): Promise<AgentTurnResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeoutMs) {
      const events = this.chatEvents.get(runId) ?? [];
      const finalEvent = events.find(
        (e) =>
          e.state === "final" || e.state === "error" || e.state === "aborted",
      );

      if (finalEvent) {
        // Collect all text and tool calls from events
        let text = "";
        const toolCalls: ToolCall[] = [];

        for (const event of events) {
          if (event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === "text" && block.text) {
                text += block.text;
              } else if (block.type === "tool_use" && block.name && block.id) {
                toolCalls.push({
                  id: block.id,
                  name: block.name,
                  input: block.input,
                });
              }
            }
          }
        }

        return {
          runId,
          text,
          toolCalls,
          state: finalEvent.state as "final" | "error" | "aborted",
          error: finalEvent.errorMessage,
        };
      }

      // Wait a bit and check again
      await new Promise((r) => setTimeout(r, 100));
    }

    throw new Error(`Timeout waiting for chat completion: ${runId}`);
  }

  /**
   * Register a listener for specific event types.
   */
  onEvent(eventName: string, callback: (payload: unknown) => void): void {
    this.eventListeners.set(eventName, callback);
  }

  /**
   * Wait for a specific response type (legacy API for compatibility).
   */
  async waitForResponse(
    type: string,
    timeoutMs = 30000,
  ): Promise<GatewayMessage> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error(`Timeout waiting for ${type}`)),
        timeoutMs,
      );

      this.eventListeners.set(type, (payload) => {
        clearTimeout(timeout);
        this.eventListeners.delete(type);
        resolve({ type: "event", event: type, payload });
      });
    });
  }

  getMessages(): GatewayMessage[] {
    return this.messageQueue;
  }

  clearMessages(): void {
    this.messageQueue = [];
    this.chatEvents.clear();
  }

  isConnected(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  /**
   * Get chat events for a specific run.
   */
  getChatEvents(runId: string): ChatEventPayload[] {
    return this.chatEvents.get(runId) ?? [];
  }
}
