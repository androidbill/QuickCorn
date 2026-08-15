// The version comes from the ?v= that index.html registers this worker with,
// which in turn comes from version.js - the one place the version is written.
// A bump therefore gives this worker a new script URL, which is what makes the
// browser install it, and a new cache name, which clears the old shell.
const APP_VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE_NAME = `quickcorn-${APP_VERSION}`;
const APP_SHELL = [
  './',
  './index.html',
  './version.js',
  './manifest.webmanifest',
  './quickcorn-icon.svg',
  './quickcorn-icon-180.png',
  './quickcorn-icon-192.png',
  './quickcorn-icon-512.png',
  './iro.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await caches.match(fallbackUrl);
      if (fallback) return fallback;
    }
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirst(event.request, './index.html'));
    return;
  }

  const isAppShellAsset =
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/version.js') ||
    url.pathname.endsWith('/manifest.webmanifest') ||
    url.pathname.endsWith('/quickcorn-icon.svg') ||
    url.pathname.endsWith('/quickcorn-icon-180.png') ||
    url.pathname.endsWith('/quickcorn-icon-192.png') ||
    url.pathname.endsWith('/quickcorn-icon-512.png') ||
    url.pathname.endsWith('/iro.min.js');

  if (isAppShellAsset) {
    event.respondWith(networkFirst(event.request));
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    const response = await fetch(event.request);
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(event.request, response.clone());
    }
    return response;
  })());
});
