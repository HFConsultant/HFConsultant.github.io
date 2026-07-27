/**
 * Service worker registration.
 *
 * Lives in its own file rather than an inline <script> so the page can ship a
 * Content-Security-Policy without 'unsafe-inline'.
 *
 * The path is relative, not "/service-worker.js": that keeps the app working
 * when it is served from a project subpath (github.io/repo-name/) as well as
 * from a user site root.
 */
if ('serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('service-worker.js').catch((error) => {
			// Registration failing costs offline support and nothing else, so
			// there is no reason to interrupt the user over it.
			console.warn('Service worker registration failed:', error);
		});
	});
}
