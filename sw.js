/* ═══════════════════════════════════════════════════════
   GigTrack — Service Worker
   Relative paths throughout — works on any GitHub Pages
   subfolder (yourusername.github.io/reponame/)
   ═══════════════════════════════════════════════════════ */

// ⚠ Keep CACHE_VERSION in sync with APP_VERSION in gigtrack.html (index.html).
// Both must match on every deploy — bump one, bump the other.
const CACHE_VERSION = '2026.05.28.1';
const CACHE_NAME    = `gigtrack-${CACHE_VERSION}`;

// Derive BASE from the SW's own URL using lastIndexOf.
// self.location.pathname e.g. /gigtrack/sw.js → BASE = /gigtrack/
// Using lastIndexOf avoids corruption if 'sw.js' appears in folder names.
const BASE = self.location.pathname.slice(0, self.location.pathname.lastIndexOf('/') + 1);

const PRECACHE_URLS = [
  BASE + 'index.html',
  BASE + 'manifest.json',
  BASE + 'icon-192.png',
  BASE + 'icon-512.png',
];

// ── INSTALL ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        // Add each URL individually so one failure doesn't block the rest
        return Promise.allSettled(
          PRECACHE_URLS.map(url =>
            cache.add(url).catch(err =>
              console.warn('[SW] Failed to cache:', url, err)
            )
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVATE: delete old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key.startsWith('gigtrack-') && key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          })
      ))
      .then(() => self.clients.claim())
  );
});

// ── FETCH: network-first for HTML, cache-first for assets ──
self.addEventListener('fetch', event => {
  const { request } = event;

  // Skip non-GET and cross-origin requests (e.g. Google Fonts API calls)
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Skip chrome extensions
  if (url.protocol === 'chrome-extension:') return;

  // Same origin only for cache logic
  const isSameOrigin = url.origin === self.location.origin;

  if (!isSameOrigin) {
    // Cross-origin (fonts etc): try network, fall back to cache
    event.respondWith(
      fetch(request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(request, clone));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // HTML: network-first — always try to get latest
  if (request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request)
          .then(cached => cached || caches.match(BASE + 'index.html'))
        )
    );
    return;
  }

  // Everything else: cache-first
  event.respondWith(
    caches.match(request)
      .then(cached => {
        if (cached) return cached;
        return fetch(request).then(response => {
          if (!response || response.status !== 200) return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then(c => c.put(request, clone));
          return response;
        });
      })
  );
});

// ── MESSAGE ──
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});
