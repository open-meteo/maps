import { version } from '$app/env';
import { immutable, prerendered } from '$app/manifest';
import { self } from '$app/service-worker';

// The file-reader keeps downloaded .om data in its own Cache Storage entry, so
// the cleanup on activate only touches caches carrying this prefix.
const CACHE_PREFIX = 'app-shell-';
const CACHE = `${CACHE_PREFIX}${version}`;

// The Vite output and the prerendered page are all the app needs to start.
// `static` is left out: it holds over 100 MB of grid geometry that is loaded on
// demand, and Cloudflare's `_headers`, which is never served and would fail the
// whole precache. Manifest paths are relative to the base path, which is the
// worker's scope; the typed `resolve` from `$app/paths` only accepts routes.
const ASSETS = [...immutable, ...prerendered].map(
	({ path }) => new URL(path, self.registration.scope).pathname
);

// No skipWaiting: a new worker only takes over once every tab of the previous
// build is closed, so an open tab keeps the precached chunks it may still
// lazy-load after a deploy has removed them from the server.
self.addEventListener('install', (event) => {
	event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
	async function deleteOldCaches() {
		for (const key of await caches.keys()) {
			if (key.startsWith(CACHE_PREFIX) && key !== CACHE) await caches.delete(key);
		}
	}

	event.waitUntil(deleteOldCaches());
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Weather data, map tiles and geocoding come from other origins and are
	// cached by the file-reader and the HTTP cache, so they bypass the worker.
	if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

	if (event.request.mode === 'navigate') {
		// Pages come from the network so a deploy is picked up on the next load,
		// the precached copy only serves offline starts. The query string holds map
		// state and does not change the prerendered HTML.
		event.respondWith(
			fetch(event.request).catch(async (error) => {
				const cached = await caches.match(url.pathname, { cacheName: CACHE });
				if (cached) return cached;
				throw error;
			})
		);
		return;
	}

	if (ASSETS.includes(url.pathname)) {
		// Vite output is content-hashed, so a cached copy never goes stale.
		event.respondWith(
			caches
				.match(url.pathname, { cacheName: CACHE })
				.then((cached) => cached ?? fetch(event.request))
		);
	}
});
