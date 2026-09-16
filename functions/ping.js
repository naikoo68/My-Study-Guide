// Temporary diagnostic endpoint to confirm which `functions/` directory the
// Cloudflare Pages project actually compiles (repo-root vs frontend/). A GET to
// /ping returns this marker only if THIS repo-root functions directory is the
// active one. Safe to delete once SPA routing is verified.
export const onRequest = () =>
  new Response("pong-root", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
