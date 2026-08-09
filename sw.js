const CACHE_NAME = 'broker-study-app-v2';
const ASSETS = [
  './',
  './app.html',
  './index.html',
  './manifest.json',
  './data/crash35_data.js',
  './data/flashcards.js',
  './data/questions.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});
