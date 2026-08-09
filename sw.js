const CACHE_NAME = 'broker-app-v4';
const APP_SHELL = ['./','./index.html','./data/questions.js','./data/flashcards.js','./data/crash35_data.js','./manifest.json'];
self.addEventListener('install', event => { event.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(APP_SHELL)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', event => { event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== location.origin) return;
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(resp => {
    const copy = resp.clone(); caches.open(CACHE_NAME).then(c=>c.put(event.request, copy)); return resp;
  }).catch(()=>caches.match('./index.html'))));
});
