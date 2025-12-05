import { defaultRuntime, type RuntimeEnv } from "../runtime.js";
import type { WarelayConfig } from "../config/config.js";
import type { Provider } from "../utils.js";
import type { WebMonitorTuning } from "../web/auto-reply.js";
import type { CliDeps } from "./deps.js";

/**
 * Run multiple provider monitors concurrently.
 * Handles graceful shutdown and per-provider error recovery.
 */
export async function runMultiProviderRelay(
	providers: Provider[],
	config: WarelayConfig,
	deps: CliDeps,
	opts: {
		verbose?: boolean;
		webTuning?: WebMonitorTuning;
		twilioInterval?: number;
		twilioLookback?: number;
		runtime?: RuntimeEnv;
	},
): Promise<void> {
	const runtime = opts.runtime ?? defaultRuntime;
	const abortController = new AbortController();
	const { signal } = abortController;

	// Setup Ctrl+C handler
	const sigintHandler = () => {
		runtime.log("\n⏹  Stopping all providers...");
		abortController.abort();
	};
	process.on("SIGINT", sigintHandler);

	runtime.log(
		`📡 Starting ${providers.length} provider(s): ${providers.join(", ")}`,
	);

	let startupComplete = false;

	// Spawn monitors concurrently
	const monitorPromises = providers.map(async (provider) => {
		try {
			if (provider === "telegram") {
				const { monitorTelegramProvider } = await import(
					"../telegram/monitor.js"
				);
				await monitorTelegramProvider(
					Boolean(opts.verbose),
					runtime,
					signal,
					true, // suppressStartMessage
				);
			} else if (provider === "web") {
				const { monitorWebProvider } = await import("../web/auto-reply.js");
				await monitorWebProvider(
					Boolean(opts.verbose),
					undefined,
					true,
					undefined,
					runtime,
					signal,
					opts.webTuning,
				);
			} else if (provider === "twilio") {
				const { monitorTwilio } = await import("../twilio/monitor.js");
				const intervalSeconds = opts.twilioInterval ?? 10;
				const lookbackMinutes = opts.twilioLookback ?? 5;

				await monitorTwilio(intervalSeconds, lookbackMinutes);
			}
		} catch (err) {
			if (signal.aborted) return; // Graceful shutdown
			runtime.error(`❌ ${provider} error: ${String(err)}`);
			// Continue - don't crash other providers
		}
	});

	// Wait a brief moment for all providers to initialize, then show summary
	setTimeout(() => {
		if (!startupComplete && !signal.aborted) {
			startupComplete = true;
			runtime.log(
				`✅ All ${providers.length} provider(s) active. Listening for messages... (Ctrl+C to stop)`,
			);
		}
	}, 1500);

	// Wait for all monitors (or abort)
	await Promise.allSettled(monitorPromises);

	// Remove SIGINT handler
	process.off("SIGINT", sigintHandler);

	runtime.log("✅ All providers stopped");
}
