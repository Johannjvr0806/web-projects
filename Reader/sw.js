const CACHE_NAME = 'cozy-reader-v7';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './sw.js',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.1.5/jszip.min.js',
  'https://cdn.jsdelivr.net/npm/epubjs@0.3.93/dist/epub.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/localforage/1.10.0/localforage.min.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(ASSETS);
    await self.skipWaiting();
  })());
});


self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((key) => key.startsWith('cozy-reader-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') {
        event.waitUntil(
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(request, response.clone()))
            .catch((error) => console.error('Failed to cache resource:', request.url, error))
        );
      }
      return response;
    } catch (error) {
      const requestUrl = new URL(request.url);
      const isStaticAppAsset = requestUrl.origin === self.location.origin
        && /\.(?:css|js|json|html)$/.test(requestUrl.pathname);
      const cachedResponse = await caches.match(request)
        || (isStaticAppAsset ? await caches.match(request, { ignoreSearch: true }) : undefined);
      if (cachedResponse) return cachedResponse;

      if (request.mode === 'navigate') {
        const appShell = await caches.match('./index.html');
        if (appShell) return appShell;
      }

      throw error;
    }
  })());
});