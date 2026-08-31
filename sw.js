const CACHE_NAME = 'konten-analyzer-v4';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap',
];

// Install — cache static assets
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch strategy:
// - API calls (/api/*) → network only, never cache
// - Google Fonts → cache first
// - Everything else → network first, fallback to cache
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // Only handle same-scheme http(s) GET requests. Browsers can fire internal
  // 'fetch' events for non-http schemes (e.g. blob:, filesystem:) — for
  // example when reading a local file via file.text()/Blob.text() during a
  // CSV import. A service worker must not try to respondWith() those; doing
  // so breaks the underlying read with a NotReadableError. Let anything else
  // fall through to normal browser handling untouched.
  if (!url.protocol.startsWith('http') || e.request.method !== 'GET') {
    return;
  }

  // API — always network
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Google Fonts — cache first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
          return res;
        })
      )
    );
    return;
  }

  // App shell — network first, fallback cache
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('/index.html')))
  );
});
