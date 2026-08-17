/**
 * Offline support only. This worker does not drive updates - index.html polls
 * for those - so there is no skipWaiting/waiting dance to get wrong.
 *
 * The version comes from the ?v= that index.html registers this file with, so
 * there is no version literal here to fall out of step with the app.
 */
const APP_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `quickcorn2-${APP_VERSION}`;

self.addEventListener('install', () => {
  // Nothing is precached. The old app kept a hand-written list of shell files
  // that had to be updated whenever a file was added, and forgetting to add one
  // was silent. The fetch handler below caches whatever the app actually asks
  // for, which cannot fall out of date.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

/**
 * Network first for everything same-origin, falling back to cache when offline.
 *
 * A cache-first branch is what pinned a stale file on a real device in the old
 * app, and because the app is now several modules rather than one file, a stale
 * module paired with a fresh page would be far worse. Freshness while online is
 * worth more here than shaving a few milliseconds.
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request, { cache: 'no-store' });
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    } catch (error) {
      const cached = await cache.match(request) || await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await cache.match('./index.html') || await caches.match('./index.html');
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
