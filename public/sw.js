// A26 Service Worker - PWA offline support
// Strategy: network-first for HTML/JS/CSS (so users always get latest),
//           cache-first for images/icons (they rarely change).
const CACHE_NAME = 'a26-v13-logo-unlimited';
const PRECACHE_ASSETS = [
  '/',
  '/login.html',
  '/index.html',
  '/dashboard.html',
  '/css/style.css',
  '/js/auth.js',
  '/js/digital-human.js',
  '/js/live-activity.js',
  '/js/game.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-256.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
  '/images/a26-logo.svg',
  '/images/a26-nav-logo.svg'
];

// Install - precache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => console.log('Precache failed:', url, err))
        )
      );
    })
  );
  self.skipWaiting();
});

// Activate - clean ALL old caches (forces users onto the new version)
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Skip non-GET requests
  if (req.method !== 'GET') return;

  // API calls - always network
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(req).catch(() => new Response(JSON.stringify({ error: 'Offline' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      }))
    );
    return;
  }

  // For navigations (HTML pages) and JS/CSS — network-first so users always
  // get the latest deployment. Falls back to cache if offline.
  const isNavigation = req.mode === 'navigate';
  const isHTML = url.pathname.endsWith('.html') || url.pathname === '/';
  const isJS = url.pathname.endsWith('.js');
  const isCSS = url.pathname.endsWith('.css');

  if (isNavigation || isHTML || isJS || isCSS) {
    event.respondWith(
      fetch(req).then((res) => {
        // Cache the fresh copy
        if (res && res.status === 200 && (res.type === 'basic' || res.type === 'cors')) {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      }).catch(() => caches.match(req).then((cached) => cached || new Response('Offline', { status: 503 })))
    );
    return;
  }

  // Images, icons, fonts — cache-first (rarely change, faster)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.status === 200 && res.type === 'basic') {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
