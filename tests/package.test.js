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
import { readFileSync, existsSync, statSync } from 'node:fs';
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
