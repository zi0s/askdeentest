self.addEventListener('install', (event) => {
  console.log('Service Worker installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker activated');
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Basic pass-through fetch handler; you can add caching strategies here later.
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});