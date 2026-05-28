/* ═══════════════════════════════════════════════════════
   GigTrack — Service Worker
   Strategy: Cache-first for assets, network-first for HTML
   Versioned cache: bump CACHE_VERSION on every deploy
   ═══════════════════════════════════════════════════════ */

const CACHE_VERSION = '2026.05.28.1';  // keep in sync with APP_VERSION in gigtrack.html
const CACHE_NAME    = `gigtrack-${CACHE_VERSION}`;

// Assets to pre-cache on install
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  // Google Fonts (cached for offline use)
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&family=Space+Mono:wght@400;700&display=swap',
];

// ── INSTALL: pre-cache core assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting()) // activate immediately
  );
});

// ── ACTIVATE: delete old cache versions ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('gigtrack-') && key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim()) // take control immediately
  );
});

// ── FETCH: Network-first for HTML, cache-first for everything else ──
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests and browser extensions
  if (request.method !== 'GET') return;
  if (url.protocol === 'chrome-extension:') return;

  // HTML: network-first (always get latest version)
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request)) // offline fallback
    );
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          // Only cache successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          return response;
        });
      })
  );
});

// ── MESSAGE: force update from app ──
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
