/**
 * Realtime Media Stream Handler
 *
 * Handles bidirectional audio streaming for OpenAI Realtime voice-to-voice mode.
 * Audio flows directly between Twilio Media Streams and OpenAI Realtime API
 * without intermediate STT → LLM → TTS processing.
 */

import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import { WebSocket, WebSocketServer } from "ws";

import {
  OpenAIRealtimeVoiceProvider,
  OpenAIRealtimeVoiceSession,
  type RealtimeVoiceConfig,
  type RealtimeVoiceEvents,
} from "./providers/openai-realtime-voice.js";

/**
 * Configuration for the realtime media stream handler.
 */
export interface RealtimeMediaStreamConfig {
  /** OpenAI Realtime Voice provider */
  voiceProvider: OpenAIRealtimeVoiceProvider;
  /** Default voice configuration overrides */
  voiceConfig?: Partial<RealtimeVoiceConfig>;
  /** Callback when user transcript is received */
  onTranscript?: (callId: string, transcript: string) => void;
  /** Callback when AI response is generated */
  onResponse?: (callId: string, text: string) => void;
  /** Callback when stream connects */
  onConnect?: (callId: string, streamSid: string) => void;
  /** Callback when stream disconnects */
  onDisconnect?: (callId: string) => void;
  /** Callback when speech starts (for UI updates) */
  onSpeechStart?: (callId: string) => void;
  /** Callback when speech stops */
  onSpeechStop?: (callId: string) => void;
}

/**
 * Active realtime stream session.
 */
interface RealtimeStreamSession {
  callId: string;
  streamSid: string;
  ws: WebSocket;
  voiceSession: OpenAIRealtimeVoiceSession;
}

/**
 * Manages WebSocket connections for Twilio media streams with OpenAI Realtime.
 */
export class RealtimeMediaStreamHandler {
  private wss: WebSocketServer | null = null;
  private sessions = new Map<string, RealtimeStreamSession>();
  private config: RealtimeMediaStreamConfig;

  constructor(config: RealtimeMediaStreamConfig) {
    this.config = config;
  }

  /**
   * Handle WebSocket upgrade for media stream connections.
   */
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    if (!this.wss) {
      this.wss = new WebSocketServer({ noServer: true });
      this.wss.on("connection", (ws, req) => this.handleConnection(ws, req));
    }

    this.wss.handleUpgrade(request, socket, head, (ws) => {
      this.wss?.emit("connection", ws, request);
    });
  }

  /**
   * Handle new WebSocket connection from Twilio.
   */
  private async handleConnection(ws: WebSocket, _request: IncomingMessage): Promise<void> {
    let session: RealtimeStreamSession | null = null;

    ws.on("message", async (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString()) as TwilioMediaMessage;

        switch (message.event) {
          case "connected":
            console.log("[RealtimeStream] Twilio connected");
            break;

          case "start":
            session = await this.handleStart(ws, message);
            break;

          case "media":
            if (session && message.media?.payload) {
              // Forward audio directly to OpenAI Realtime
              const audioBuffer = Buffer.from(message.media.payload, "base64");
              session.voiceSession.sendAudio(audioBuffer);
            }
            break;

          case "stop":
            if (session) {
              this.handleStop(session);
              session = null;
            }
            break;
        }
      } catch (error) {
        console.error("[RealtimeStream] Error processing message:", error);
      }
    });

    ws.on("close", () => {
      if (session) {
        this.handleStop(session);
      }
    });

    ws.on("error", (error) => {
      console.error("[RealtimeStream] WebSocket error:", error);
    });
  }

  /**
   * Handle stream start event - initialize OpenAI Realtime session.
   */
  private async handleStart(
    ws: WebSocket,
    message: TwilioMediaMessage,
  ): Promise<RealtimeStreamSession> {
    const streamSid = message.streamSid || "";
    const callSid = message.start?.callSid || "";

    console.log(`[RealtimeStream] Stream started: ${streamSid} (call: ${callSid})`);

    // Create events for the voice session
    const events: RealtimeVoiceEvents = {
      onAudio: (audio: Buffer) => {
        // Send audio back to Twilio
        this.sendAudioToTwilio(streamSid, audio);
      },
      onTranscript: (transcript: string, isFinal: boolean) => {
        if (isFinal) {
          console.log(`[RealtimeStream] User: ${transcript}`);
          this.config.onTranscript?.(callSid, transcript);
        }
      },
      onResponseText: (text: string, isFinal: boolean) => {
        if (isFinal) {
          console.log(`[RealtimeStream] AI: ${text}`);
          this.config.onResponse?.(callSid, text);
        }
      },
      onSpeechStart: () => {
        console.log(`[RealtimeStream] Speech started for ${callSid}`);
        this.config.onSpeechStart?.(callSid);
        // Clear any pending audio when user interrupts
        this.clearAudio(streamSid);
      },
      onSpeechStop: () => {
        this.config.onSpeechStop?.(callSid);
      },
      onError: (error: Error) => {
        console.error(`[RealtimeStream] Voice error for ${callSid}:`, error);
      },
      onReady: () => {
        console.log(`[RealtimeStream] Voice session ready for ${callSid}`);
      },
    };

    // Create and connect the voice session
    const voiceSession = this.config.voiceProvider.createSession(events, this.config.voiceConfig);

    const session: RealtimeStreamSession = {
      callId: callSid,
      streamSid,
      ws,
      voiceSession,
    };

    this.sessions.set(streamSid, session);

    // Connect to OpenAI Realtime (non-blocking)
    voiceSession.connect().catch((err) => {
      console.error(`[RealtimeStream] Failed to connect voice session:`, err);
    });

    // Notify connection
    this.config.onConnect?.(callSid, streamSid);

    return session;
  }

  /**
   * Handle stream stop event.
   */
  private handleStop(session: RealtimeStreamSession): void {
    console.log(`[RealtimeStream] Stream stopped: ${session.streamSid}`);

    session.voiceSession.close();
    this.sessions.delete(session.streamSid);
    this.config.onDisconnect?.(session.callId);
  }

  /**
   * Send audio to Twilio media stream.
   */
  private sendAudioToTwilio(streamSid: string, audio: Buffer): void {
    const session = this.sessions.get(streamSid);
    if (!session || session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    session.ws.send(
      JSON.stringify({
        event: "media",
        streamSid,
        media: {
          payload: audio.toString("base64"),
        },
      }),
    );
  }

  /**
   * Clear audio buffer (interrupt playback).
   */
  clearAudio(streamSid: string): void {
    const session = this.sessions.get(streamSid);
    if (!session || session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    session.ws.send(
      JSON.stringify({
        event: "clear",
        streamSid,
      }),
    );
  }

  /**
   * Send a mark event to track audio position.
   */
  sendMark(streamSid: string, name: string): void {
    const session = this.sessions.get(streamSid);
    if (!session || session.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    session.ws.send(
      JSON.stringify({
        event: "mark",
        streamSid,
        mark: { name },
      }),
    );
  }

  /**
   * Get session by call ID.
   */
  getSessionByCallId(callId: string): RealtimeStreamSession | undefined {
    return [...this.sessions.values()].find((s) => s.callId === callId);
  }

  /**
   * Inject a text message into the conversation.
   */
  injectMessage(callId: string, text: string, role: "user" | "assistant" = "user"): void {
    const session = this.getSessionByCallId(callId);
    if (session) {
      session.voiceSession.sendTextMessage(text, role);
    }
  }

  /**
   * Close all sessions.
   */
  closeAll(): void {
    for (const session of this.sessions.values()) {
      session.voiceSession.close();
      session.ws.close();
    }
    this.sessions.clear();
  }
}

/**
 * Twilio Media Stream message format.
 */
interface TwilioMediaMessage {
  event: "connected" | "start" | "media" | "stop" | "mark" | "clear";
  sequenceNumber?: string;
  streamSid?: string;
  start?: {
    streamSid: string;
    accountSid: string;
    callSid: string;
    tracks: string[];
    mediaFormat: {
      encoding: string;
      sampleRate: number;
      channels: number;
    };
  };
  media?: {
    track?: string;
    chunk?: string;
    timestamp?: string;
    payload?: string;
  };
  mark?: {
    name: string;
  };
}
