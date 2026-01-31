// Phoenix instrumentation preload for ESM
// Usage: node --import ./phoenix-preload.mjs dist/entry.js
//
// IMPORTANT: For ESM, InstrumentationNodeModuleDefinition only works with CommonJS require(),
// not ESM import. We must manually instrument the OpenAI SDK BEFORE any application code loads it.

import { diag, DiagConsoleLogger, DiagLogLevel } from "@opentelemetry/api";
import { register, registerInstrumentations } from "@arizeai/phoenix-otel";
import { OpenAIInstrumentation } from "@arizeai/openinference-instrumentation-openai";

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

	// Create OpenAI instrumentation instance
	const openaiInst = new OpenAIInstrumentation();
	registerInstrumentations({
		tracerProvider,
		instrumentations: [openaiInst],
	});

	// Manually instrument OpenAI SDK for ESM (required because auto-instrumentation hooks don't fire for ESM imports)
	// Use top-level await to ensure this completes BEFORE any application code loads OpenAI
	// OpenAI is a dependency of @mariozechner/pi-ai, import from pnpm store
	const { default: OpenAI } = await import("./node_modules/.pnpm/openai@6.10.0_ws@8.19.0_zod@4.3.6/node_modules/openai/index.mjs");
	openaiInst.manuallyInstrument(OpenAI);
}
