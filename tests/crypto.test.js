/**
 * Tests for the cryptographic core.
 *
 * These run under Node's built-in test runner against Node's Web Crypto
 * implementation — the same standard API the browser provides — so js/crypto.js
 * is exercised unmodified, with no browser or bundler in the loop.
 *
 *     npm test
 *
 * A low iteration count is used throughout except where the default is under
 * test; PBKDF2 is deliberately slow and the tests do not need that slowness.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
	ITERATIONS,
	SALT_BYTES,
	IV_BYTES,
	VERSION,
	VERSION_GZIP,
	PayloadError,
	DecryptionError,
	encryptText,
	decryptText,
	parsePayload,
	estimateStrength
} from '../js/crypto.js';

const FAST = 1000; // keep the suite quick; see note above

test('round-trips text through encrypt and decrypt', async () => {
	const secret = 'Meeting at 3pm to discuss the merger';
	const payload = await encryptText(secret, 'correct horse battery staple', '', FAST);
	assert.equal(await decryptText(payload, 'correct horse battery staple'), secret);
});

test('round-trips text when a pepper is used', async () => {
	const payload = await encryptText('diary entry', 'passphrase', 'childhood-street', FAST);
	assert.equal(await decryptText(payload, 'passphrase', 'childhood-street'), 'diary entry');
});

test('round-trips unicode, emoji and newlines without corruption', async () => {
	const secret = 'héllo\nwörld 🔐 中文 — em-dash\ttab';
	const payload = await encryptText(secret, 'pw', '', FAST);
	assert.equal(await decryptText(payload, 'pw'), secret);
});

test('produces a distinct payload every time for identical input', async () => {
	// A fresh random salt and IV per call: identical plaintext under an
	// identical passphrase must never produce an identical ciphertext.
	const a = await encryptText('same', 'pw', '', FAST);
	const b = await encryptText('same', 'pw', '', FAST);
	assert.notEqual(a, b);
	assert.notEqual(parsePayload(a).salt.join(), parsePayload(b).salt.join());
	assert.notEqual(parsePayload(a).iv.join(), parsePayload(b).iv.join());
});

test('emits a well-formed, self-describing payload', async () => {
	const payload = await encryptText('x', 'pw', '', FAST);
	const parts = payload.split('.');

	assert.equal(parts.length, 5);
	assert.equal(parts[0], VERSION);
	assert.equal(parts[1], String(FAST));

	// base64url only: no +, / or = to break URLs, QR codes or double-click select
	assert.match(payload, /^[A-Za-z0-9._-]+$/);

	const parsed = parsePayload(payload);
	assert.equal(parsed.salt.length, SALT_BYTES);
	assert.equal(parsed.iv.length, IV_BYTES);
	assert.equal(parsed.iterations, FAST);
});

test('carries the iteration count so old payloads stay readable', async () => {
	// Decryption must use the count recorded in the payload, not today's default.
	const payload = await encryptText('legacy-safe', 'pw', '', 2000);
	assert.notEqual(2000, ITERATIONS);
	assert.equal(await decryptText(payload, 'pw'), 'legacy-safe');
});

test('rejects a wrong passphrase', async () => {
	const payload = await encryptText('secret', 'right', '', FAST);
	await assert.rejects(() => decryptText(payload, 'wrong'), DecryptionError);
});

test('rejects a missing pepper, and a pepper that was never set', async () => {
	const withPepper = await encryptText('secret', 'pw', 'pepper', FAST);
	await assert.rejects(() => decryptText(withPepper, 'pw'), DecryptionError);

	const withoutPepper = await encryptText('secret', 'pw', '', FAST);
	await assert.rejects(() => decryptText(withoutPepper, 'pw', 'pepper'), DecryptionError);
});

test('separates passphrase from pepper unambiguously', async () => {
	// Naive concatenation would make ("ab", "c") and ("a", "bc") the same key.
	const payload = await encryptText('secret', 'ab', 'c', FAST);
	await assert.rejects(() => decryptText(payload, 'a', 'bc'), DecryptionError);
});

test('rejects a tampered ciphertext', async () => {
	// AES-GCM is authenticated: flipping a byte must fail, not return garbage.
	const payload = await encryptText('secret message', 'pw', '', FAST);
	const parts = payload.split('.');
	const ct = parts[4];
	const flipped = (ct[0] === 'A' ? 'B' : 'A') + ct.slice(1);
	parts[4] = flipped;

	await assert.rejects(() => decryptText(parts.join('.'), 'pw'), DecryptionError);
});

test('rejects structurally invalid payloads with PayloadError', async () => {
	const bad = [
		'',
		'not a payload at all',
		'STv1.1000.short.short',              // too few fields
		'STv2.1000.AAAA.AAAA.AAAA',           // unknown version
		'STv1.notanumber.AAAA.AAAA.AAAA',     // non-numeric iterations
		'STv1.99999999999.AAAA.AAAA.AAAA'     // implausible iterations
	];

	for (const payload of bad) {
		await assert.rejects(
			() => decryptText(payload, 'pw'),
			PayloadError,
			`expected PayloadError for: ${JSON.stringify(payload)}`
		);
	}
});

test('rejects a payload whose salt or IV is the wrong length', async () => {
	const payload = await encryptText('x', 'pw', '', FAST);
	const parts = payload.split('.');

	assert.throws(() => parsePayload([parts[0], parts[1], 'AAAA', parts[3], parts[4]].join('.')), PayloadError);
	assert.throws(() => parsePayload([parts[0], parts[1], parts[2], 'AAAA', parts[4]].join('.')), PayloadError);
});

test('refuses to encrypt with empty input or an empty passphrase', async () => {
	await assert.rejects(() => encryptText('', 'pw', '', FAST), PayloadError);
	await assert.rejects(() => encryptText('text', '', '', FAST), PayloadError);
});

test('still decrypts payloads written by the pre-v1 release', async () => {
	// Fixture generated by the original implementation:
	//   btoa(JSON.stringify({salt, iv, data})) at 100,000 iterations,
	//   plaintext "hello legacy", passphrase "legacy-pass", no pepper.
	const legacy = await buildLegacyFixture('legacy-pass');
	assert.equal(await decryptText(legacy.payload, 'legacy-pass'), 'hello legacy');
	await assert.rejects(() => decryptText(legacy.payload, 'wrong-pass'), DecryptionError);
});

test('still decrypts pre-v1 payloads that used a pepper', async () => {
	// Regression test. The original app combined the secrets by bare
	// concatenation (passphrase + pepper); v1 uses a separator. The legacy
	// decrypt path must reproduce the original combination, or every old
	// payload made with a pepper fails while telling its owner the passphrase
	// is wrong -- exactly the payloads guarding wallet recovery phrases.
	const legacy = await buildLegacyFixture('legacy-pass', '2019');
	assert.equal(await decryptText(legacy.payload, 'legacy-pass', '2019'), 'hello legacy');

	// And the concatenation must not be reinterpreted through the v1 rules:
	// ("legacy-pass2019", no pepper) concatenates to the same legacy key.
	assert.equal(await decryptText(legacy.payload, 'legacy-pass2019'), 'hello legacy');

	await assert.rejects(() => decryptText(legacy.payload, 'legacy-pass'), DecryptionError);
	await assert.rejects(() => decryptText(legacy.payload, 'legacy-pass', 'wrong'), DecryptionError);
});

test('round-trips text far larger than the base64 chunk size', async () => {
	// Base64 encoding is done in 8 KB chunks for speed, so anything that
	// crosses a chunk boundary — or lands exactly on one — has to be verified.
	// An off-by-one here would corrupt data silently.
	//
	// Compression is switched off deliberately. With it on, 'x'.repeat(100000)
	// squeezes to ~149 bytes of ciphertext and the chunking is never exercised
	// at all — the test would pass while testing nothing.
	for (const size of [8191, 8192, 8193, 16384, 100_000]) {
		const text = 'x'.repeat(size);
		const payload = await encryptText(text, 'pw', '', FAST, { compress: false });
		const back = await decryptText(payload, 'pw');
		assert.equal(back.length, size, `length changed at ${size} bytes`);
		assert.equal(back, text, `content changed at ${size} bytes`);
	}
});

test('round-trips incompressible data across the chunk boundary', async () => {
	// The same boundaries with content compression cannot shrink, so the
	// chunked encoder is exercised on the default path too.
	for (const size of [8191, 8192, 8193, 20_000]) {
		const random = crypto.getRandomValues(new Uint8Array(size));
		const text = Array.from(random, (b) => String.fromCharCode(32 + (b % 95))).join('');
		const payload = await encryptText(text, 'pw', '', FAST);
		assert.equal(await decryptText(payload, 'pw'), text, `changed at ${size} bytes`);
	}
});

test('round-trips multi-byte characters across a chunk boundary', async () => {
	// A character whose UTF-8 bytes straddle the boundary is the case most
	// likely to break a chunked encoder.
	const filler = 'a'.repeat(8190);
	const text = `${filler}🔐${filler}中文`;

	for (const compress of [true, false]) {
		const payload = await encryptText(text, 'pw', '', FAST, { compress });
		assert.equal(await decryptText(payload, 'pw'), text, `failed with compress=${compress}`);
	}
});

test('compresses large text, and records that it did', async () => {
	const text = 'The quick brown fox jumps over the lazy dog.\n'.repeat(500);

	const compressed = await encryptText(text, 'pw', '', FAST);
	const plain = await encryptText(text, 'pw', '', FAST, { compress: false });

	assert.equal(compressed.split('.')[0], VERSION_GZIP);
	assert.equal(plain.split('.')[0], VERSION);
	assert.ok(
		compressed.length < plain.length / 2,
		`compression should more than halve this: ${compressed.length} vs ${plain.length}`
	);

	// Both must come back identical — the version tells decryption what to do.
	assert.equal(await decryptText(compressed, 'pw'), text);
	assert.equal(await decryptText(plain, 'pw'), text);
});

test('never makes a payload larger by compressing it', async () => {
	// gzip's header makes short input bigger, and random input incompressible.
	// Measured before this guard existed: a 38-byte API key came out 16% worse.
	const cases = [
		'not-a-real-stripe-key-9f3a7c21d8b4e6',
		'wagon rhythm exotic stand lens fortune brief grain siren wheel trophy blind',
		// Already-encrypted content: nothing left to compress.
		await encryptText('a sealed key', 'phrase', '', FAST)
	];

	for (const text of cases) {
		const auto = await encryptText(text, 'pw', '', FAST);
		const plain = await encryptText(text, 'pw', '', FAST, { compress: false });
		assert.ok(
			auto.length <= plain.length,
			`compression made this worse: ${auto.length} vs ${plain.length} for ${text.slice(0, 30)}`
		);
	}
});

test('short payloads stay STv1, so older copies of the tool can still read them', async () => {
	// Compatibility where it matters most: a password or a seed phrase is
	// written in the original format, and only large text needs a current tool.
	const short = await encryptText('hunter2', 'pw', '', FAST);
	assert.equal(short.split('.')[0], VERSION);
});

test('tolerates whitespace inside a payload', async () => {
	// Payloads get wrapped by email clients and retyped from printed backups
	// in readable groups. Neither format can legitimately contain whitespace,
	// so stripping it is safe and rescues both cases.
	const payload = await encryptText('recoverable', 'pw', '', FAST);

	const wrapped = payload.replace(/(.{20})/g, '$1\n');
	assert.equal(await decryptText(wrapped, 'pw'), 'recoverable');

	const grouped = payload.match(/.{1,8}/g).join(' ');
	assert.equal(await decryptText(grouped, 'pw'), 'recoverable');

	assert.equal(await decryptText(`\n  ${payload}\t\n`, 'pw'), 'recoverable');
});

test('estimateStrength ranks passphrases sensibly', () => {
	assert.equal(estimateStrength('').score, 0);
	assert.equal(estimateStrength('').label, 'empty');

	const weak = estimateStrength('abc');
	const strong = estimateStrength('My dog Rex ate pizza in Paris last summer');
	assert.ok(weak.score < strong.score, 'a long passphrase should outrank a short one');
	assert.ok(strong.bits > weak.bits);

	// Repetition should not be mistaken for entropy.
	assert.ok(estimateStrength('aaaaaaaaaaaaaaaaaaaa').bits < estimateStrength('aB3$xY9!zQ7#').bits);
});

/**
 * Build a pre-v1 payload using the exact scheme the original release used:
 * deriveBits -> importKey, 100,000 iterations, JSON + btoa, and — critically —
 * the pepper appended to the passphrase by bare concatenation. Generated at
 * test time rather than hard-coded so the fixture cannot drift from its own
 * spec.
 */
async function buildLegacyFixture(passphrase, pepper = '') {
	const encoder = new TextEncoder();
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));

	// Verbatim from the original terminal.js:
	//   const combinedKey = pepper ? passphrase + pepper : passphrase;
	const combinedKey = pepper ? passphrase + pepper : passphrase;

	const material = await crypto.subtle.importKey(
		'raw', encoder.encode(combinedKey), { name: 'PBKDF2' }, false, ['deriveBits']
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, material, 256
	);
	const key = await crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['encrypt']);
	const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode('hello legacy'));

	return {
		payload: btoa(JSON.stringify({
			salt: Array.from(salt),
			iv: Array.from(iv),
			data: Array.from(new Uint8Array(data))
		}))
	};
}
