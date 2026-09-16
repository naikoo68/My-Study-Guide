// Temporary diagnostic endpoint (mirror of the repo-root one). If /ping returns
// this marker, the Cloudflare Pages project compiles functions from
// frontend/functions. Safe to delete once SPA routing is verified.
export const onRequest = () =>
  new Response("pong-frontend", {
    status: 200,
    headers: { "content-type": "text/plain" },
  });
