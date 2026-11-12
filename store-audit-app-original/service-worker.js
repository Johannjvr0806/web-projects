"use strict";

const CACHE_NAME = "fieldnote-store-audit-v1";
const APP_FILES = [
    "./",
    "./index.html",
    "./styles.css",
    "./app.js",
    "./manifest.json",
    "./icon-192.png",
    "./icon-512.png"
];
const LIBRARY_URLS = [
    "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js",
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"
];

self.addEventListener("install", (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(APP_FILES);
        await Promise.all(LIBRARY_URLS.map(async (url) => {
            try {
                const response = await fetch(url, { mode: "cors" });
                if (response.ok && response.type !== "opaque") {
                    await cache.put(url, response);
                }
            } catch (error) {
                console.warn("Could not cache an optional report library for offline use.", error);
            }
        }));
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", (event) => {
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        await Promise.all(cacheNames
            .filter((name) => name.startsWith("fieldnote-store-audit-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name)));
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", (event) => {
    if (event.request.method !== "GET") {
        return;
    }

    const requestUrl = new URL(event.request.url);
    const isAuditFile = requestUrl.origin === self.location.origin;
    const isReportLibrary = LIBRARY_URLS.includes(requestUrl.href);
    if (!isAuditFile && !isReportLibrary) {
        return;
    }

    event.respondWith((async () => {
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(event.request, { ignoreSearch: isReportLibrary });
        if (cachedResponse) {
            return cachedResponse;
        }

        try {
            const response = await fetch(event.request);
            if (response.ok && response.type !== "opaque") {
                await cache.put(event.request, response.clone());
            }
            return response;
        } catch (error) {
            if (event.request.mode === "navigate") {
                const offlinePage = await cache.match("./index.html");
                if (offlinePage) {
                    return offlinePage;
                }
            }
            throw error;
        }
    })());
});
