/**
 * Markdown utilities for Twitch chat
 *
 * Twitch chat doesn't support markdown formatting, so we strip it before sending.
 * Based on Clawdbot's markdownToText in src/agents/tools/web-fetch-utils.ts.
 */

/**
 * Strip markdown formatting from text for Twitch compatibility.
 *
 * Removes images, links, bold, italic, strikethrough, code blocks, inline code,
 * headers, and list formatting. Replaces newlines with spaces since Twitch
 * is a single-line chat medium.
 *
 * @param markdown - The markdown text to strip
 * @returns Plain text with markdown removed
 */
export function stripMarkdownForTwitch(markdown: string): string {
	let text = markdown;

	// Images
	text = text.replace(/!\[[^\]]*]\([^)]+\)/g, "");

	// Links
	text = text.replace(/\[([^\]]+)]\([^)]+\)/g, "$1");

	// Bold (**text**)
	text = text.replace(/\*\*([^*]+)\*\*/g, "$1");

	// Bold (__text__)
	text = text.replace(/__([^_]+)__/g, "$1");

	// Italic (*text*)
	text = text.replace(/\*([^*]+)\*/g, "$1");

	// Italic (_text_)
	text = text.replace(/_([^_]+)_/g, "$1");

	// Strikethrough (~~text~~)
	text = text.replace(/~~([^~]+)~~/g, "$1");

	// Code blocks
	text = text.replace(/```[\s\S]*?```/g, (block) =>
		block.replace(/```[^\n]*\n?/g, "").replace(/```/g, ""),
	);

	// Inline code
	text = text.replace(/`([^`]+)`/g, "$1");

	// Headers
	text = text.replace(/^#{1,6}\s+/gm, "");

	// Lists
	text = text.replace(/^\s*[-*+]\s+/gm, "");
	text = text.replace(/^\s*\d+\.\s+/gm, "");

	// Normalize whitespace
	text = text
		.replace(/\r/g, "") // Remove carriage returns
		.replace(/[ \t]+\n/g, "\n") // Remove trailing spaces before newlines
		.replace(/\n/g, " ") // Replace newlines with spaces (for Twitch)
		.replace(/[ \t]{2,}/g, " ") // Reduce multiple spaces to single
		.trim();

	return text;
}

/**
 * Simple word-boundary chunker for Twitch (500 char limit).
 * Strips markdown before chunking to avoid breaking markdown patterns.
 *
 * @param text - The text to chunk
 * @param limit - Maximum characters per chunk (Twitch limit is 500)
 * @returns Array of text chunks
 */
export function chunkTextForTwitch(text: string, limit: number): string[] {
	// First, strip markdown
	const cleaned = stripMarkdownForTwitch(text);
	if (!cleaned) return [];
	if (limit <= 0) return [cleaned];
	if (cleaned.length <= limit) return [cleaned];

	const chunks: string[] = [];
	let remaining = cleaned;

	while (remaining.length > limit) {
		// Find the last space before the limit
		const window = remaining.slice(0, limit);
		const lastSpaceIndex = window.lastIndexOf(" ");

		if (lastSpaceIndex === -1) {
			// No space found, hard split at limit
			chunks.push(window);
			remaining = remaining.slice(limit);
		} else {
			// Split at the last space
			chunks.push(window.slice(0, lastSpaceIndex));
			remaining = remaining.slice(lastSpaceIndex + 1);
		}
	}

	if (remaining) {
		chunks.push(remaining);
	}

	return chunks;
}
