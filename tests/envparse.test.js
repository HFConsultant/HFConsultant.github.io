/**
 * Tests for .env parsing with values.
 *
 * This is the module that feeds `secure-term run`, so a parsing mistake here
 * means a variable silently reaching a dev server with the wrong value —
 * a trailing comment inside a password, a quoted string losing its spaces.
 * Those are hard to notice and easy to blame on the framework.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEnv } from '../js/envparse.js';

test('parses plain assignments', () => {
	assert.deepEqual(parseEnv('A=1\nB=two\n'), { A: '1', B: 'two' });
});

test('ignores comments and blank lines', () => {
	assert.deepEqual(parseEnv('# a comment\n\nA=1\n   \n# another\n'), { A: '1' });
});

test('accepts and discards the export prefix', () => {
	assert.deepEqual(parseEnv('export A=1\n  export  B=2\n'), { A: '1', B: '2' });
});

test('strips a trailing comment from an unquoted value', () => {
	assert.deepEqual(parseEnv('PORT=3000 # dev only\n'), { PORT: '3000' });
});

test('keeps a hash that is part of an unquoted value', () => {
	// A '#' only starts a comment when whitespace precedes it, so passwords
	// containing a hash survive.
	assert.deepEqual(parseEnv('PASSWORD=abc#123\n'), { PASSWORD: 'abc#123' });
});

test('takes quoted values verbatim, including spaces and hashes', () => {
	assert.deepEqual(
		parseEnv('A="value with spaces # not a comment"\nB=\'single #2\'\n'),
		{ A: 'value with spaces # not a comment', B: 'single #2' }
	);
});

test('preserves an equals sign inside a value', () => {
	// Base64 and connection strings are full of these.
	assert.deepEqual(
		parseEnv('TOKEN=abc==\nURL=postgres://u:p@h/db?ssl=true\n'),
		{ TOKEN: 'abc==', URL: 'postgres://u:p@h/db?ssl=true' }
	);
});

test('handles an empty value', () => {
	assert.deepEqual(parseEnv('EMPTY=\nQUOTED_EMPTY=""\n'), { EMPTY: '', QUOTED_EMPTY: '' });
});

test('lets a later assignment win, as a shell would', () => {
	assert.deepEqual(parseEnv('A=first\nA=second\n'), { A: 'second' });
});

test('tolerates CRLF line endings', () => {
	// A .env edited on Windows, or pasted through a chat client.
	assert.deepEqual(parseEnv('A=1\r\nB=2\r\n'), { A: '1', B: '2' });
});

test('skips lines that are not assignments rather than throwing', () => {
	assert.deepEqual(parseEnv('this is prose\nA=1\n[section]\n'), { A: '1' });
});

test('ignores names that are not valid identifiers', () => {
	assert.deepEqual(parseEnv('9INVALID=x\nfoo-bar=y\nVALID=z\n'), { VALID: 'z' });
});

test('does not expand variable references', () => {
	// Expansion is a place dotenv dialects disagree; a secrets tool should
	// hand over exactly what was written rather than guess.
	assert.deepEqual(parseEnv('A=$HOME/x\n'), { A: '$HOME/x' });
});

test('returns an empty object for empty or missing input', () => {
	assert.deepEqual(parseEnv(''), {});
	assert.deepEqual(parseEnv(null), {});
	assert.deepEqual(parseEnv(undefined), {});
});
