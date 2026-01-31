import type { CoreConfig } from "./core-bridge.js";
import type { VoiceCallConfig } from "./config.js";
import { resolveVoiceCallConfig, validateProviderConfig } from "./config.js";
import { CallManager } from "./manager.js";
import type { VoiceCallProvider } from "./providers/base.js";
import { MockProvider } from "./providers/mock.js";
import { PlivoProvider } from "./providers/plivo.js";
import { TelnyxProvider } from "./providers/telnyx.js";
import { TwilioProvider } from "./providers/twilio.js";
import { OpenAIRealtimeVoiceProvider } from "./providers/openai-realtime-voice.js";
import type { TelephonyTtsRuntime } from "./telephony-tts.js";
import { createTelephonyTtsProvider } from "./telephony-tts.js";
import { startTunnel, type TunnelResult } from "./tunnel.js";
import {
  cleanupTailscaleExposure,
  setupTailscaleExposure,
  VoiceCallWebhookServer,
} from "./webhook.js";

export type VoiceCallRuntime = {
  config: VoiceCallConfig;
  provider: VoiceCallProvider;
  manager: CallManager;
  webhookServer: VoiceCallWebhookServer;
  webhookUrl: string;
  publicUrl: string | null;
  /** OpenAI Realtime Voice provider (only set when realtime mode is available) */
  realtimeVoiceProvider: OpenAIRealtimeVoiceProvider | null;
  stop: () => Promise<void>;
};

type Logger = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug: (message: string) => void;
};

function isLoopbackBind(bind: string | undefined): boolean {
  if (!bind) {
    return false;
  }
  return bind === "127.0.0.1" || bind === "::1" || bind === "localhost";
}

function resolveProvider(config: VoiceCallConfig): VoiceCallProvider {
  const allowNgrokFreeTierLoopbackBypass =
    config.tunnel?.provider === "ngrok" &&
    isLoopbackBind(config.serve?.bind) &&
    (config.tunnel?.allowNgrokFreeTierLoopbackBypass || config.tunnel?.allowNgrokFreeTier || false);

  // Enable streaming if realtime mode is configured (realtime requires media streams)
  const needsStreaming =
    config.streaming?.enabled ||
    config.outbound?.defaultMode === "realtime" ||
    config.realtime?.openaiApiKey;

  switch (config.provider) {
    case "telnyx":
      return new TelnyxProvider({
        apiKey: config.telnyx?.apiKey,
        connectionId: config.telnyx?.connectionId,
        publicKey: config.telnyx?.publicKey,
      });
    case "twilio":
      return new TwilioProvider(
        {
          accountSid: config.twilio?.accountSid,
          authToken: config.twilio?.authToken,
        },
        {
          allowNgrokFreeTierLoopbackBypass,
          publicUrl: config.publicUrl,
          skipVerification: config.skipSignatureVerification,
          streamPath: needsStreaming ? config.streaming?.streamPath || "/voice/stream" : undefined,
        },
      );
    case "plivo":
      return new PlivoProvider(
        {
          authId: config.plivo?.authId,
          authToken: config.plivo?.authToken,
        },
        {
          publicUrl: config.publicUrl,
          skipVerification: config.skipSignatureVerification,
          ringTimeoutSec: Math.max(1, Math.floor(config.ringTimeoutMs / 1000)),
        },
      );
    case "mock":
      return new MockProvider();
    default:
      throw new Error(`Unsupported voice-call provider: ${String(config.provider)}`);
  }
}

export async function createVoiceCallRuntime(params: {
  config: VoiceCallConfig;
  coreConfig: CoreConfig;
  ttsRuntime?: TelephonyTtsRuntime;
  logger?: Logger;
}): Promise<VoiceCallRuntime> {
  const { config: rawConfig, coreConfig, ttsRuntime, logger } = params;
  const log = logger ?? {
    info: console.log,
    warn: console.warn,
    error: console.error,
    debug: console.debug,
  };

  const config = resolveVoiceCallConfig(rawConfig);

  if (!config.enabled) {
    throw new Error("Voice call disabled. Enable the plugin entry in config.");
  }

  const validation = validateProviderConfig(config);
  if (!validation.valid) {
    throw new Error(`Invalid voice-call config: ${validation.errors.join("; ")}`);
  }

  const provider = resolveProvider(config);
  const manager = new CallManager(config);
  const webhookServer = new VoiceCallWebhookServer(config, manager, provider, coreConfig);

  const localUrl = await webhookServer.start();

  // Determine public URL - priority: config.publicUrl > tunnel > legacy tailscale
  let publicUrl: string | null = config.publicUrl ?? null;
  let tunnelResult: TunnelResult | null = null;

  if (!publicUrl && config.tunnel?.provider && config.tunnel.provider !== "none") {
    try {
      tunnelResult = await startTunnel({
        provider: config.tunnel.provider,
        port: config.serve.port,
        path: config.serve.path,
        ngrokAuthToken: config.tunnel.ngrokAuthToken,
        ngrokDomain: config.tunnel.ngrokDomain,
      });
      publicUrl = tunnelResult?.publicUrl ?? null;
    } catch (err) {
      log.error(
        `[voice-call] Tunnel setup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (!publicUrl && config.tailscale?.mode !== "off") {
    publicUrl = await setupTailscaleExposure(config);
  }

  const webhookUrl = publicUrl ?? localUrl;

  if (publicUrl && provider.name === "twilio") {
    (provider as TwilioProvider).setPublicUrl(publicUrl);
  }

  // Initialize OpenAI Realtime Voice provider if realtime mode is configured
  let realtimeVoiceProvider: OpenAIRealtimeVoiceProvider | null = null;
  const realtimeApiKey =
    config.realtime?.openaiApiKey || config.streaming?.openaiApiKey || process.env.OPENAI_API_KEY;

  if (realtimeApiKey) {
    try {
      realtimeVoiceProvider = new OpenAIRealtimeVoiceProvider({
        apiKey: realtimeApiKey,
        model: config.realtime?.model,
        voice: config.realtime?.voice,
        systemPrompt: config.realtime?.systemPrompt || config.responseSystemPrompt,
        temperature: config.realtime?.temperature,
        maxResponseTokens: config.realtime?.maxResponseTokens,
        vadThreshold: config.realtime?.vadThreshold,
        silenceDurationMs: config.realtime?.silenceDurationMs,
        prefixPaddingMs: config.realtime?.prefixPaddingMs,
      });
      log.info("[voice-call] OpenAI Realtime Voice provider configured");
    } catch (err) {
      log.warn(
        `[voice-call] Failed to initialize Realtime Voice: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  if (provider.name === "twilio" && config.streaming?.enabled) {
    const twilioProvider = provider as TwilioProvider;
    if (ttsRuntime?.textToSpeechTelephony) {
      try {
        const ttsProvider = createTelephonyTtsProvider({
          coreConfig,
          ttsOverride: config.tts,
          runtime: ttsRuntime,
        });
        twilioProvider.setTTSProvider(ttsProvider);
        log.info("[voice-call] Telephony TTS provider configured");
      } catch (err) {
        log.warn(
          `[voice-call] Failed to initialize telephony TTS: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    } else {
      log.warn("[voice-call] Telephony TTS unavailable; streaming TTS disabled");
    }

    const mediaHandler = webhookServer.getMediaStreamHandler();
    if (mediaHandler) {
      twilioProvider.setMediaStreamHandler(mediaHandler);
      log.info("[voice-call] Media stream handler wired to provider");
    }

    // Pass realtime voice provider to webhook server for realtime mode calls
    if (realtimeVoiceProvider) {
      webhookServer.setRealtimeVoiceProvider(realtimeVoiceProvider);
      log.info("[voice-call] Realtime Voice provider wired to webhook server");
    }
  }

  manager.initialize(provider, webhookUrl);

  const stop = async () => {
    if (tunnelResult) {
      await tunnelResult.stop();
    }
    await cleanupTailscaleExposure(config);
    await webhookServer.stop();
  };

  log.info("[voice-call] Runtime initialized");
  log.info(`[voice-call] Webhook URL: ${webhookUrl}`);
  if (publicUrl) {
    log.info(`[voice-call] Public URL: ${publicUrl}`);
  }

  return {
    config,
    provider,
    manager,
    webhookServer,
    webhookUrl,
    publicUrl,
    realtimeVoiceProvider,
    stop,
  };
}
