const VERSION = 'omnimart-v21';
const SHELL = ['/', '/manifest.json', '/icon.svg', '/icon-192.png', '/icon-512.png'];

// Libraries loaded with crossorigin="anonymous" must be cached as real CORS responses, never opaque ones
const CORS_LIBS = [
  'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
  'https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js'
];
const ALLOWED_HOSTS = ['cdnjs.cloudflare.com', 'unpkg.com', 'cdn.tailwindcss.com', 'cdn.jsdelivr.net', 'fastly.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
const NOCORS_LIBS = [
  'https://cdn.tailwindcss.com/',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then(async (c) => {
      await c.addAll(SHELL);
      // Best-effort: cache CDN libraries so the first offline launch works too
      await Promise.all([
        ...CORS_LIBS.map((u) => fetch(new Request(u, { mode: 'cors', credentials: 'omit' })).then((r) => r.ok && c.put(new Request(u, { mode: 'cors' }), r)).catch(() => {})),
        ...NOCORS_LIBS.map((u) => fetch(u, { mode: 'no-cors' }).then((r) => c.put(u, r)).catch(() => {}))
      ]);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname === '/sw.js') return;
  // Security: only handle our own files and the known library hosts; never cache anything else
  if (url.origin !== self.location.origin && !ALLOWED_HOSTS.includes(url.hostname)) return;

  // Page navigations: network first, but fall back to the cached app shell after 3s so a weak
  // connection never leaves the app hanging on launch. The cache still refreshes in the background.
  if (req.mode === 'navigate') {
    const net = fetch(req).then((res) => {
      if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put('/', copy)); }
      return res;
    });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(
      caches.match('/').then((cached) => {
        if (!cached) return net;
        const timeout = new Promise((r) => setTimeout(() => r(cached), 3000));
        return Promise.race([net.catch(() => cached), timeout]);
      })
    );
    return;
  }

  // Everything else (own assets + CDN libs/fonts): cache first, refresh in background
  e.respondWith(
    caches.match(req).then((cached) => {
      // an opaque cached copy can't satisfy a CORS-mode request (e.g. <script crossorigin>)
      const hit = cached && !(cached.type === 'opaque' && req.mode === 'cors') ? cached : null;
      const net = fetch(req).then((res) => {
        if (res && (res.ok || (res.type === 'opaque' && req.mode !== 'cors'))) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
