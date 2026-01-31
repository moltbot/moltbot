// Phoenix instrumentation preload for ESM
// Usage: node --import ./phoenix-preload.mjs dist/entry.js
//
// IMPORTANT: For ESM, InstrumentationNodeModuleDefinition only works with CommonJS require(),
// not ESM import. We must manually instrument the OpenAI SDK BEFORE any application code loads it.

import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { register, registerInstrumentations } from "@arizeai/phoenix-otel";
import { OpenAIInstrumentation } from "@arizeai/openinference-instrumentation-openai";
import { AnthropicInstrumentation } from "@arizeai/openinference-instrumentation-anthropic";

const phoenixEnabled = process.env.OPENCLAW_PHOENIX_ENABLED === "true";

if (phoenixEnabled) {
	const phoenixUrl = process.env.OPENCLAW_PHOENIX_URL || "http://localhost:6006";
	const phoenixProject = process.env.OPENCLAW_PHOENIX_PROJECT || "openclaw";

	// Suppress OpenTelemetry diagnostic logging (only show errors)
	diag.setLogger(new DiagConsoleLogger(), DiagLogLevel.ERROR);

	// Register tracer provider (use batch: false for immediate export to debug)
	const tracerProvider = register({
		projectName: phoenixProject,
		url: phoenixUrl,
		global: true,
		batch: false, // Simple processor for immediate export
	});

	// Create instrumentation instances
	const openaiInst = new OpenAIInstrumentation();
	const anthropicInst = new AnthropicInstrumentation();
	registerInstrumentations({
		tracerProvider,
		instrumentations: [openaiInst, anthropicInst],
	});

	// Manually instrument SDKs for ESM (required because auto-instrumentation hooks don't fire for ESM imports)
	// Use top-level await to ensure this completes BEFORE any application code loads the SDKs
	const { default: OpenAI } = await import("openai");
	openaiInst.manuallyInstrument(OpenAI);

	const { default: Anthropic } = await import("@anthropic-ai/sdk");
	anthropicInst.manuallyInstrument(Anthropic);
}
