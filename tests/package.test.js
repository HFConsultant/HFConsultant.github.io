/**
 * Packaging tests.
 *
 * The published package is a subset of the repository, chosen by the "files"
 * whitelist. That makes it possible for the CLI to work perfectly from a
 * checkout and be broken the moment it is installed from npm, because a module
 * it imports was never packed -- the same failure mode as the service worker
 * precaching a file that did not exist, in a place nobody looks until a user
 * reports it.
 *
 * So: follow the imports, and assert the whitelist covers them.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const pkg = JSON.parse(read('package.json'));

/** Every relative import reachable from `entry`, as repo-relative paths. */
function importGraph(entry) {
	const seen = new Set([entry]);
	const queue = [entry];

	while (queue.length) {
		const file = queue.shift();
		if (!existsSync(join(root, file))) continue;

		const specifiers = [...read(file).matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g)]
			.map((m) => m[1])
			.filter((specifier) => specifier.startsWith('.'));

		for (const specifier of specifiers) {
			const dir = dirname(file);
			const resolved = join(dir, specifier).replace(/\\/g, '/');
			if (!seen.has(resolved)) {
				seen.add(resolved);
				queue.push(resolved);
			}
		}
	}

	return [...seen];
}

/** Would `files` include this path in the tarball? */
function isPacked(path) {
	return pkg.files.some((entry) => (entry.endsWith('/') ? path.startsWith(entry) : entry === path));
}

test('the package ships every module the CLI imports', () => {
	const graph = importGraph('cli/secure-term.js');
	assert.ok(graph.length > 1, 'expected the CLI to import at least one module');

	for (const file of graph) {
		assert.ok(existsSync(join(root, file)), `the CLI imports a file that does not exist: ${file}`);
		assert.ok(
			isPacked(file),
			`${file} is imported by the CLI but excluded from the published package by "files"`
		);
	}
});

test('the bin entry exists, is executable, and has a shebang', () => {
	const binPath = pkg.bin['secure-term'];
	assert.ok(binPath, 'package.json declares no secure-term bin');

	const full = join(root, binPath);
	assert.ok(existsSync(full), `bin points at a missing file: ${binPath}`);
	assert.match(read(binPath), /^#!\/usr\/bin\/env node\n/, 'bin needs a node shebang');

	// npm sets the executable bit on install, but a non-executable file in git
	// is a signal the shebang was added without testing the command.
	assert.ok(statSync(full).mode & 0o111, `${binPath} is not executable`);
});

test('every path in "exports" is shipped and exists', () => {
	for (const [name, target] of Object.entries(pkg.exports)) {
		const path = target.replace(/^\.\//, '');
		assert.ok(existsSync(join(root, path)), `exports["${name}"] points at a missing file`);
		assert.ok(isPacked(path), `exports["${name}"] is not included by "files"`);
	}
});

test('the website is not published to npm', () => {
	// GitHub Pages serves the site; npm gets the CLI and the shared core. A
	// stray index.html in the tarball means the whitelist has drifted.
	for (const path of ['index.html', 'css/style.css', 'js/terminal.js', 'service-worker.js']) {
		assert.ok(!isPacked(path), `${path} should not be in the published package`);
	}
});

test('the declared Node engine matches what the CLI enforces', () => {
	const declared = pkg.engines.node.match(/(\d+)/)[1];
	const enforced = read('cli/secure-term.js').match(/const MINIMUM_NODE = (\d+)/)?.[1];

	assert.ok(enforced, 'the CLI has no MINIMUM_NODE constant');
	assert.equal(
		enforced,
		declared,
		'package.json engines and the CLI runtime check disagree about the minimum Node'
	);
});

test('the declared engine is one the code actually runs on', () => {
	// Node exposes Web Crypto as a global only from v19 unflagged and v20
	// stably. Claiming support for anything older is a promise the crypto core
	// cannot keep -- verified by running the suite on 18, where it fails.
	const declared = Number(pkg.engines.node.match(/(\d+)/)[1]);
	assert.ok(declared >= 20, 'Web Crypto is not a reliable global below Node 20');
});

test('no file in the repository contains a credential-shaped string', () => {
	// GitHub push protection blocked a push over a *test fixture* that looked
	// like a real Stripe key. It was right to: a repository that ships
	// credential-shaped strings trains everyone to wave scanners through, and
	// docs/scanners.md asks other people not to do this.
	//
	// Fixtures only need to be distinctive, not realistic — these tests check
	// that values never leak while names are shown, and a value that cannot be
	// mistaken for a live key serves that just as well.
	const patterns = [
		[/sk_live_[0-9A-Za-z]{8,}/, 'Stripe secret key'],
		[/pk_live_[0-9A-Za-z]{8,}/, 'Stripe publishable key'],
		[/AKIA[0-9A-Z]{16}/, 'AWS access key id'],
		[/ghp_[0-9A-Za-z]{20,}/, 'GitHub personal access token'],
		[/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, 'private key']
	];

	// Read and match in JS rather than shelling out to grep: grep silently
	// found nothing in these very files, because some contain characters it
	// treats as binary. That false clean is how the last one slipped through.
	const skip = new Set(['node_modules', '.git', 'icons']);
	const offenders = [];

	const walk = (dir) => {
		for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
			if (skip.has(entry.name)) continue;
			const rel = dir ? `${dir}/${entry.name}` : entry.name;

			if (entry.isDirectory()) {
				walk(rel);
			} else if (/\.(js|mjs|md|json|yml|yaml|html|css|txt)$/.test(entry.name)) {
				const source = readFileSync(join(root, rel), 'utf8');
				for (const [pattern, label] of patterns) {
					const match = pattern.exec(source);
					if (match) offenders.push(`${rel}: ${label} (${match[0].slice(0, 24)}…)`);
				}
			}
		}
	};

	walk('');

	assert.deepEqual(offenders, [], `credential-shaped strings found:\n  ${offenders.join('\n  ')}`);
});

test('the package has no dependencies', () => {
	// The security story rests on there being no third-party code to trust.
	assert.equal(pkg.dependencies, undefined, 'secure-term must stay dependency-free');
	assert.equal(pkg.peerDependencies, undefined);
});

test('the manifest carries the metadata npm needs to render a package page', () => {
	for (const field of ['name', 'version', 'description', 'license', 'repository', 'homepage']) {
		assert.ok(pkg[field], `package.json is missing "${field}"`);
	}
	assert.match(pkg.version, /^\d+\.\d+\.\d+$/);
	assert.ok(pkg.files.includes('README.md'), 'npm shows README.md on the package page');
	assert.ok(pkg.files.includes('LICENSE'));
});

test('the CLI reports the same version as the manifest', async () => {
	const source = read('cli/secure-term.js');
	const declared = source.match(/const VERSION = '([^']+)'/)?.[1];
	assert.equal(declared, pkg.version, 'secure-term --version would report the wrong version');
});
