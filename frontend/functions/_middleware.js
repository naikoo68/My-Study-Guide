// Cloudflare Pages middleware — SPA deep-link fallback (HTTP 200).
//
// WHY THIS EXISTS
// ---------------
// This is a client-rendered SPA: only real files under dist/ exist as static
// assets. `scripts/generate-route-stubs.mjs` pre-renders a 200 stub for the
// PUBLIC/indexable routes it knows about (from a fixed list + the sitemap), but
// deep, data-driven routes — e.g. /public-quizzes/stream/<id>, and the quiz
// player /quiz/<subject>/<topic>/<session>/<quiz> — are NOT enumerated, so the
// host finds no file and falls through to `public/404.html`, which returns a
// **404 status**. A real browser recovers via the JS bounce in 404.html, but a
// crawler (Googlebot / the AdSense reviewer + Ad Settings Preview) only sees the
// 404 and reports "page not found" — so those pages never load in the preview
// and are not indexed.
//
// The default Cloudflare Pages SPA fallback (`/* /index.html 200` in
// `_redirects`) does not help here: when a `404.html` is present it is served
// (with a 404 status) for unmatched paths, which wins over the rewrite.
//
// THE FIX
// -------
// Run before every request. Let the normal pipeline resolve first (static
// assets, `_redirects`, then `404.html`). If the result is a 404 for a page
// route, serve the app shell (index.html) with a 200 instead, so React Router
// can render the deep route.
//
// Deciding "is this a page route?" by the URL SHAPE (no file extension) rather
// than the Accept header is deliberate: Google's AdSense preview fetcher and
// many crawlers request with `Accept: */*` (or no Accept), and some pre-check
// the URL with a HEAD request. An Accept-based check wrongly 404s all of those.
// Requests for real files (a stray .js/.css/.png) keep their 404, so a broken
// asset is never masked as the HTML shell (which would be the wrong MIME type).

// PAGES.DEV → CANONICAL DOMAIN REDIRECT
// -------------------------------------
// Cloudflare Pages projects always keep their default `*.pages.dev` hostname
// reachable — you can't disable it from the dashboard — so social-network
// crawlers (Facebook, Twitter, LinkedIn) can end up caching the pages.dev URL
// as the canonical origin, and a shared link ends up displaying
// "my-study-guide.pages.dev" instead of the real "mystudyguide.in" domain.
// Redirect every hit to the pages.dev hostname to the canonical one before the
// SPA shell is served, so the real domain is the ONLY one that ever renders a
// page — and the ONLY one crawlers can index.
const CANONICAL_HOST = "www.mystudyguide.in";
const isPagesDevHost = (host) => /\.pages\.dev$/i.test(String(host || ""));

export const onRequest = async (context) => {
  const { request, next, env } = context;

  // Send anyone (or any crawler) hitting the pages.dev host to the canonical
  // domain with a 301 so browsers + link-preview scrapers update their cache.
  // Path and query are preserved so deep links still work after the bounce.
  const requestUrl = new URL(request.url);
  if (isPagesDevHost(requestUrl.hostname)) {
    requestUrl.hostname = CANONICAL_HOST;
    requestUrl.protocol = "https:";
    requestUrl.port = "";
    return Response.redirect(requestUrl.toString(), 301);
  }

  const response = await next();
  if (response.status !== 404) return response;

  // Only page loads (GET/HEAD) are candidates — never POST/PUT/etc.
  if (request.method !== "GET" && request.method !== "HEAD") return response;

  // Treat the path as a static asset (keep the 404) when its last segment has a
  // file extension, e.g. /assets/app.js, /favicon.ico, /sitemap.xml. Everything
  // else is a client-side route (/choose/quiz, /public-quizzes/stream/<id>, …).
  const url = new URL(request.url);
  const lastSegment = url.pathname.split("/").pop() || "";
  const looksLikeFile = lastSegment.includes(".");
  if (looksLikeFile) return response;

  // Serve the SPA shell with a 200 so client-side routing takes over. env.ASSETS
  // hits the static-asset server directly (it does NOT re-enter this middleware),
  // so there is no request loop. HEAD requests get the same status/headers but
  // no body, per the HTTP spec.
  const origin = url.origin;
  const shell = await env.ASSETS.fetch(new URL("/index.html", origin));
  const body = request.method === "HEAD" ? null : shell.body;

  return new Response(body, {
    status: 200,
    statusText: "OK",
    headers: shell.headers,
  });
};
