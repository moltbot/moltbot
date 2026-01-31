import type { OpenClawConfig } from "../config/config.js";
import { createSubsystemLogger } from "../logging/subsystem.js";

const log = createSubsystemLogger("phoenix");

let phoenixInitialized = false;

export type PhoenixConfig = {
  enabled?: boolean;
  url?: string;
  projectName?: string;
};

export function isPhoenixEnabled(config?: OpenClawConfig): boolean {
  return config?.diagnostics?.phoenix?.enabled === true;
}

export async function initializePhoenix(config?: OpenClawConfig): Promise<void> {
  if (phoenixInitialized) {
    log.warn("Phoenix already initialized, skipping");
    return;
  }

  const phoenixConfig = config?.diagnostics?.phoenix;
  if (!phoenixConfig?.enabled) {
    log.info("Phoenix instrumentation disabled");
    return;
  }

  try {
    // Dynamic imports to avoid loading Phoenix dependencies when disabled
    const { register, registerInstrumentations } = await import("@arizeai/phoenix-otel");
    const { AnthropicInstrumentation } =
      await import("@arizeai/openinference-instrumentation-anthropic");
    const { OpenAIInstrumentation } = await import("@arizeai/openinference-instrumentation-openai");

    const projectName = phoenixConfig.projectName ?? "openclaw";
    const url = phoenixConfig.url ?? "http://localhost:6006";

    log.info(`Initializing Phoenix instrumentation: ${url} (project: ${projectName})`);

    // Register the tracer provider without instrumentations (ESM compatibility)
    const tracerProvider = register({
      projectName,
      url,
      global: true,
      batch: false, // Use simple processor for immediate export during testing
    });

    // Manually register instrumentations for ESM compatibility
    const anthropicInst = new AnthropicInstrumentation();
    const openaiInst = new OpenAIInstrumentation();

    log.info(
      `Registering instrumentations: Anthropic (${anthropicInst.instrumentationName}), OpenAI (${openaiInst.instrumentationName})`,
    );

    registerInstrumentations({
      tracerProvider,
      instrumentations: [anthropicInst, openaiInst],
    });

    // CRITICAL: Manually instrument OpenAI SDK for ESM
    // Auto-instrumentation hooks only work with CommonJS require(), not ESM import
    // We must manually patch the SDK after it's loaded
    log.info("Manually instrumenting OpenAI SDK for ESM...");
    try {
      const openaiModule = await import("openai");
      const OpenAI = openaiModule.default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      openaiInst.manuallyInstrument(OpenAI as any);
      log.info("OpenAI SDK manually instrumented successfully");
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      log.warn(`Failed to manually instrument OpenAI SDK: ${errMsg}`);
    }

    phoenixInitialized = true;
    log.info("Phoenix instrumentation initialized successfully");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Failed to initialize Phoenix instrumentation: ${message}`);
    throw error;
  }
}

export function resetPhoenixForTest(): void {
  phoenixInitialized = false;
}
