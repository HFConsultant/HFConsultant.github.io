/**
 * Tests for the project workflow: init, edit and run.
 *
 * These are the commands a team wires into package.json and then stops
 * thinking about, so the failure modes that matter are the quiet ones:
 * a key that is not gitignored, a plaintext file left behind, a variable
 * that silently does not reach the child process.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
	mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, statSync, readdirSync, chmodSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(root, 'cli', 'secure-term.js');

const ENV_FILE = `# Project secrets
DATABASE_URL=postgres://admin:hunter2@db.internal:5432/app
STRIPE_SECRET_KEY=not-a-real-stripe-key
PORT=3000 # dev only
`;

/** Run the CLI inside `cwd`. Never throws on non-zero exit. */
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
	const dir = mkdtempSync(join(tmpdir(), 'secure-term-project-'));
	try {
		return await fn(dir);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
}

/** A project with a key and an encrypted .env, ready to use. */
async function setUpProject(dir, { envText = ENV_FILE } = {}) {
	writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
	await cli(['init', '-q'], { cwd: dir });
	writeFileSync(join(dir, '.env'), envText);
	await cli(['encrypt', '.env', '-o', '.env.enc', '-q'], { cwd: dir });
	return readFileSync(join(dir, '.secure-term.key'), 'utf8').trim();
}

// ---------------------------------------------------------------------- init

test('init creates a key that is random, not derived from anything typed', async () => {
	await withProject(async (dir) => {
		const { code } = await cli(['init'], { cwd: dir });
		assert.equal(code, 0);

		const key = readFileSync(join(dir, '.secure-term.key'), 'utf8').trim();
		assert.ok(key.length >= 40, 'a 32-byte key should be at least 40 base64url chars');
		assert.match(key, /^[A-Za-z0-9_-]+$/, 'the key must be safe to paste anywhere');

		// Two projects must never share a key.
		await withProject(async (other) => {
			await cli(['init'], { cwd: other });
			const otherKey = readFileSync(join(other, '.secure-term.key'), 'utf8').trim();
			assert.notEqual(key, otherKey);
		});
	});
});

test('init writes the key readable only by its owner', async () => {
	await withProject(async (dir) => {
		await cli(['init'], { cwd: dir });
		const mode = statSync(join(dir, '.secure-term.key')).mode;
		assert.equal(mode & 0o077, 0, 'the project key must not be group or world readable');
	});
});

test('init adds the key to .gitignore', async () => {
	// The single most damaging mistake available: committing the key beside
	// the ciphertext it unlocks.
	await withProject(async (dir) => {
		writeFileSync(join(dir, '.gitignore'), 'node_modules/\n');
		await cli(['init'], { cwd: dir });

		const ignored = readFileSync(join(dir, '.gitignore'), 'utf8');
		assert.match(ignored, /^\/?\.secure-term\.key$/m);
		assert.match(ignored, /node_modules\//, 'existing entries must survive');
	});
});

test('init does not add a duplicate .gitignore entry', async () => {
	await withProject(async (dir) => {
		writeFileSync(join(dir, '.gitignore'), '/.secure-term.key\n');
		const { stderr } = await cli(['init'], { cwd: dir });

		const occurrences = readFileSync(join(dir, '.gitignore'), 'utf8')
			.split('\n')
			.filter((line) => line.trim() === '/.secure-term.key').length;
		assert.equal(occurrences, 1);
		assert.match(stderr, /[Aa]lready covered/);
	});
});

test('init refuses to overwrite an existing key without --force', async () => {
	// Overwriting a key makes every file encrypted with it unreadable.
	await withProject(async (dir) => {
		await cli(['init', '-q'], { cwd: dir });
		const original = readFileSync(join(dir, '.secure-term.key'), 'utf8');

		const refused = await cli(['init'], { cwd: dir });
		assert.equal(refused.code, 3);
		assert.match(refused.stderr, /already exists/);
		assert.equal(readFileSync(join(dir, '.secure-term.key'), 'utf8'), original);

		const forced = await cli(['init', '--force', '-q'], { cwd: dir });
		assert.equal(forced.code, 0);
		assert.notEqual(readFileSync(join(dir, '.secure-term.key'), 'utf8'), original);
	});
});

// ------------------------------------------------------------ key discovery

test('the project key is found automatically, with nothing typed', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);
		// No passphrase prompt, no environment variable, no terminal.
		const { code, stdout } = await cli(['decrypt', '.env.enc', '-q'], { cwd: dir });
		assert.equal(code, 0);
		assert.match(stdout, /DATABASE_URL=/);
	});
});

test('a key file readable by others earns a warning', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);
		chmodSync(join(dir, '.secure-term.key'), 0o644);

		const { code, stderr } = await cli(['decrypt', '.env.enc'], { cwd: dir });
		assert.equal(code, 0, 'a loose mode warns but still works — CI mounts files oddly');
		assert.match(stderr, /readable by other users/);
		assert.match(stderr, /chmod 600/);
	});
});

test('the environment takes precedence over a project key file', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);
		// Simulates production: the same repo, a different key source.
		const { code, stderr } = await cli(['decrypt', '.env.enc', '-q'], {
			cwd: dir,
			env: { SECURE_TERM_PASSPHRASE: 'not-the-project-key' }
		});
		assert.equal(code, 2, 'the environment key was used, and it is wrong');
		assert.match(stderr, /Could not decrypt/);
	});
});

test('a payload made with a project key opens with that key as a passphrase', async () => {
	// Nothing about the format changes for a key file -- it is just a
	// passphrase that lives in a file. This is what lets someone paste the
	// key into the web app on their phone and read the same payload.
	await withProject(async (dir) => {
		const key = await setUpProject(dir);
		rmSync(join(dir, '.secure-term.key')); // prove the file itself is not needed

		const { code, stdout } = await cli(['decrypt', '.env.enc', '-q'], {
			cwd: dir,
			env: { SECURE_TERM_PASSPHRASE: key }
		});
		assert.equal(code, 0);
		assert.match(stdout, /STRIPE_SECRET_KEY=/);
	});
});

test('--prompt insists on asking, ignoring the key file and the environment', async () => {
	// "Always ask" has to mean always, or it is not a usable escape hatch for
	// opening a payload that predates the project key.
	await withProject(async (dir) => {
		const key = await setUpProject(dir);
		const { code, stderr } = await cli(['decrypt', '.env.enc', '-P'], {
			cwd: dir,
			env: { SECURE_TERM_PASSPHRASE: key }
		});
		assert.equal(code, 1, 'with no terminal to prompt on, it must refuse rather than fall back');
		assert.match(stderr, /No terminal is available/);
	});
});

// ----------------------------------------------------------------------- run

test('run puts the decrypted variables into the child environment', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);

		const { code, stdout } = await cli(
			['run', '-q', '--', process.execPath, '-e', 'console.log(process.env.DATABASE_URL)'],
			{ cwd: dir }
		);
		assert.equal(code, 0);
		assert.match(stdout, /postgres:\/\/admin:hunter2@db\.internal/);
	});
});

test('run never writes the plaintext to disk', async () => {
	// The whole reason `run` exists rather than "decrypt then start".
	await withProject(async (dir) => {
		await setUpProject(dir);
		rmSync(join(dir, '.env'));

		await cli(['run', '-q', '--', process.execPath, '-e', '0'], { cwd: dir });

		const files = readdirSync(dir);
		assert.ok(!files.includes('.env'), 'run must not leave a decrypted .env behind');
		assert.deepEqual(
			files.filter((f) => f.includes('tmp') || f.endsWith('.dec')),
			[],
			'no temporary plaintext should remain'
		);
	});
});

test('a variable already set in the shell is not overridden', async () => {
	// `PORT=4000 secure-term run -- npm start` must behave as anyone expects,
	// and CI-injected values must not be replaced by stale committed ones.
	await withProject(async (dir) => {
		await setUpProject(dir);

		const { stdout } = await cli(
			['run', '-q', '--', process.execPath, '-e', 'console.log(process.env.PORT)'],
			{ cwd: dir, env: { PORT: '4000' } }
		);
		assert.equal(stdout.trim(), '4000');
	});
});

test('run passes the child exit code straight through', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);
		const { code } = await cli(
			['run', '-q', '--', process.execPath, '-e', 'process.exit(42)'],
			{ cwd: dir }
		);
		assert.equal(code, 42, 'so this composes with npm test and CI');
	});
});

test('run reports variable names but never values', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);
		const { stderr } = await cli(['run', '--', process.execPath, '-e', '0'], { cwd: dir });

		assert.match(stderr, /DATABASE_URL/, 'names are useful');
		for (const secret of ['hunter2', 'not-a-real-stripe-key']) {
			assert.ok(!stderr.includes(secret), `run printed a secret value: ${secret}`);
		}
	});
});

test('run without a command explains the double dash', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);
		const { code, stderr } = await cli(['run'], { cwd: dir });
		assert.equal(code, 1);
		assert.match(stderr, /--/);
		assert.match(stderr, /npm run dev/);
	});
});

test('run says what to do when there is no encrypted file', async () => {
	await withProject(async (dir) => {
		await cli(['init', '-q'], { cwd: dir });
		const { code, stderr } = await cli(['run', '--', 'echo', 'hi'], { cwd: dir });
		assert.equal(code, 3);
		assert.match(stderr, /secure-term encrypt \.env/);
	});
});

test('run reports a command that does not exist without blaming the payload', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);
		const { code, stderr } = await cli(
			['run', '-q', '--', 'definitely-not-a-real-command-xyz'],
			{ cwd: dir }
		);
		assert.equal(code, 3);
		assert.match(stderr, /no such command/i);
	});
});

test("the child's own flags are not parsed as ours", async () => {
	// Everything after `--` belongs to the child, including -q and --help.
	await withProject(async (dir) => {
		await setUpProject(dir);
		const { code, stdout } = await cli(
			['run', '-q', '--', process.execPath, '-e', 'console.log("--help -q --force")'],
			{ cwd: dir }
		);
		assert.equal(code, 0);
		assert.match(stdout, /--help -q --force/);
	});
});

// ---------------------------------------------------------------------- edit

test('edit round-trips through an editor and re-encrypts', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);

		const editor = join(dir, 'editor.sh');
		writeFileSync(editor, '#!/bin/sh\nprintf "REDIS_URL=redis://localhost:6379\\n" >> "$1"\n', { mode: 0o755 });

		const { code, stderr } = await cli(['edit', '.env.enc'], {
			cwd: dir,
			env: { EDITOR: editor }
		});
		assert.equal(code, 0);
		assert.match(stderr, /Saved/);

		const { stdout } = await cli(['decrypt', '.env.enc', '-q'], { cwd: dir });
		assert.match(stdout, /REDIS_URL=redis:\/\/localhost:6379/);
		assert.match(stdout, /DATABASE_URL=/, 'the original contents must survive');
	});
});

test('edit leaves no plaintext behind', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);
		rmSync(join(dir, '.env'));

		const editor = join(dir, 'editor.sh');
		writeFileSync(editor, '#!/bin/sh\nprintf "X=1\\n" >> "$1"\n', { mode: 0o755 });
		await cli(['edit', '.env.enc'], { cwd: dir, env: { EDITOR: editor } });

		const stale = readdirSync(dir).filter((f) => f.startsWith('.env.enc.tmp'));
		assert.deepEqual(stale, [], 'the atomic-write temporary file must be renamed away');
	});
});

test('edit detects when nothing changed', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);
		const before = readFileSync(join(dir, '.env.enc'), 'utf8');

		const { code, stderr } = await cli(['edit', '.env.enc'], { cwd: dir, env: { EDITOR: 'true' } });
		assert.equal(code, 0);
		assert.match(stderr, /No changes/);
		assert.equal(readFileSync(join(dir, '.env.enc'), 'utf8'), before, 'no pointless rewrite');
	});
});

test('edit leaves the file alone when the editor fails', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);
		const before = readFileSync(join(dir, '.env.enc'), 'utf8');

		const { code, stderr } = await cli(['edit', '.env.enc'], { cwd: dir, env: { EDITOR: 'false' } });
		assert.equal(code, 3);
		assert.match(stderr, /unchanged/);
		assert.equal(readFileSync(join(dir, '.env.enc'), 'utf8'), before);
	});
});

test('edit refuses to save an emptied file', async () => {
	// Almost certainly a mistake, and it would destroy every secret.
	await withProject(async (dir) => {
		await setUpProject(dir);
		const before = readFileSync(join(dir, '.env.enc'), 'utf8');

		const editor = join(dir, 'editor.sh');
		writeFileSync(editor, '#!/bin/sh\n: > "$1"\n', { mode: 0o755 });

		const { code, stderr } = await cli(['edit', '.env.enc'], { cwd: dir, env: { EDITOR: editor } });
		assert.equal(code, 1);
		assert.match(stderr, /empty/);
		assert.equal(readFileSync(join(dir, '.env.enc'), 'utf8'), before);
	});
});

test('edit creates a new encrypted file when there is none', async () => {
	await withProject(async (dir) => {
		await cli(['init', '-q'], { cwd: dir });

		const editor = join(dir, 'editor.sh');
		writeFileSync(editor, '#!/bin/sh\nprintf "NEW=1\\n" >> "$1"\n', { mode: 0o755 });

		const { code } = await cli(['edit', 'secrets.enc'], { cwd: dir, env: { EDITOR: editor } });
		assert.equal(code, 0);
		assert.ok(existsSync(join(dir, 'secrets.enc')));

		const { stdout } = await cli(['decrypt', 'secrets.enc', '-q'], { cwd: dir });
		assert.match(stdout, /NEW=1/);
	});
});

test('edit explains itself when no editor is configured', async () => {
	await withProject(async (dir) => {
		await setUpProject(dir);
		const { code, stderr } = await cli(['edit', '.env.enc'], {
			cwd: dir,
			env: { EDITOR: '', VISUAL: '', SECURE_TERM_EDITOR: '' }
		});
		assert.equal(code, 1);
		assert.match(stderr, /export EDITOR=/);
	});
});
