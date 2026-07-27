/**
 * Secure Terminal — .env parsing, values included.
 *
 * This module is the deliberate counterpart to envfile.js, whose contract is
 * that it NEVER returns a value. This one exists precisely to return values —
 * it feeds `secure-term run`, which injects decrypted variables into a child
 * process's environment. Keeping the two in separate modules keeps the
 * boundary loud: anything that touches envfile.js output is safe to print;
 * anything that touches this module's output is a secret.
 *
 * The dialect is the common core of dotenv, line-based only:
 *
 *   NAME=value            unquoted: trimmed, and ` # comment` tails stripped
 *   NAME="value"          quoted: taken verbatim, no escape expansion
 *   NAME='value'          same, single quotes
 *   export NAME=value     the export prefix is accepted and ignored
 *   # comment             ignored, as are blank lines
 *
 * Multi-line quoted values and $VAR expansion are deliberately unsupported:
 * both are places where dotenv dialects disagree, and a secrets tool should
 * fail simple rather than guess. Later assignments win, matching what a shell
 * would do.
 */

const ASSIGNMENT = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/;

/**
 * Parse env-file text into { NAME: value }.
 *
 * @param {string} text
 * @returns {Record<string, string>}
 */
export function parseEnv(text) {
	const vars = {};

	for (const rawLine of String(text ?? '').split(/\r?\n/)) {
		const line = rawLine.trim();
		if (!line || line.startsWith('#')) continue;

		const match = ASSIGNMENT.exec(line);
		if (!match) continue;

		let value = match[2];

		// A quoted value is whatever sits between the quotes, verbatim —
		// including '#', '=', and leading/trailing spaces. Anything after the
		// closing quote (typically a comment) is ignored.
		const quoted = /^"([^"]*)"|^'([^']*)'/.exec(value);
		if (quoted) {
			value = quoted[1] ?? quoted[2];
		} else {
			// Unquoted: dotenv treats a hash preceded by whitespace as a
			// comment. `PASSWORD=abc#123` keeps its hash; `PORT=3000 # dev`
			// does not keep the comment.
			const hash = value.search(/\s#/);
			if (hash !== -1) value = value.slice(0, hash);
			value = value.trim();
		}

		vars[match[1]] = value;
	}

	return vars;
}
