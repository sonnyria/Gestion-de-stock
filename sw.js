const CACHE_NAME = 'stock-ai-v3';
const urlsToCache = [
  './',
  './index.html',
  './index.tsx',
  './App.tsx',
  './types.ts',
  './manifest.json',
  './services/geminiService.ts',
  './components/Scanner.tsx',
  './components/ProductForm.tsx',
  './components/StockControl.tsx'
];

// Domaines externes à mettre en cache (CDNs utilisés dans index.html)
const CDNs = [
  'cdn.tailwindcss.com',
  'aistudiocdn.com',
  'img.icons8.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'unpkg.com' // Pour Babel Standalone
];

self.addEventListener('install', (event) => {
  // Force l'installation immédiate
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Mise en cache des fichiers locaux...');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. Ignorer les appels API (Gemini, Google APIs) pour qu'ils passent toujours par le réseau
  // Sauf s'il s'agit des scripts/fonts (aistudiocdn, fonts, etc)
  if (url.pathname.includes('googleapis') && !url.hostname.includes('fonts')) {
    return;
  }

  // 2. Stratégie "Stale-while-revalidate" pour les fichiers statiques et CDNs
  // On sert le cache tout de suite, et on met à jour en arrière-plan
  if (urlsToCache.includes(url.pathname) || CDNs.some(domain => url.hostname.includes(domain))) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          // Mettre à jour le cache si la réponse est valide
          if(networkResponse.ok) {
             cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        }).catch((err) => {
           // En cas d'erreur réseau (hors ligne), on ne fait rien
        });

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. Fallback par défaut : Cache First
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        return response || fetch(event.request);
      })
  );
});

self.addEventListener('activate', (event) => {
  // Nettoyer les anciens caches
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});