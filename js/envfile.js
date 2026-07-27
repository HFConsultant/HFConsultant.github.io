/**
 * Secure Terminal — .env awareness.
 *
 * Used by both front-ends to describe what someone is about to encrypt, or
 * what they just decrypted, without ever displaying the thing itself.
 *
 * The one rule in this module: **it never returns a value.** Only names,
 * counts and sizes. Everything here is safe to print to a terminal, a shared
 * screen or a CI log. If a function in this file ever needs to return a
 * secret, it belongs somewhere else.
 */

/**
 * A line assigning an environment variable.
 *
 * Accepts the `export ` prefix, since people paste straight out of a shell,
 * and tolerates whitespace around the name. Deliberately strict about the
 * name itself: POSIX-ish identifiers only, so prose containing an equals sign
 * is not mistaken for configuration.
 */
const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/;

const COMMENT_OR_BLANK = /^\s*(?:#.*)?$/;

/**
 * Describe a block of text.
 *
 * @param {string} text
 * @returns {{
 *   kind: 'env' | 'text',
 *   keys: string[],
 *   duplicates: string[],
 *   lines: number,
 *   bytes: number
 * }}
 */
export function summarize(text) {
	const source = String(text ?? '');
	const lines = source.split(/\r?\n/);

	const keys = [];
	const seen = new Set();
	const duplicates = new Set();
	let meaningful = 0;

	for (const line of lines) {
		if (COMMENT_OR_BLANK.test(line)) continue;
		meaningful += 1;

		const match = ASSIGNMENT.exec(line);
		if (!match) continue;

		const name = match[1];
		if (seen.has(name)) {
			duplicates.add(name);
		} else {
			seen.add(name);
			keys.push(name);
		}
	}

	// Treat it as configuration only if most of the substantive lines are
	// assignments. A prose document that happens to contain one FOO=bar should
	// not be announced as a .env file.
	const kind = meaningful > 0 && keys.length / meaningful >= 0.6 ? 'env' : 'text';

	return {
		kind,
		keys: kind === 'env' ? keys : [],
		duplicates: [...duplicates],
		lines: lines.length,
		bytes: new TextEncoder().encode(source).length
	};
}

/**
 * Render a summary as a line or two of human-readable text.
 *
 * Names only. This output is designed to be safe on a shared screen, which is
 * the whole reason it exists: it lets someone confirm they grabbed the right
 * file without the values ever being displayed.
 *
 * @param {ReturnType<typeof summarize>} summary
 * @param {{max?: number}} [options] how many names to list before eliding
 * @returns {string[]}
 */
export function describe(summary, { max = 8 } = {}) {
	const size = formatBytes(summary.bytes);

	if (summary.kind !== 'env') {
		return [`${summary.lines} line${summary.lines === 1 ? '' : 's'}, ${size}`];
	}

	const shown = summary.keys.slice(0, max);
	const rest = summary.keys.length - shown.length;
	const names = shown.join(', ') + (rest > 0 ? `, and ${rest} more` : '');

	const out = [
		`${summary.keys.length} variable${summary.keys.length === 1 ? '' : 's'}, ${size}`,
		names
	];

	if (summary.duplicates.length) {
		out.push(`Warning: defined more than once: ${summary.duplicates.join(', ')}`);
	}

	return out;
}

export function formatBytes(bytes) {
	if (bytes < 1024) return `${bytes} bytes`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Suggest a filename for the encrypted form of `name`.
 *
 * '.enc' is appended rather than substituted so the original extension
 * survives a round trip: .env -> .env.enc -> .env.
 */
export function encryptedName(name) {
	return `${name || 'secret.txt'}.enc`;
}

/** Inverse of encryptedName. Falls back to a generic name. */
export function decryptedName(name) {
	if (name && name.endsWith('.enc')) return name.slice(0, -4);
	return name ? `${name}.decrypted` : 'secret.txt';
}
