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

/**
 * Can these bytes survive a trip through a JavaScript string?
 *
 * Everything here encrypts text: bytes are decoded as UTF-8, encrypted as a
 * string, and re-encoded on the way out. Anything that is not valid UTF-8 —
 * an image, a PDF, a zip — does not survive that. Invalid sequences are
 * replaced with U+FFFD during decoding, and the replacement is not
 * reversible, so the file comes back a different size and permanently ruined.
 *
 * Without this check that happens *silently*: both encryption and decryption
 * report success and hand back a destroyed file. Anyone who deleted the
 * original first has lost it.
 *
 * The test is exact rather than a heuristic: decode, re-encode, and compare.
 * If the bytes are unchanged the round trip is lossless by construction.
 *
 * @param {Uint8Array|ArrayBuffer} bytes
 * @returns {{ok: true, text: string} | {ok: false}}
 */
export function decodeUtf8Strict(bytes) {
	const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);

	let text;
	try {
		text = new TextDecoder('utf-8', { fatal: true }).decode(view);
	} catch {
		return { ok: false };
	}

	// fatal:true rejects malformed sequences, but re-encoding also catches the
	// remaining edge cases (lone surrogates, and any decoder disagreement).
	const reencoded = new TextEncoder().encode(text);
	if (reencoded.length !== view.length) return { ok: false };
	for (let i = 0; i < view.length; i++) {
		if (reencoded[i] !== view[i]) return { ok: false };
	}

	return { ok: true, text };
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
