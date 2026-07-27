/**
 * Tests for the command line front-end.
 *
 * The CLI is run as a real subprocess rather than imported, because most of
 * what matters here is process behaviour: what lands on stdout versus stderr,
 * what the exit code is, and whether a pipeline works. None of that is
 * observable from inside the module.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(root, 'cli', 'secure-term.js');
const PASS = 'tractor-window-brisket-9';

const ENV_FILE = `# Production credentials
STRIPE_SECRET_KEY=not-a-real-stripe-key-9f3a7c21
DATABASE_URL=postgres://admin:hunter2@db.internal:5432/app
`;

/** Run the CLI. Never throws on a non-zero exit -- the exit code is the result. */
async function cli(args, { input, env = {}, passphrase = PASS, fast = true } = {}) {
	const argv = [...args];

	// PBKDF2 is deliberately slow, and these tests do not need that slowness:
	// at the real default every encrypting test would cost most of a second.
	// Decryption needs no equivalent, since it takes the count from the payload.
	const isEncrypt = /^(e|enc|encrypt)$/.test(args[0] ?? '');
	if (fast && isEncrypt && !args.includes('--iterations')) {
		argv.push('--iterations', '1000');
	}

	// spawn rather than execFile: execFile has no `input` option (that belongs
	// to the *Sync variants), so piping stdin has to be done by hand. stdin is
	// always closed, or a CLI waiting on it would hang the suite.
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [CLI, ...argv], {
			env: {
				...process.env,
				NO_COLOR: '1',
				SECURE_TERM_PASSPHRASE: passphrase,
				...env
			}
		});

		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
		child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });

		child.on('error', reject);
		child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));

		child.stdin.on('error', () => {}); // EPIPE if the child exits early
		child.stdin.end(input ?? '');
	});
}

/**
 * Run `fn` against a throwaway directory, cleaned up afterwards.
 *
 * Must await: without it the finally block deletes the directory while the
 * async callback is still working in it.
 */
async function withTempDir(fn) {
	const dir = mkdtempSync(join(tmpdir(), 'secure-term-'));
	try {
		return await fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

// ------------------------------------------------------------------- the help

test('--help exits successfully and leads with what it does', async () => {
	const { code, stderr } = await cli(['--help']);
	assert.equal(code, 0);

	// A newcomer needs the sections in this order: what it is, then a command
	// they can copy, then the reference material.
	for (const section of ['USAGE', 'GETTING STARTED', 'IN A PIPELINE', 'OPTIONS', 'LEARN MORE']) {
		assert.ok(stderr.includes(section), `--help is missing the ${section} section`);
	}

	assert.ok(
		stderr.indexOf('GETTING STARTED') < stderr.indexOf('OPTIONS'),
		'examples must come before the options table, not after'
	);
});

test('--help states plainly that there is no recovery', async () => {
	// The one thing a new user must not miss.
	const { stderr } = await cli(['--help']);
	assert.match(stderr, /no password reset and no recovery/i);
});

test('running with no arguments orients rather than erroring', async () => {
	const { code, stderr } = await cli([]);
	assert.equal(code, 0, 'a bare invocation should not be treated as a mistake');
	assert.match(stderr, /secure-term encrypt/);
	assert.match(stderr, /--help/);
});

test('every advertised help topic exists', async () => {
	const { stderr: help } = await cli(['--help']);
	const advertised = [...help.matchAll(/secure-term help (\w+)/g)].map((m) => m[1]);
	assert.ok(advertised.length >= 4, 'expected several help topics to be advertised');

	for (const topic of advertised) {
		const { code, stderr } = await cli(['help', topic]);
		assert.equal(code, 0, `help topic '${topic}' is advertised but does not work`);
		assert.ok(stderr.trim().length > 200, `help topic '${topic}' is suspiciously thin`);
	}
});

test('an unknown help topic lists the real ones instead of failing silently', async () => {
	const { code, stderr } = await cli(['help', 'nonsense']);
	assert.equal(code, 1);
	assert.match(stderr, /Available topics:/);
});

test('help for sharing explains the out-of-band rule', async () => {
	// The single most important thing to get right when using this with a
	// colleague, and the easiest to get wrong.
	const { stderr } = await cli(['help', 'sharing']);
	assert.match(stderr, /passphrase/i);
	assert.match(stderr, /call/i);
});

// -------------------------------------------------------------- friendly errors

test('a plausible wrong verb suggests the right one', async () => {
	const { code, stderr } = await cli(['lock', 'file.txt']);
	assert.equal(code, 1);
	assert.match(stderr, /did you mean 'encrypt'/);
});

test('an unknown command points at --help rather than dumping usage', async () => {
	const { code, stderr } = await cli(['banana']);
	assert.equal(code, 1);
	assert.match(stderr, /--help/);
});

test('a missing file says so in plain language', async () => {
	const { code, stderr } = await cli(['encrypt', '/definitely/not/here.env']);
	assert.equal(code, 3);
	assert.match(stderr, /no file called/i);
});

test('a wrong passphrase explains the likely causes', async () => {
	await withTempDir(async (dir) => {
		const file = join(dir, '.env');
		writeFileSync(file, ENV_FILE);
		const enc = join(dir, '.env.enc');
		await cli(['encrypt', file, '-o', enc]);

		const { code, stderr } = await cli(['decrypt', enc], { passphrase: 'wrong' });
		assert.equal(code, 2);
		assert.match(stderr, /caps lock/i, 'should suggest the most common cause');
		assert.match(stderr, /pepper/i);
	});
});

test('input that is not a payload is diagnosed as such', async () => {
	const { code, stderr } = await cli(['decrypt'], { input: 'hello, not a payload\n' });
	assert.equal(code, 2);
	assert.match(stderr, /does not look like an encrypted payload/i);
	assert.match(stderr, /STv1/);
});

// ------------------------------------------------------------------- behaviour

test('round-trips a .env file through disk', async () => {
	await withTempDir(async (dir) => {
		const source = join(dir, '.env');
		const enc = join(dir, '.env.enc');
		const out = join(dir, '.env.out');
		writeFileSync(source, ENV_FILE);

		assert.equal((await cli(['encrypt', source, '-o', enc])).code, 0);
		assert.equal((await cli(['decrypt', enc, '-o', out])).code, 0);
		assert.equal(readFileSync(out, 'utf8'), ENV_FILE);
	});
});

test('writes output files that only the owner can read', async () => {
	await withTempDir(async (dir) => {
		const source = join(dir, '.env');
		const enc = join(dir, '.env.enc');
		writeFileSync(source, ENV_FILE);
		await cli(['encrypt', source, '-o', enc]);

		const { statSync } = await import('node:fs');
		assert.equal(statSync(enc).mode & 0o077, 0, 'decrypted secrets must not be group/world readable');
	});
});

test('refuses to overwrite an existing file unless forced', async () => {
	await withTempDir(async (dir) => {
		const source = join(dir, '.env');
		const target = join(dir, 'existing.enc');
		writeFileSync(source, ENV_FILE);
		writeFileSync(target, 'PRECIOUS');

		const refused = await cli(['encrypt', source, '-o', target]);
		assert.equal(refused.code, 3);
		assert.match(refused.stderr, /already exists/);
		assert.equal(readFileSync(target, 'utf8'), 'PRECIOUS', 'the file must be untouched');

		const forced = await cli(['encrypt', source, '-o', target, '--force']);
		assert.equal(forced.code, 0);
		assert.notEqual(readFileSync(target, 'utf8'), 'PRECIOUS');
	});
});

test('puts the payload on stdout and nothing else', async () => {
	// What makes `secure-term encrypt .env | pbcopy` usable.
	const { code, stdout } = await cli(['encrypt'], { input: ENV_FILE });
	assert.equal(code, 0);

	const lines = stdout.trim().split('\n');
	assert.equal(lines.length, 1, 'stdout should carry exactly one line');
	assert.match(lines[0], /^STv1\.\d+\./);
});

test('works as a filter, so encrypt and decrypt can be chained', async () => {
	const encrypted = await cli(['encrypt'], { input: ENV_FILE });
	const decrypted = await cli(['decrypt'], { input: encrypted.stdout });
	assert.equal(decrypted.stdout, ENV_FILE);
});

test('reports variable names but never values', async () => {
	// The summary is designed to be safe on a shared screen or in a CI log.
	const { stderr } = await cli(['encrypt'], { input: ENV_FILE });

	assert.match(stderr, /STRIPE_SECRET_KEY/, 'names are useful and should be shown');
	for (const value of ['not-a-real-stripe-key-9f3a7c21', 'hunter2', 'postgres://admin']) {
		assert.ok(!stderr.includes(value), `the CLI printed a secret value: ${value}`);
	}
});

test('honours a pepper from the environment', async () => {
	const encrypted = await cli(['encrypt'], {
		input: 'top secret',
		env: { SECURE_TERM_PEPPER: '2019' }
	});

	const right = await cli(['decrypt'], {
		input: encrypted.stdout,
		env: { SECURE_TERM_PEPPER: '2019' }
	});
	assert.equal(right.stdout.trim(), 'top secret');

	const wrong = await cli(['decrypt'], { input: encrypted.stdout });
	assert.equal(wrong.code, 2, 'decrypting without the pepper must fail');
});

test('rejects an implausible iteration count instead of accepting it', async () => {
	const { code, stderr } = await cli(['encrypt', '--iterations', '5'], { input: 'x' });
	assert.equal(code, 1);
	assert.match(stderr, /at least 1000/);
});

test('refuses to encrypt empty input rather than producing a useless payload', async () => {
	const { code, stderr } = await cli(['encrypt'], { input: '   \n' });
	assert.equal(code, 1);
	assert.match(stderr, /nothing to encrypt/i);
});

test('--version prints a bare version on stdout', async () => {
	const { code, stdout } = await cli(['--version']);
	assert.equal(code, 0);
	assert.match(stdout.trim(), /^\d+\.\d+\.\d+$/);
});

test('accepts the same single-letter commands as the web app', async () => {
	const encrypted = await cli(['e'], { input: 'muscle memory' });
	assert.equal(encrypted.code, 0);
	const decrypted = await cli(['d'], { input: encrypted.stdout });
	assert.equal(decrypted.stdout.trim(), 'muscle memory');
});

// -------------------------------------------------------------------- security

test('refuses a binary file instead of silently destroying it', async () => {
	// Regression test for real data loss. Reading a PNG as utf8 replaces every
	// invalid byte with U+FFFD, which is not reversible: a 38,935-byte image
	// came back as 70,585 bytes of garbage, with both encrypt and decrypt
	// reporting success. Anyone who deleted the original had lost it.
	await withTempDir(async (dir) => {
		const png = join(dir, 'image.png');
		const bytes = Buffer.concat([
			Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
			Buffer.from(Array.from({ length: 512 }, (_, i) => i % 256))
		]);
		writeFileSync(png, bytes);

		const { code, stderr, stdout } = await cli(['encrypt', png]);
		assert.equal(code, 3);
		assert.match(stderr, /not a text file/i);
		assert.match(stderr, /Nothing was encrypted/);
		assert.equal(stdout, '', 'no payload should be produced');

		// And it must say what to do instead, not just refuse.
		assert.match(stderr, /base64/);
	});
});

test('refuses binary arriving on stdin too', async () => {
	const { code, stderr } = await cli(['encrypt'], {
		input: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
	});
	assert.equal(code, 3);
	assert.match(stderr, /not text/i);
});

test('the documented base64 workaround round-trips a binary file', async () => {
	// The error message tells people to pipe through base64. That advice has
	// to actually work.
	await withTempDir(async (dir) => {
		const original = Buffer.from(Array.from({ length: 1024 }, (_, i) => (i * 7) % 256));
		const encoded = original.toString('base64');

		const sealed = await cli(['encrypt'], { input: encoded });
		assert.equal(sealed.code, 0);

		const opened = await cli(['decrypt'], { input: sealed.stdout });
		assert.equal(opened.code, 0);
		assert.ok(Buffer.from(opened.stdout.trim(), 'base64').equals(original));
	});
});

test('accepts a large text file, the book-length case', async () => {
	// The tool has no length limit by design; this pins that it stays true
	// past the point where the base64 chunking kicks in.
	await withTempDir(async (dir) => {
		const book = join(dir, 'book.txt');
		const text = 'The quick brown fox jumps over the lazy dog.\n'.repeat(12_000); // ~528 KB
		writeFileSync(book, text);

		const enc = join(dir, 'book.enc');
		const out = join(dir, 'book.out');
		assert.equal((await cli(['encrypt', book, '-o', enc])).code, 0);
		assert.equal((await cli(['decrypt', enc, '-o', out])).code, 0);
		assert.equal(readFileSync(out, 'utf8'), text);
	});
});

test('compresses large text and says so, without being asked', async () => {
	const text = 'The quick brown fox jumps over the lazy dog.\n'.repeat(500);
	const { code, stdout, stderr } = await cli(['encrypt'], { input: text });

	assert.equal(code, 0);
	assert.match(stdout.trim(), /^STv2\./, 'should have chosen the compressed format');
	assert.match(stderr, /compressed/i);
	assert.match(stderr, /% smaller/);
});

test('--no-compress opts out, and both forms round-trip', async () => {
	const text = 'The quick brown fox jumps over the lazy dog.\n'.repeat(500);

	const squeezed = await cli(['encrypt'], { input: text });
	const plain = await cli(['encrypt', '--no-compress'], { input: text });

	assert.match(plain.stdout.trim(), /^STv1\./);
	assert.ok(squeezed.stdout.length < plain.stdout.length / 2);

	for (const payload of [squeezed.stdout, plain.stdout]) {
		const back = await cli(['decrypt'], { input: payload });
		assert.equal(back.stdout, text);
	}
});

test('warns when a payload is too long to paste, and stays quiet when it is not', async () => {
	// The channel is the real limit, and finding out after pasting is too late.
	const huge = await cli(['encrypt', '--no-compress'], {
		input: 'x'.repeat(60_000).replace(/x/g, () => String.fromCharCode(33 + Math.random() * 90))
	});
	assert.match(huge.stderr, /Too long to paste/);
	assert.match(huge.stderr, /Slack/);

	const small = await cli(['encrypt'], { input: 'hunter2' });
	assert.ok(!/Too long to paste/.test(small.stderr));
});

test('reports the payload length in characters, which is what channels count', async () => {
	const { stderr } = await cli(['encrypt'], { input: 'a short secret' });
	assert.match(stderr, /Payload: \d+ characters/);
});

test('the limits topic carries the measured figures', async () => {
	const { code, stderr } = await cli(['help', 'limits']);
	assert.equal(code, 0);
	assert.match(stderr, /2,953/, 'the QR ceiling');
	assert.match(stderr, /40,000/, 'the Slack ceiling');
	assert.match(stderr, /age/, 'and where to go for real files');
});

test('there is no flag that takes a passphrase on the command line', async () => {
	// Anything on argv is visible in `ps` and lands in shell history, so the
	// only supported non-interactive route is the environment. This guards
	// against someone adding --passphrase as a convenience later.
	const source = readFileSync(join(root, 'cli', 'secure-term.js'), 'utf8');
	assert.doesNotMatch(source, /'--passphrase'/);
	assert.doesNotMatch(source, /'--password'/);

	const { code } = await cli(['encrypt', '--passphrase', 'hunter2'], { input: 'x' });
	assert.equal(code, 1, '--passphrase must not be accepted');
});
