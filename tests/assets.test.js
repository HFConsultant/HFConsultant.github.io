/**
 * Asset integrity tests.
 *
 * These exist because of a specific bug: the service worker's precache list
 * named a js/main.js that does not exist in this repository, cache.addAll()
 * rejected atomically, the worker never installed, and offline support was
 * silently broken for the entire life of the project.
 *
 * Nothing about that failure was visible in the UI, so it is guarded here: any
 * reference to a file that is not on disk fails the build.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => readFileSync(join(root, file), 'utf8');
const exists = (path) => existsSync(join(root, path.replace(/^\.?\//, '') || 'index.html'));

test('every file the service worker precaches exists', () => {
	const source = read('service-worker.js');
	const block = source.match(/const APP_SHELL = \[([\s\S]*?)\];/);
	assert.ok(block, 'could not find APP_SHELL in service-worker.js');

	const paths = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
	assert.ok(paths.length > 0, 'APP_SHELL is empty');

	for (const path of paths) {
		assert.ok(exists(path), `service worker precaches a missing file: ${path}`);
	}
});

test('the service worker precaches every script, style and icon the page uses', () => {
	const source = read('service-worker.js');

	for (const path of appDependencies()) {
		assert.ok(
			source.includes(`'./${path}'`),
			`${path} is needed by the app but not precached, so it is unavailable offline`
		);
	}
});

/**
 * Every same-origin file the page needs, following ES module imports.
 *
 * Walking the import graph rather than listing modules by hand: a module
 * reached only through an import is invisible in the HTML, and forgetting to
 * precache one breaks the app offline exactly as thoroughly as the original
 * js/main.js bug did. Hard-coding the list here would reproduce that bug in
 * the test meant to catch it.
 */
function appDependencies() {
	const html = read('index.html');
	const found = new Set(
		[
			...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]),
			...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1])
		].filter((path) => !path.startsWith('http'))
	);

	const queue = [...found].filter((path) => path.endsWith('.js'));

	while (queue.length) {
		const file = queue.shift();
		if (!exists(file)) continue;

		const imports = [...read(file).matchAll(/(?:^|\n)\s*import\s[^'"]*['"]([^'"]+)['"]/g)]
			.map((m) => m[1])
			.filter((specifier) => specifier.startsWith('.'));

		for (const specifier of imports) {
			// Resolve relative to the importing file's directory.
			const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : '';
			const resolved = join(dir, specifier).replace(/^\.\//, '');
			if (!found.has(resolved)) {
				found.add(resolved);
				queue.push(resolved);
			}
		}
	}

	return [...found];
}

test('every file index.html references exists', () => {
	const html = read('index.html');
	const paths = [
		...[...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]),
		...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((m) => m[1])
	].filter((path) => !path.startsWith('http'));

	for (const path of paths) {
		assert.ok(exists(path), `index.html references a missing file: ${path}`);
	}
});

test('every icon the manifest declares exists', () => {
	const manifest = JSON.parse(read('manifest.json'));
	for (const icon of manifest.icons) {
		assert.ok(exists(icon.src), `manifest declares a missing icon: ${icon.src}`);
	}
});

test('index.html loads no third-party resources', () => {
	// A CDN dependency without SRI can be changed under us, and this app has no
	// reason to talk to anyone.
	const html = read('index.html');
	const external = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1]);
	assert.deepEqual(external, [], `index.html loads external resources: ${external.join(', ')}`);
});

test('the Content Security Policy has no unsafe directives', () => {
	const html = read('index.html');
	const csp = html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/s);
	assert.ok(csp, 'index.html has no Content-Security-Policy');

	assert.doesNotMatch(csp[1], /unsafe-inline/, "CSP allows 'unsafe-inline'");
	assert.doesNotMatch(csp[1], /unsafe-eval/, "CSP allows 'unsafe-eval'");
	assert.match(csp[1], /connect-src 'none'/, "CSP should forbid network requests");
});

test('no inline script or style survives in index.html', () => {
	// Either would force 'unsafe-inline' back into the CSP.
	const html = read('index.html');
	assert.doesNotMatch(html, /<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/,
		'index.html contains an inline <script>');
	assert.doesNotMatch(html, /<style[^>]*>/, 'index.html contains an inline <style>');
	assert.doesNotMatch(html, /\sstyle="/, 'index.html contains a style attribute');
});

test('the viewport does not block zooming', () => {
	// user-scalable=no and maximum-scale=1 both fail WCAG 1.4.4.
	const html = read('index.html');
	const viewport = html.match(/name="viewport"\s+content="([^"]+)"/);
	assert.ok(viewport, 'index.html has no viewport meta tag');
	assert.doesNotMatch(viewport[1], /user-scalable\s*=\s*no/);
	assert.doesNotMatch(viewport[1], /maximum-scale/);
});

test('the README links to the live deployment', () => {
	assert.match(read('README.md'), /https:\/\/hfconsultant\.github\.io/);
});
