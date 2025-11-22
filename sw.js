
const CACHE_NAME = 'stock-ai-v4-singlefile';
const urlsToCache = [
  './',
  './index.html',
  './index.tsx',
  './manifest.json'
];

// Domaines externes à mettre en cache (CDNs)
const CDNs = [
  'cdn.tailwindcss.com',
  'aistudiocdn.com',
  'img.icons8.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
        console.log('Caching critical files');
        return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Ignorer les API Google (sauf Fonts)
  if (url.pathname.includes('googleapis') && !url.hostname.includes('fonts')) {
    return;
  }

  // Cache First pour les fichiers statiques
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request).then((networkResponse) => {
        // Mettre en cache les CDNs dynamiquement
        if (CDNs.some(domain => url.hostname.includes(domain))) {
           const responseClone = networkResponse.clone();
           caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        }
        return networkResponse;
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => Promise.all(
      cacheNames.map((cacheName) => {
        if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
      })
    )).then(() => self.clients.claim())
  );
});
