/**
 * Tests for sealing a project key with a memorable passphrase.
 *
 * This is the tool's founding idea applied to itself: a project key is 32
 * random bytes and cannot be memorised, so it must be stored — and `backup`
 * makes the stored form safe to keep anywhere by protecting it with something
 * a person cannot forget.
 *
 * The stakes here are higher than anywhere else in the codebase. A backup that
 * silently does not work is discovered on the day the key is already lost.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(root, 'cli', 'secure-term.js');
const PHRASE = 'My dog Rex ate pizza in Paris last summer';

function cli(args, { cwd, input, env = {} } = {}) {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [CLI, ...args], {
			cwd,
			env: { ...process.env, NO_COLOR: '1', ...env }
		});
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8').on('data', (c) => { stdout += c; });
		child.stderr.setEncoding('utf8').on('data', (c) => { stderr += c; });
		child.on('error', reject);
		child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
		child.stdin.on('error', () => {});
		child.stdin.end(input ?? '');
	});
}

async function withProject(fn) {
	const dir = mkdtempSync(join(tmpdir(), 'secure-term-backup-'));
	try {
		return await fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** A project with a key, an encrypted .env, and the key's value. */
async function setUp(dir) {
	writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
	await cli(['init', '-q'], { cwd: dir });
	writeFileSync(join(dir, '.env'), 'DATABASE_URL=postgres://prod/db\nAPI_KEY=not-a-real-stripe-key\n');
	await cli(['encrypt', '.env', '-o', '.env.enc', '-q'], { cwd: dir });
	rmSync(join(dir, '.env'));
	return readFileSync(join(dir, '.secure-term.key'), 'utf8').trim();
}

const seal = (dir, extra = []) =>
	cli(['backup', '--no-confirm', '-q', ...extra], {
		cwd: dir,
		env: { SECURE_TERM_PASSPHRASE: PHRASE }
	});

// -------------------------------------------------------------- the round trip

test('a lost key is recovered from the phrase and the backup', async () => {
	// The whole point, end to end: lose the key file entirely, hold only a
	// sentence in your head and a blob you stored somewhere, get the key back.
	await withProject(async (dir) => {
		const original = await setUp(dir);

		const sealed = await seal(dir);
		assert.equal(sealed.code, 0);
		writeFileSync(join(dir, 'stored-elsewhere.txt'), sealed.stdout);

		rmSync(join(dir, '.secure-term.key'));
		assert.ok(!existsSync(join(dir, '.secure-term.key')));

		const restored = await cli(['restore', 'stored-elsewhere.txt', '-q'], {
			cwd: dir,
			env: { SECURE_TERM_PASSPHRASE: PHRASE }
		});
		assert.equal(restored.code, 0);
		assert.equal(readFileSync(join(dir, '.secure-term.key'), 'utf8').trim(), original);
	});
});

test('the recovered key actually opens the project again', async () => {
	// Byte equality is not quite proof; the project has to work.
	await withProject(async (dir) => {
		await setUp(dir);
		const sealed = await seal(dir);
		rmSync(join(dir, '.secure-term.key'));

		await cli(['restore', '-q'], {
			cwd: dir,
			input: sealed.stdout,
			env: { SECURE_TERM_PASSPHRASE: PHRASE }
		});

		const { code, stdout } = await cli(
			['run', '-q', '--', process.execPath, '-e', 'console.log(process.env.DATABASE_URL)'],
			{ cwd: dir }
		);
		assert.equal(code, 0);
		assert.match(stdout, /postgres:\/\/prod\/db/);
	});
});

test('the backup verifies itself before reporting success', async () => {
	// A backup nobody has opened is not a backup. This is the one artefact
	// where finding out later means the key is already gone.
	await withProject(async (dir) => {
		await setUp(dir);
		const { stderr } = await cli(['backup', '--no-confirm'], {
			cwd: dir,
			env: { SECURE_TERM_PASSPHRASE: PHRASE }
		});
		assert.match(stderr, /verified/i);
	});
});

test('a backup survives being retyped in groups across several lines', async () => {
	// It is printed in groups precisely so it can be copied by hand off paper.
	await withProject(async (dir) => {
		const original = await setUp(dir);
		const sealed = (await seal(dir)).stdout.trim();

		const groups = sealed.match(/.{1,8}/g);
		const retyped = groups.reduce(
			(lines, group, i) => (i % 5 === 0 ? [...lines, group] : [...lines.slice(0, -1), `${lines.at(-1)} ${group}`]),
			[]
		).join('\n');

		assert.notEqual(retyped, sealed, 'the test should be feeding in whitespace');
		rmSync(join(dir, '.secure-term.key'));

		const restored = await cli(['restore', '-q'], {
			cwd: dir,
			input: retyped,
			env: { SECURE_TERM_PASSPHRASE: PHRASE }
		});
		assert.equal(restored.code, 0);
		assert.equal(readFileSync(join(dir, '.secure-term.key'), 'utf8').trim(), original);
	});
});

test('the sealed form reveals nothing about the key', async () => {
	await withProject(async (dir) => {
		const key = await setUp(dir);
		const sealed = (await seal(dir)).stdout;

		assert.ok(!sealed.includes(key), 'the key must not appear in its own backup');
		assert.match(sealed.trim(), /^STv1\.\d+\./, 'it is an ordinary payload');
	});
});

test('two backups of the same key differ', async () => {
	// Fresh salt and IV each time, so storing a backup in two places does not
	// hand an attacker a matched pair.
	await withProject(async (dir) => {
		await setUp(dir);
		const first = (await seal(dir)).stdout.trim();
		const second = (await seal(dir)).stdout.trim();
		assert.notEqual(first, second);
	});
});

// ------------------------------------------------------------------ safeguards

test('the key file can never become its own backup passphrase', async () => {
	// The failure this prevents is silent and total: a key sealed with itself
	// would restore only for someone who already has the key.
	await withProject(async (dir) => {
		const key = await setUp(dir);
		const sealed = (await seal(dir)).stdout;

		rmSync(join(dir, '.secure-term.key'));
		const withKeyAsPhrase = await cli(['restore', '-q'], {
			cwd: dir,
			input: sealed,
			env: { SECURE_TERM_PASSPHRASE: key }
		});
		assert.equal(withKeyAsPhrase.code, 2, 'the key must not open the backup');
	});
});

test('restoring something that is not a key is rejected, not installed', async () => {
	// Restoring a .env.enc by mistake would otherwise write a "key file" full
	// of environment variables that then fails to decrypt anything.
	await withProject(async (dir) => {
		const key = await setUp(dir);
		rmSync(join(dir, '.secure-term.key'));

		const { code, stderr } = await cli(['restore', '.env.enc'], {
			cwd: dir,
			env: { SECURE_TERM_PASSPHRASE: key }
		});
		assert.equal(code, 1);
		assert.match(stderr, /does not contain a project key/i);
		assert.match(stderr, /secure-term decrypt/, 'and it should say what to use instead');
		assert.ok(!existsSync(join(dir, '.secure-term.key')), 'nothing should be written');
	});
});

test('restore refuses to overwrite the key in use without --force', async () => {
	await withProject(async (dir) => {
		const original = await setUp(dir);
		const sealed = (await seal(dir)).stdout;

		const refused = await cli(['restore'], {
			cwd: dir,
			input: sealed,
			env: { SECURE_TERM_PASSPHRASE: PHRASE }
		});
		assert.equal(refused.code, 3);
		assert.match(refused.stderr, /already exists/);
		assert.equal(readFileSync(join(dir, '.secure-term.key'), 'utf8').trim(), original);

		const forced = await cli(['restore', '--force', '-q'], {
			cwd: dir,
			input: sealed,
			env: { SECURE_TERM_PASSPHRASE: PHRASE }
		});
		assert.equal(forced.code, 0);
	});
});

test('a wrong phrase fails without hinting at the key', async () => {
	await withProject(async (dir) => {
		await setUp(dir);
		const sealed = (await seal(dir)).stdout;
		rmSync(join(dir, '.secure-term.key'));

		const { code, stderr } = await cli(['restore'], {
			cwd: dir,
			input: sealed,
			env: { SECURE_TERM_PASSPHRASE: 'not the right sentence' }
		});
		assert.equal(code, 2);
		assert.match(stderr, /Could not decrypt/);
		assert.ok(!existsSync(join(dir, '.secure-term.key')));
	});
});

test('a backup written into the repository is gitignored', async () => {
	// The command warns against committing it; leaving it trackable would put
	// the sealed key beside the .env.enc it unlocks.
	await withProject(async (dir) => {
		await setUp(dir);
		await seal(dir, ['-o', 'key-backup.txt']);

		const ignored = readFileSync(join(dir, '.gitignore'), 'utf8');
		assert.match(ignored, /^\/?key-backup\.txt$/m);
	});
});

test('backup says plainly not to commit it to this repository', async () => {
	await withProject(async (dir) => {
		await setUp(dir);
		const { stderr } = await cli(['backup', '--no-confirm'], {
			cwd: dir,
			env: { SECURE_TERM_PASSPHRASE: PHRASE }
		});
		assert.match(stderr, /not commit/i);
		assert.match(stderr, /\.env\.enc/, 'and explain why: both halves in one place');
	});
});

test('a pepper protects the backup as well', async () => {
	await withProject(async (dir) => {
		const original = await setUp(dir);

		const sealed = await cli(['backup', '--no-confirm', '-q', '-p'], {
			cwd: dir,
			env: { SECURE_TERM_PASSPHRASE: PHRASE, SECURE_TERM_PEPPER: '2019' }
		});
		assert.equal(sealed.code, 0);
		rmSync(join(dir, '.secure-term.key'));

		const withoutPepper = await cli(['restore', '-q'], {
			cwd: dir,
			input: sealed.stdout,
			env: { SECURE_TERM_PASSPHRASE: PHRASE }
		});
		assert.equal(withoutPepper.code, 2, 'the phrase alone must not be enough');

		const withPepper = await cli(['restore', '-q', '-p'], {
			cwd: dir,
			input: sealed.stdout,
			env: { SECURE_TERM_PASSPHRASE: PHRASE, SECURE_TERM_PEPPER: '2019' }
		});
		assert.equal(withPepper.code, 0);
		assert.equal(readFileSync(join(dir, '.secure-term.key'), 'utf8').trim(), original);
	});
});

test('backup explains itself when there is no key to seal', async () => {
	await withProject(async (dir) => {
		const { code, stderr } = await cli(['backup'], {
			cwd: dir,
			env: { SECURE_TERM_PASSPHRASE: PHRASE }
		});
		assert.equal(code, 3);
		assert.match(stderr, /secure-term init/);
	});
});

test('restore rejects empty input rather than writing an empty key', async () => {
	await withProject(async (dir) => {
		await setUp(dir);
		rmSync(join(dir, '.secure-term.key'));

		const { code, stderr } = await cli(['restore'], {
			cwd: dir,
			input: '   \n',
			env: { SECURE_TERM_PASSPHRASE: PHRASE }
		});
		assert.equal(code, 1);
		assert.match(stderr, /nothing to restore/i);
	});
});
