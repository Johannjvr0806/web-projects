"use strict";

const CACHE_NAME = "pnp-store-visit-dashboard-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(APP_SHELL);
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("pnp-store-visit-dashboard-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response.ok && response.type === "basic") {
        event.waitUntil(caches.open(CACHE_NAME)
          .then((cache) => cache.put(request, response.clone()))
          .catch((error) => console.error("Could not cache the latest dashboard asset.", error)));
      }
      return response;
    } catch (error) {
      const cachedResponse = await caches.match(request, { ignoreSearch: true });
      if (cachedResponse) return cachedResponse;

      if (request.mode === "navigate") {
        const appShell = await caches.match("./index.html");
        if (appShell) return appShell;
      }

      throw error;
    }
  })());
});
