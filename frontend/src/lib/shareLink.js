// Build the shareable PUBLIC link for a quiz/test token.
//
// The link points at "/s/:token" ON THE SITE'S OWN DOMAIN (e.g.
// https://www.mystudyguide.in/s/<token>). A host redirect rule proxies that
// path to the backend, which returns server-rendered Open Graph HTML so social
// apps like WhatsApp/Facebook — which never run JavaScript — get a rich preview
// (subject, topic, the quiz/test name and its first question). The backend then
// redirects a human visitor on to the real in-app player, staying on this same
// domain (so it also works for an institute's custom domain).
//
// On localhost dev (no host rewrite) we fall back to the in-app hash route so
// the link still opens the player directly.
export function publicShareUrl(token, kind) {
  try {
    const host = window.location.hostname || "";
    const isLocal = /^(localhost|127\.|0\.0\.0\.0)/.test(host);
    if (!isLocal) return `${window.location.origin}/s/${token}`;
  } catch { /* non-browser — fall through to hash route */ }
  const k = kind === "quiz" || kind === "My Quiz" ? "quiz" : "test";
  const base = (typeof window !== "undefined" && window.location) ? window.location.origin : "";
  return `${base}/public/${k}/${token}`;
}
