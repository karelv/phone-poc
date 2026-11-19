// Service worker of the HTTPS console (GitHub Pages, localhost): makes it installable ("Install app")
// and usable offline. Not used by the board page (plain http, written by the board loader).
// Same-origin GETs: network first, so an online start always gets the latest console, falling back
// to the cache after NET_TIMEOUT_MS or on error. Other origins go straight to the network.
const VERSION = 'a06a64ed';  // replaced with the commit SHA by .gitlab-ci.yml
const CACHE = 'phonepoc-' + VERSION;
const NET_TIMEOUT_MS = 4000;
const SHELL = [
  './',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
];
// Optional, so the worker still installs where they are missing (python3 serve.py): the Android
// serial polyfill and the published firmware (CI build, cached for offline flashing).
const OPTIONAL = ['vendor/web-serial-polyfill.js', 'firmware.json', 'firmware.bin', 'updater.bin'];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE);
    await c.addAll(SHELL);
    // Each with a time limit: a missing file must not hold up the install (seen with python3 serve.py).
    await Promise.allSettled(OPTIONAL.map((u) => Promise.race([
      c.add(new Request(u, { cache: 'no-store' })),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS)),
    ])));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('phonepoc-') && k !== CACHE) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const key = req.mode === 'navigate' ? './' : req;
  try {
    const res = await Promise.race([
      fetch(req),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NET_TIMEOUT_MS)),
    ]);
    if (res.ok) cache.put(key, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(key, { ignoreSearch: true });
    if (hit) return hit;
    throw err;
  }
}
