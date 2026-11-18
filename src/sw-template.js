/* Rarvon service worker — generated at build time by the `bench-pwa` plugin in vite.config.ts.
 * The version, precache list and OCR cache version below are filled in at build time. */
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;
const SHELL_CACHE = `bench-shell-${VERSION}`;
// Hashed build assets are immutable, so one cache is shared across versions.
// Keeping older files lets a tab that was open during a deploy still load the
// tool chunks it references.
const ASSET_CACHE = 'bench-assets';
// OCR engine + language models (up to ~40 MB): cached on first use only.
const OCR_CACHE = `bench-ocr-__OCR_VERSION__`;
const MAX_ASSETS = 600;
// Servers often send `Vary: Accept-Encoding`; hashed files are identical either way.
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.addAll(['/', '/index.html', '/manifest.webmanifest']);
      const assets = await caches.open(ASSET_CACHE);
      const missing = [];
      for (const url of PRECACHE) if (!(await assets.match(url, MATCH))) missing.push(url);
      // Small batches: one failing file shouldn't abort the whole install.
      for (let i = 0; i < missing.length; i += 12) {
        await Promise.all(missing.slice(i, i + 12).map((u) => assets.add(u).catch(() => undefined)));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if ((key.startsWith('bench-shell-') && key !== SHELL_CACHE) || (key.startsWith('bench-ocr-') && key !== OCR_CACHE)) {
          await caches.delete(key);
        }
      }
      // Trim old hashed assets that are no longer part of the build once the cache grows large.
      const assets = await caches.open(ASSET_CACHE);
      const keys = await assets.keys();
      if (keys.length > MAX_ASSETS) {
        const current = new Set(PRECACHE.map((u) => new URL(u, self.location.origin).href));
        await Promise.all(keys.filter((r) => !current.has(r.url)).map((r) => assets.delete(r)));
      }
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, MATCH);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok && response.type === 'basic') cache.put(request, response.clone());
  return response;
}

async function networkFirstShell(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(SHELL_CACHE);
      cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('/index.html', MATCH)) || (await cache.match('/', MATCH)) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // AI models (/ai/) are large; the page caches them itself (src/lib/aiAssets.ts).
  if (url.pathname.startsWith('/ai/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
  } else if (url.pathname.startsWith('/ocr/')) {
    event.respondWith(cacheFirst(request, OCR_CACHE));
  } else if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
  } else if (url.pathname !== '/sw.js') {
    // Icons, manifest, license texts…: serve from cache when offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) caches.open(SHELL_CACHE).then((c) => c.put(request, response.clone()));
          return response;
        })
        .catch(async () => (await caches.match(request, MATCH)) || Response.error()),
    );
  }
});
