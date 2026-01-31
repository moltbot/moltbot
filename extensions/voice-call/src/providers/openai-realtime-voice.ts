/**
 * OpenAI Realtime Voice-to-Voice Provider
 *
 * Uses OpenAI's Realtime API for full voice-to-voice conversations with:
 * - Sub-second latency (no separate STT → LLM → TTS chain)
 * - GPT-4o generates responses AND audio in one stream
 * - Built-in VAD, interruption handling, and turn detection
 * - Direct mu-law audio support for Twilio Media Streams
 *
 * Trade-off: Uses GPT-4o instead of Claude for responses.
 *
 * @see https://platform.openai.com/docs/guides/realtime
 */

import WebSocket from "ws";

/**
 * Configuration for OpenAI Realtime Voice.
 */
export interface RealtimeVoiceConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Model to use (default: gpt-4o-realtime-preview-2024-12-17) */
  model?: string;
  /** Voice for TTS output (default: nova) */
  voice?: "alloy" | "ash" | "ballad" | "coral" | "echo" | "sage" | "shimmer" | "verse" | "nova";
  /** System prompt for the AI */
  systemPrompt?: string;
  /** Temperature for response generation (0-2, default: 0.8) */
  temperature?: number;
  /** Max response tokens (default: 4096) */
  maxResponseTokens?: number | "inf";
  /** VAD threshold 0-1 (default: 0.5) */
  vadThreshold?: number;
  /** Silence duration in ms before turn ends (default: 500) */
  silenceDurationMs?: number;
  /** Prefix padding in ms (default: 300) */
  prefixPaddingMs?: number;
}

/**
 * Events emitted by the realtime voice session.
 */
export interface RealtimeVoiceEvents {
  /** Called when audio is ready to send to caller */
  onAudio?: (audio: Buffer) => void;
  /** Called when user's speech is transcribed */
  onTranscript?: (transcript: string, isFinal: boolean) => void;
  /** Called when AI response text is generated */
  onResponseText?: (text: string, isFinal: boolean) => void;
  /** Called when user starts speaking (for barge-in) */
  onSpeechStart?: () => void;
  /** Called when user stops speaking */
  onSpeechStop?: () => void;
  /** Called on errors */
  onError?: (error: Error) => void;
  /** Called when session is ready */
  onReady?: () => void;
}

/**
 * Session for full voice-to-voice conversations via OpenAI Realtime API.
 */
export class OpenAIRealtimeVoiceSession {
  private ws: WebSocket | null = null;
  private connected = false;
  private closed = false;
  private sessionId: string | null = null;
  private config: Required<RealtimeVoiceConfig>;
  private events: RealtimeVoiceEvents;

  // Track response state for interruption handling
  private currentResponseId: string | null = null;
  private isGenerating = false;

  constructor(config: RealtimeVoiceConfig, events: RealtimeVoiceEvents = {}) {
    this.config = {
      apiKey: config.apiKey,
      model: config.model || "gpt-4o-realtime-preview-2024-12-17",
      voice: config.voice || "nova",
      systemPrompt: config.systemPrompt || "You are a helpful assistant.",
      temperature: config.temperature ?? 0.8,
      maxResponseTokens: config.maxResponseTokens ?? 4096,
      vadThreshold: config.vadThreshold ?? 0.5,
      silenceDurationMs: config.silenceDurationMs ?? 500,
      prefixPaddingMs: config.prefixPaddingMs ?? 300,
    };
    this.events = events;
  }

  /**
   * Connect to OpenAI Realtime API.
   */
  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    return new Promise((resolve, reject) => {
      const url = `wss://api.openai.com/v1/realtime?model=${this.config.model}`;

      this.ws = new WebSocket(url, {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "OpenAI-Beta": "realtime=v1",
        },
      });

      const timeout = setTimeout(() => {
        if (!this.connected) {
          this.ws?.close();
          reject(new Error("Connection timeout"));
        }
      }, 15000);

      this.ws.on("open", () => {
        console.log("[RealtimeVoice] WebSocket connected");
        clearTimeout(timeout);
      });

      this.ws.on("message", (data: Buffer) => {
        try {
          const event = JSON.parse(data.toString());
          this.handleEvent(event, resolve, reject);
        } catch (e) {
          console.error("[RealtimeVoice] Failed to parse event:", e);
        }
      });

      this.ws.on("error", (error) => {
        console.error("[RealtimeVoice] WebSocket error:", error);
        clearTimeout(timeout);
        if (!this.connected) {
          reject(error);
        }
        this.events.onError?.(error instanceof Error ? error : new Error(String(error)));
      });

      this.ws.on("close", (code, reason) => {
        console.log(`[RealtimeVoice] WebSocket closed: ${code} - ${reason?.toString() || "none"}`);
        clearTimeout(timeout);
        const wasConnected = this.connected;
        this.connected = false;
        this.sessionId = null;
        // Reject if we never completed connection
        if (!wasConnected) {
          reject(
            new Error(
              `WebSocket closed before session ready: ${code} - ${reason?.toString() || "none"}`,
            ),
          );
        }
      });
    });
  }

  /**
   * Handle incoming events from OpenAI.
   */
  private handleEvent(
    event: Record<string, unknown>,
    onConnected?: () => void,
    onError?: (error: Error) => void,
  ): void {
    const type = event.type as string;

    switch (type) {
      case "session.created":
        this.sessionId = event.session_id as string;
        console.log(`[RealtimeVoice] Session created: ${this.sessionId}`);
        // Configure the session for voice-to-voice
        this.configureSession();
        break;

      case "session.updated":
        console.log("[RealtimeVoice] Session configured");
        this.connected = true;
        this.events.onReady?.();
        onConnected?.();
        break;

      case "input_audio_buffer.speech_started":
        console.log("[RealtimeVoice] User started speaking");
        this.events.onSpeechStart?.();
        // Interrupt current response if generating
        if (this.isGenerating && this.currentResponseId) {
          this.cancelResponse();
        }
        break;

      case "input_audio_buffer.speech_stopped":
        console.log("[RealtimeVoice] User stopped speaking");
        this.events.onSpeechStop?.();
        break;

      case "conversation.item.input_audio_transcription.completed":
        const transcript = event.transcript as string;
        console.log(`[RealtimeVoice] User said: ${transcript}`);
        this.events.onTranscript?.(transcript, true);
        break;

      case "response.created":
        this.currentResponseId = (event.response as Record<string, unknown>)?.id as string;
        this.isGenerating = true;
        console.log(`[RealtimeVoice] Response started: ${this.currentResponseId}`);
        break;

      case "response.audio.delta":
        // Audio chunk from the AI - decode and forward to caller
        const audioBase64 = event.delta as string;
        if (audioBase64) {
          const audioBuffer = Buffer.from(audioBase64, "base64");
          this.events.onAudio?.(audioBuffer);
        }
        break;

      case "response.audio_transcript.delta":
        // Partial AI response text
        const partialText = event.delta as string;
        if (partialText) {
          this.events.onResponseText?.(partialText, false);
        }
        break;

      case "response.audio_transcript.done":
        // Final AI response text
        const finalText = event.transcript as string;
        if (finalText) {
          console.log(`[RealtimeVoice] AI said: ${finalText}`);
          this.events.onResponseText?.(finalText, true);
        }
        break;

      case "response.done":
        this.isGenerating = false;
        this.currentResponseId = null;
        console.log("[RealtimeVoice] Response complete");
        break;

      case "error":
        const errorMsg = (event.error as Record<string, unknown>)?.message as string;
        console.error(`[RealtimeVoice] Error: ${errorMsg}`);
        const error = new Error(errorMsg || "Unknown error");
        this.events.onError?.(error);
        onError?.(error);
        break;

      case "rate_limits.updated":
        // Ignore rate limit updates
        break;

      default:
        // Log unhandled events for debugging
        if (!type.startsWith("input_audio_buffer.")) {
          console.log(`[RealtimeVoice] Event: ${type}`);
        }
    }
  }

  /**
   * Configure the session for voice-to-voice conversation.
   */
  private configureSession(): void {
    this.sendEvent({
      type: "session.update",
      session: {
        // Input configuration
        input_audio_format: "g711_ulaw", // Twilio media stream format
        input_audio_transcription: {
          model: "whisper-1",
        },

        // Output configuration
        output_audio_format: "g711_ulaw", // Send back in same format
        voice: this.config.voice,

        // Modalities - both text and audio
        modalities: ["text", "audio"],

        // Instructions (system prompt)
        instructions: this.config.systemPrompt,

        // Turn detection with server VAD
        turn_detection: {
          type: "server_vad",
          threshold: this.config.vadThreshold,
          prefix_padding_ms: this.config.prefixPaddingMs,
          silence_duration_ms: this.config.silenceDurationMs,
          create_response: true, // Auto-generate response when user stops
        },

        // Response settings
        temperature: this.config.temperature,
        max_response_output_tokens: this.config.maxResponseTokens,
      },
    });
  }

  /**
   * Send audio from caller to OpenAI.
   * @param audio - mu-law encoded audio (8kHz mono)
   */
  sendAudio(audio: Buffer): void {
    if (!this.connected) {
      return;
    }

    this.sendEvent({
      type: "input_audio_buffer.append",
      audio: audio.toString("base64"),
    });
  }

  /**
   * Commit the audio buffer (signal end of audio input).
   */
  commitAudio(): void {
    if (!this.connected) {
      return;
    }

    this.sendEvent({
      type: "input_audio_buffer.commit",
    });
  }

  /**
   * Cancel current response (for interruption/barge-in).
   */
  cancelResponse(): void {
    if (!this.connected || !this.currentResponseId) {
      return;
    }

    console.log(`[RealtimeVoice] Cancelling response: ${this.currentResponseId}`);
    this.sendEvent({
      type: "response.cancel",
    });
    this.isGenerating = false;
    this.currentResponseId = null;
  }

  /**
   * Send a text message to inject into the conversation.
   */
  sendTextMessage(text: string, role: "user" | "assistant" = "user"): void {
    if (!this.connected) {
      return;
    }

    this.sendEvent({
      type: "conversation.item.create",
      item: {
        type: "message",
        role,
        content: [
          {
            type: role === "user" ? "input_text" : "text",
            text,
          },
        ],
      },
    });

    // Trigger response if user message
    if (role === "user") {
      this.sendEvent({ type: "response.create" });
    }
  }

  /**
   * Send an event to OpenAI.
   */
  private sendEvent(event: Record<string, unknown>): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
    }
  }

  /**
   * Check if session is connected and ready.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Check if AI is currently generating a response.
   */
  isResponding(): boolean {
    return this.isGenerating;
  }

  /**
   * Close the session.
   */
  close(): void {
    this.closed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.connected = false;
    this.sessionId = null;
  }
}

/**
 * Factory for creating OpenAI Realtime Voice sessions.
 */
export class OpenAIRealtimeVoiceProvider {
  readonly name = "openai-realtime-voice";
  private defaultConfig: RealtimeVoiceConfig;

  constructor(config: RealtimeVoiceConfig) {
    if (!config.apiKey) {
      throw new Error("OpenAI API key required for Realtime Voice");
    }
    this.defaultConfig = config;
  }

  /**
   * Create a new realtime voice session.
   */
  createSession(
    events: RealtimeVoiceEvents,
    overrides?: Partial<RealtimeVoiceConfig>,
  ): OpenAIRealtimeVoiceSession {
    return new OpenAIRealtimeVoiceSession({ ...this.defaultConfig, ...overrides }, events);
  }
}
