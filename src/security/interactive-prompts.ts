/**
 * State management for pending interactive security prompts.
 * Tracks users who are in the middle of responding to secret detection alerts.
 */

import type { DetectedSecret } from './entropy.js';

export type PendingPromptAction = 'redact' | 'cancel' | 'allow';

export type PendingSecurityPrompt = {
	/** Unique key for this prompt (channel:senderId or sessionKey). */
	key: string;
	/** Detected secrets that triggered the prompt. */
	secrets: DetectedSecret[];
	/** When the prompt was created. */
	createdAt: number;
	/** Timeout in milliseconds. */
	timeoutMs: number;
	/** Promise resolver for the user's choice. */
	resolve: (action: PendingPromptAction | null) => void;
	/** Timeout handle for cleanup. */
	timeoutHandle: ReturnType<typeof setTimeout>;
};

// Global in-memory store for pending prompts
const pendingPrompts = new Map<string, PendingSecurityPrompt>();

/**
 * Generate a unique key for a pending prompt.
 */
export function generatePromptKey(channel: string, senderId: string): string {
	return `${channel}:${senderId}`;
}

/**
 * Register a pending security prompt and return a promise that resolves when the user responds.
 *
 * @param key - Unique key (channel:senderId)
 * @param secrets - Detected secrets
 * @param timeoutMs - How long to wait for user response
 * @returns Promise that resolves with user's choice or null on timeout
 */
export function registerPendingPrompt(
	key: string,
	secrets: DetectedSecret[],
	timeoutMs: number,
): Promise<PendingPromptAction | null> {
	// Cancel any existing prompt for this user
	const existing = pendingPrompts.get(key);
	if (existing) {
		clearTimeout(existing.timeoutHandle);
		existing.resolve(null); // Timeout the old one
	}

	return new Promise<PendingPromptAction | null>((resolve) => {
		const timeoutHandle = setTimeout(() => {
			// Timeout reached - clean up and resolve with null
			pendingPrompts.delete(key);
			resolve(null);
		}, timeoutMs);

		const prompt: PendingSecurityPrompt = {
			key,
			secrets,
			createdAt: Date.now(),
			timeoutMs,
			resolve,
			timeoutHandle,
		};

		pendingPrompts.set(key, prompt);
	});
}

/**
 * Check if there's a pending prompt for a given key.
 */
export function hasPendingPrompt(key: string): boolean {
	return pendingPrompts.has(key);
}

/**
 * Get a pending prompt by key.
 */
export function getPendingPrompt(key: string): PendingSecurityPrompt | undefined {
	return pendingPrompts.get(key);
}

/**
 * Resolve a pending prompt with the user's choice.
 * This should be called when the user responds to the security alert.
 *
 * @param key - Unique key for the prompt
 * @param action - User's chosen action
 * @returns True if a pending prompt was found and resolved
 */
export function resolvePendingPrompt(
	key: string,
	action: PendingPromptAction | null,
): boolean {
	const prompt = pendingPrompts.get(key);
	if (!prompt) {
		return false;
	}

	// Clean up
	clearTimeout(prompt.timeoutHandle);
	pendingPrompts.delete(key);

	// Resolve the promise
	prompt.resolve(action);
	return true;
}

/**
 * Cancel a pending prompt (e.g., if the user sends a different message).
 *
 * @param key - Unique key for the prompt
 * @returns True if a pending prompt was found and cancelled
 */
export function cancelPendingPrompt(key: string): boolean {
	return resolvePendingPrompt(key, null);
}

/**
 * Parse a user's response to a security prompt.
 * Expects "1", "2", or "3" (or variations like "1.", "option 1", etc.)
 *
 * @param text - User's message text
 * @returns Parsed action or null if invalid
 */
export function parsePromptResponse(text: string): PendingPromptAction | null {
	const normalized = text.trim().toLowerCase();

	// Direct number matches
	if (normalized === '1' || normalized === '1.' || normalized.includes('option 1')) {
		return 'redact';
	}
	if (normalized === '2' || normalized === '2.' || normalized.includes('option 2')) {
		return 'cancel';
	}
	if (normalized === '3' || normalized === '3.' || normalized.includes('option 3')) {
		return 'allow';
	}

	// Keyword matches
	if (normalized.includes('redact') || normalized.includes('hide')) {
		return 'redact';
	}
	if (normalized.includes('cancel') || normalized.includes('abort')) {
		return 'cancel';
	}
	if (normalized.includes('allow') || normalized.includes('continue')) {
		return 'allow';
	}

	return null;
}

/**
 * Clear all pending prompts (useful for testing or shutdown).
 */
export function clearAllPendingPrompts(): void {
	for (const prompt of pendingPrompts.values()) {
		clearTimeout(prompt.timeoutHandle);
		prompt.resolve(null);
	}
	pendingPrompts.clear();
}

/**
 * Get count of pending prompts (useful for debugging/monitoring).
 */
export function getPendingPromptCount(): number {
	return pendingPrompts.size;
}
