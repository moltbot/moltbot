/**
 * Secret detection and handling for inbound messages.
 * Integrates entropy detection with interactive user prompts and storage.
 */

import type { MoltbotConfig } from '../config/config.js';
import type { FinalizedMsgContext } from '../auto-reply/templating.js';
import type { ReplyDispatcher } from '../auto-reply/reply/reply-dispatcher.js';
import {
	detectHighEntropyStrings,
	redactSecrets,
	type DetectedSecret,
} from './entropy.js';
import {
	logHighEntropyDetected,
	logSecretRedacted,
	logSecretAllowedByUser,
	logInteractivePromptTimeout,
	logInteractivePromptCancelled,
} from './events.js';

export type SecretProcessingResult = {
	/** Whether secrets were detected. */
	detected: boolean;
	/** Whether the message was modified (redacted or replaced). */
	modified: boolean;
	/** Updated context with safe body text. */
	ctx: FinalizedMsgContext;
	/** Whether the message should be blocked (user cancelled). */
	blocked: boolean;
};

/**
 * Get default action from config with fallback.
 */
function getDefaultAction(
	cfg: MoltbotConfig,
): 'redact' | 'block' | 'allow' {
	return cfg.security?.secrets?.handling?.defaultAction || 'redact';
}

/**
 * Get timeout for interactive prompts from config.
 */
function getConfirmationTimeoutMs(cfg: MoltbotConfig): number {
	return cfg.security?.secrets?.handling?.confirmationTimeoutMs || 15000;
}

/**
 * Check if secret detection is enabled in config.
 */
function isSecretDetectionEnabled(cfg: MoltbotConfig): boolean {
	return cfg.security?.secrets?.detection?.enabled !== false; // Default: true
}

/**
 * Check if interactive mode is enabled in config.
 */
function isInteractiveModeEnabled(cfg: MoltbotConfig): boolean {
	return cfg.security?.secrets?.handling?.interactive !== false; // Default: true
}

/**
 * Check if the channel supports interactive prompts.
 * For Phase 1, we support interactive mode for most channels.
 */
function supportsInteractiveMode(ctx: FinalizedMsgContext): boolean {
	const channel = ctx.Provider || ctx.Surface;
	// Most channels support sending replies for interactive prompts
	// Exceptions might be added later for channels with limitations
	return !!channel;
}

/**
 * Send an interactive prompt to the user and wait for response.
 * Returns the selected action or null if timeout/cancelled.
 */
async function promptUserForAction(
	secrets: DetectedSecret[],
	ctx: FinalizedMsgContext,
	dispatcher: ReplyDispatcher,
	timeoutMs: number,
): Promise<'redact' | 'cancel' | 'allow' | null> {
	const {
		generatePromptKey,
		registerPendingPrompt,
	} = await import('./interactive-prompts.js');

	// Build secret summary
	const secretSummary = secrets
		.slice(0, 3) // Show up to 3 secrets
		.map((s) => {
			const preview = s.value.slice(0, 12) + '...' + s.value.slice(-6);
			const label = s.pattern || s.type;
			return `• ${preview} (${label})`;
		})
		.join('\n');

	const moreSummary =
		secrets.length > 3 ? `\n• ...and ${secrets.length - 3} more` : '';

	const promptMessage = `🔒 **Security Alert**

Your message contains what appears to be ${secrets.length} secret${secrets.length > 1 ? 's' : ''} or API key${secrets.length > 1 ? 's' : ''}:

${secretSummary}${moreSummary}

**Options:**
1️⃣ Redact - Replace with [REDACTED] before processing
2️⃣ Cancel - Don't process this message
3️⃣ Continue anyway ⚠️  - Send to AI as-is (not recommended)

Reply with **1**, **2**, or **3** (timeout in ${Math.round(timeoutMs / 1000)}s)`;

	// Generate unique key for this user
	const channel = ctx.Provider || ctx.Surface || 'unknown';
	const senderId = ctx.SenderId || 'unknown';
	const promptKey = generatePromptKey(channel, senderId);

	// Register the pending prompt (returns a promise that will be resolved when user responds)
	const responsePromise = registerPendingPrompt(promptKey, secrets, timeoutMs);

	// Send the prompt message
	await dispatcher.sendText(promptMessage);

	// Wait for user response (or timeout)
	const action = await responsePromise;

	return action;
}

/**
 * Apply the selected action to the context.
 */
function applyAction(
	action: 'redact' | 'allow',
	secrets: DetectedSecret[],
	ctx: FinalizedMsgContext,
	cfg: MoltbotConfig,
): { ctx: FinalizedMsgContext; modified: boolean } {
	if (action === 'allow') {
		// No modification
		logSecretAllowedByUser(secrets.length, {
			channel: ctx.Provider || ctx.Surface,
			senderId: ctx.SenderId,
		});
		return { ctx, modified: false };
	}

	if (action === 'redact') {
		// Redact secrets from all body fields
		const redactedBody = redactSecrets(ctx.Body || '', secrets);
		const redactedBodyForAgent = redactSecrets(ctx.BodyForAgent || '', secrets);
		const redactedCommandBody = redactSecrets(ctx.CommandBody || '', secrets);
		const redactedBodyForCommands = redactSecrets(ctx.BodyForCommands || '', secrets);

		logSecretRedacted(secrets.length, 'auto', {
			channel: ctx.Provider || ctx.Surface,
			senderId: ctx.SenderId,
		});

		return {
			ctx: {
				...ctx,
				Body: redactedBody,
				BodyForAgent: redactedBodyForAgent,
				CommandBody: redactedCommandBody,
				BodyForCommands: redactedBodyForCommands,
			},
			modified: true,
		};
	}

	// Shouldn't reach here
	return { ctx, modified: false };
}

/**
 * Process a message for secret detection and handling.
 * This is the main entry point for secret security processing.
 *
 * @param ctx - Finalized message context
 * @param cfg - Moltbot configuration
 * @param dispatcher - Reply dispatcher for interactive prompts
 * @returns SecretProcessingResult with updated context and metadata
 */
export async function processSecretsInMessage(
	ctx: FinalizedMsgContext,
	cfg: MoltbotConfig,
	dispatcher: ReplyDispatcher,
): Promise<SecretProcessingResult> {
	// Check if detection is enabled
	if (!isSecretDetectionEnabled(cfg)) {
		return { detected: false, modified: false, ctx, blocked: false };
	}

	// Detect secrets in the main body (BodyForAgent is most comprehensive)
	const body = ctx.BodyForAgent || ctx.Body || '';
	const detectionConfig = cfg.security?.secrets?.detection;
	const result = detectHighEntropyStrings(body, {
		minEntropyThreshold: detectionConfig?.minEntropyThreshold,
		minLength: detectionConfig?.minLength,
		customPatterns: detectionConfig?.customPatterns,
	});

	if (!result.hasSecrets) {
		return { detected: false, modified: false, ctx, blocked: false };
	}

	// Secrets detected - log event
	logHighEntropyDetected(
		result.secrets.length,
		result.secrets.map((s) => s.type),
		{
			channel: ctx.Provider || ctx.Surface,
			senderId: ctx.SenderId,
		},
	);

	// Determine how to handle the secrets
	let action: 'store' | 'redact' | 'allow' | null = null;

	const interactive = isInteractiveModeEnabled(cfg);
	const supportsInteractive = supportsInteractiveMode(ctx);

	if (interactive && supportsInteractive) {
		// Try interactive prompt
		const timeoutMs = getConfirmationTimeoutMs(cfg);
		const userChoice = await promptUserForAction(
			result.secrets,
			ctx,
			dispatcher,
			timeoutMs,
		);

		if (userChoice === 'cancel') {
			logInteractivePromptCancelled({
				channel: ctx.Provider || ctx.Surface,
				senderId: ctx.SenderId,
			});
			return { detected: true, modified: false, ctx, blocked: true };
		}

		if (userChoice && userChoice !== 'cancel') {
			action = userChoice;
		} else {
			// Timeout or not implemented - fall back to default
			const defaultAction = getDefaultAction(cfg);
			logInteractivePromptTimeout(defaultAction, {
				channel: ctx.Provider || ctx.Surface,
				senderId: ctx.SenderId,
			});
			action = defaultAction === 'block' ? 'redact' : defaultAction; // Treat block as redact in non-interactive
		}
	} else {
		// Non-interactive mode or channel doesn't support it
		const defaultAction = getDefaultAction(cfg);
		action = defaultAction === 'block' ? 'redact' : defaultAction; // Treat block as redact
	}

	// Apply the action
	const { ctx: updatedCtx, modified } = applyAction(action, result.secrets, ctx, cfg);

	return {
		detected: true,
		modified,
		ctx: updatedCtx,
		blocked: false,
	};
}
