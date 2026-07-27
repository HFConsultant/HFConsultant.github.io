/**
 * Secure Terminal — service worker.
 *
 * Strategy: cache-first for the app shell, because the shell is the whole app.
 * There is no API and no dynamic content, so a cached response is never stale
 * in a way that matters until the version below changes.
 *
 * Bump CACHE_NAME on every release. Old caches are deleted on activate.
 */

const CACHE_NAME = 'secure-terminal-v3';

/**
 * Relative paths, so the worker also works when the app is served from a
 * project subpath rather than a domain root.
 */
const APP_SHELL = [
	'./',
	'./index.html',
	'./css/style.css',
	'./js/terminal.js',
	'./js/crypto.js',
	'./js/envfile.js',
	'./js/register-sw.js',
	'./manifest.json',
	'./icons/icon-192x192.png',
	'./icons/icon-512x512.png',
	'./icons/icon-maskable-512x512.png'
];

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE_NAME);

			// Deliberately not cache.addAll(): that is atomic, so a single 404
			// rejects the whole install and the worker never activates. The
			// previous version listed a js/main.js that did not exist, which is
			// why offline support had never actually worked. Cache each entry
			// independently and report anything that fails.
			const results = await Promise.allSettled(
				APP_SHELL.map(async (path) => {
					const response = await fetch(new Request(path, { cache: 'reload' }));
					if (!response.ok) throw new Error(`${response.status} for ${path}`);
					await cache.put(path, response);
				})
			);

			const failures = results
				.map((result, i) => (result.status === 'rejected' ? APP_SHELL[i] : null))
				.filter(Boolean);

			if (failures.length) {
				console.warn('[sw] could not precache:', failures);
			}
		})()
	);

	// Take over as soon as the new worker is ready.
	self.skipWaiting();
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const names = await caches.keys();
			await Promise.all(
				names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name))
			);
			await self.clients.claim();
		})()
	);
});

self.addEventListener('fetch', (event) => {
	const { request } = event;

	// Only GETs are cacheable, and the app never touches another origin.
	if (request.method !== 'GET') return;
	if (new URL(request.url).origin !== self.location.origin) return;

	event.respondWith(
		(async () => {
			const cached = await caches.match(request, { ignoreSearch: true });
			if (cached) return cached;

			try {
				return await fetch(request);
			} catch (error) {
				// Offline and uncached. For a navigation, fall back to the shell
				// so the app still opens instead of showing the browser's
				// dinosaur; for anything else, let the failure through.
				if (request.mode === 'navigate') {
					const shell = await caches.match('./index.html');
					if (shell) return shell;
				}
				throw error;
			}
		})()
	);
});
