'use strict';

const CACHE = 'folio-pdf-shell-v3';
const SHELL = ['./', './index.html', './manifest.json', './icon.svg', './icon-192.png', './icon-512.png'];
const SHARE_DB = 'folio-pdf-shares';
const SHARE_STORE = 'pending';

function openShareDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARE_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SHARE_STORE)) {
        request.result.createObjectStore(SHARE_STORE, {keyPath:'id', autoIncrement:true});
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open shared-file storage.'));
  });
}

async function receiveSharedFiles(request) {
  const destination = new URL('./?shareError=no-pdf', self.registration.scope);
  try {
    const form = await request.formData();
    const files = form.getAll('files').filter(value =>
      value instanceof File && (value.type === 'application/pdf' || /\.pdf$/i.test(value.name))
    );
    if (!files.length) return Response.redirect(destination.href, 303);

    const db = await openShareDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(SHARE_STORE, 'readwrite');
      tx.objectStore(SHARE_STORE).add({
        files: files.map(file => ({name:file.name, type:file.type, lastModified:file.lastModified, blob:file})),
        createdAt: Date.now()
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save the shared PDF.'));
      tx.onabort = () => reject(tx.error || new Error('Saving the shared PDF was interrupted.'));
    });
    db.close();
    return Response.redirect(new URL('./?shared=1', self.registration.scope).href, 303);
  } catch (error) {
    console.error('Could not receive a shared PDF.', error);
    return new Response('Could not receive the shared PDF. Reopen Folio and try sharing it again.', {status:500});
  }
}

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key.startsWith('folio-pdf-') && key !== CACHE).map(key => caches.delete(key))
    ))
  ]));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method === 'POST') {
    const shareUrl = new URL('./share-target/', self.registration.scope);
    if (new URL(request.url).pathname === shareUrl.pathname) event.respondWith(receiveSharedFiles(request));
    return;
  }
  if (request.method !== 'GET') return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached && request.mode !== 'navigate') return cached;

    try {
      const response = await fetch(request);
      if (response.ok || response.type === 'opaque') {
        event.waitUntil(caches.open(CACHE).then(cache => cache.put(request, response.clone())));
      }
      return response;
    } catch (error) {
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const shell = await caches.match('./index.html');
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
