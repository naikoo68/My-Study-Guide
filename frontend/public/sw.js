/* Simple, dependency-free service worker for the installable PWA.

   Update strategy (fixes "stale app after a deploy"):
   - HTML / navigations: NETWORK-FIRST with `cache: "no-store"`, so every load
     fetches the freshest index.html. Because Vite emits content-hashed asset
     filenames, fresh HTML always points at the new bundle — so a new release is
     picked up on the very next load instead of after a second reload. Falls back
     to the cached shell only when offline.
   - Static assets (content-hashed JS/CSS/images/fonts): CACHE-FIRST. Their
     filenames change every build, so cached copies are immutable and safe to
     serve instantly; a cache miss (i.e. a new build's files) goes to the network
     and is then cached for offline use.
   - Cross-origin requests (the API, any CDN) are NEVER intercepted, so live data
     always comes fresh from the network.

   Bump CACHE when you want every client to drop old cached assets. */
const CACHE = "msg-pwa-v5";
const SHELL = "/index.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  // Only handle our own origin — never touch the API or third-party CDNs.
  if (url.origin !== self.location.origin) return;

  // App navigations / HTML documents: always try the freshest copy from the
  // network (bypassing the HTTP cache) so a new deploy's asset references are
  // used immediately. Cache the shell for offline, and fall back to it when the
  // network is unavailable (HashRouter handles the in-app route).
  const isHTML = req.mode === "navigate" || req.destination === "document";
  if (isHTML) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req, { cache: "no-store" });
          const cache = await caches.open(CACHE);
          cache.put(SHELL, res.clone()).catch(() => {});
          return res;
        } catch {
          return (await caches.match(SHELL)) || new Response("", { status: 504, statusText: "Offline" });
        }
      })()
    );
    return;
  }

  // Content-hashed static assets: serve cached instantly (immutable), otherwise
  // fetch from the network and cache for next time / offline use.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && res.status === 200 && res.type === "basic") cache.put(req, res.clone());
        return res;
      } catch {
        return cached || new Response("", { status: 504, statusText: "Offline" });
      }
    })()
  );
});
