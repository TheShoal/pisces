/**
 * Sanitize token boundary markers from streaming deltas.
 *
 * Models can emit special token boundary markers like `<|`, `|>`, and `<|...|>`
 * in their output. These are not valid HTML/XML and should be stripped from
 * streaming deltas before they're appended to partial JSON or displayed.
 *
 * This function is conservative - it only matches `<|` specifically since
 * that pattern cannot be valid HTML/XML.
 */

/** Pattern matching `<|` at start of string (token boundary prefix) */
const TOKEN_START_RE = /^<\|/;

/** Pattern matching `|>` at end of string (token boundary suffix) */
const TOKEN_END_RE = /\|>$/;

/** Pattern matching `<|...|>` spanning the entire string */
const TOKEN_FULL_RE = /^<\|.*\|>$/;

/**
 * Strip token boundary markers from a streaming delta.
 *
 * @param delta - The raw streaming delta string
 * @returns The sanitized delta with boundary markers removed
 */
export function sanitizeStreamingDelta(delta: string): string {
	if (!delta) return delta;

	// Check for full-span pattern first (e.g., "<|...|>" or "<|...")
	// In these cases, strip the markers entirely
	if (TOKEN_FULL_RE.test(delta)) {
		// Remove both boundary markers
		return delta.replace(/^<\|/, "").replace(/\|>$/, "");
	}

	// Strip start marker
	let result = delta.replace(TOKEN_START_RE, "");

	// Strip end marker
	result = result.replace(TOKEN_END_RE, "");

	return result;
}
