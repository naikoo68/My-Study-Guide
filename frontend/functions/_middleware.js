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
// assets, `_redirects`, then `404.html`). If the result is a 404 for a genuine
// PAGE navigation (a GET that accepts text/html), serve the app shell
// (index.html) with a 200 instead, so React Router can render the deep route.
// Missing non-HTML assets (a stray .js/.css/image) keep their real 404.
export const onRequest = async (context) => {
  const { request, next, env } = context;

  const response = await next();
  if (response.status !== 404) return response;

  // Only rewrite real page loads, never missing static assets — otherwise a
  // broken script/style would be masked as the HTML shell (wrong MIME type).
  const accept = request.headers.get("Accept") || "";
  const isHtmlNavigation = request.method === "GET" && accept.includes("text/html");
  if (!isHtmlNavigation) return response;

  // Serve the SPA shell with a 200 so client-side routing takes over. env.ASSETS
  // hits the static-asset server directly (it does NOT re-enter this middleware),
  // so there is no request loop.
  const origin = new URL(request.url).origin;
  const shell = await env.ASSETS.fetch(new URL("/index.html", origin));

  return new Response(shell.body, {
    status: 200,
    statusText: "OK",
    headers: shell.headers,
  });
};
