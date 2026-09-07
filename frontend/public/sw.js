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
const CACHE = "msg-pwa-v6";
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
        const cache = await caches.open(CACHE);
        // Kick off the fresh-network fetch and update the cached shell when it
        // lands (keeps deploys picked up promptly — asset filenames are hashed).
        const net = fetch(req, { cache: "no-store" })
          .then((res) => {
            cache.put(SHELL, res.clone()).catch(() => {});
            return res;
          })
          .catch(() => null);
        // BUT never let a slow/stalled network make the page hang: race it
        // against a short timeout. On iOS the SW navigation fetch could stall,
        // which made EVERY page wait ~30s. If the network doesn't answer within
        // ~3.5s, serve the cached shell instantly and let the fetch keep running
        // in the background to refresh the cache for next time.
        const timeout = new Promise((resolve) => setTimeout(() => resolve(undefined), 3500));
        const winner = await Promise.race([net, timeout]);
        if (winner) return winner; // network came back in time
        const cached = await cache.match(SHELL);
        if (cached) return cached; // fast path — no more 30s hangs
        // Nothing cached yet (very first load): wait for the network / offline.
        return (await net) || new Response("", { status: 504, statusText: "Offline" });
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
