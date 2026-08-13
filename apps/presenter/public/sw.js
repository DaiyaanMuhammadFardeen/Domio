/**
 * apps/presenter — service worker (Phase 15 W13).
 *
 * Caches the presenter shell (HTML, JS, CSS) and the last 50 slide
 * thumbnails so a presenter can keep presenting when the network drops.
 *
 * Strategy:
 *   - App shell: cache-first with network refresh.
 *   - Slide thumbnails: cache-first; cap at 50 entries (LRU eviction).
 *   - GET /v1/presenter/sessions/*: stale-while-revalidate so the UI
 *     always paints last-known state then catches up.
 *   - Mutations (POST/PATCH): bypass cache — never replay writes.
 *
 * Conflict resolution: when the network returns, the server wins. The
 * runtime posts any locally buffered mutations (see runtime/offline-cache.ts)
 * through a best-effort queue; idempotency keys prevent duplicates.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `presenter-shell-${CACHE_VERSION}`;
const SLIDES_CACHE = `presenter-slides-${CACHE_VERSION}`;
const SESSIONS_CACHE = `presenter-sessions-${CACHE_VERSION}`;
const MAX_SLIDES = 50;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(['/', '/s/'])));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => ![SHELL_CACHE, SLIDES_CACHE, SESSIONS_CACHE].includes(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

function isThumbnail(url) {
  return (
    /\/thumbnails?\//.test(url.pathname) ||
    /slide[-_]?\d+\.(png|webp|jpg|jpeg)$/i.test(url.pathname)
  );
}

function isSessionGet(url) {
  return url.pathname.startsWith('/v1/presenter/sessions/') && url.pathname.split('/').length === 5;
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  const toDelete = keys.length - maxEntries;
  for (let i = 0; i < toDelete; i++) {
    await cache.delete(keys[i]);
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return; // bypass mutations
  const url = new URL(req.url);

  if (isThumbnail(url)) {
    event.respondWith(
      caches.open(SLIDES_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        const response = await (hit || network);
        // Trim the cache lazily.
        trimCache(SLIDES_CACHE, MAX_SLIDES);
        return response || new Response('', { status: 504 });
      }),
    );
    return;
  }

  if (isSessionGet(url)) {
    event.respondWith(
      caches.open(SESSIONS_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        return hit || (await network) || new Response('offline', { status: 503 });
      }),
    );
    return;
  }

  // App shell: cache-first.
  if (url.origin === location.origin && req.destination === 'document') {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).catch(() => caches.match('/'))),
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skipWaiting') self.skipWaiting();
  if (event.data?.type === 'clearCaches') {
    event.waitUntil(
      Promise.all([SHELL_CACHE, SLIDES_CACHE, SESSIONS_CACHE].map((c) => caches.delete(c))),
    );
  }
});
