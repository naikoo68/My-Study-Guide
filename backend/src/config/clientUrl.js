// Best base URL for links we email out (path-based routes, e.g. `<base>/route`).
// We PREFER the real site the request came
// from (Origin/Referer) when it's a trusted origin, then the configured
// CLIENT_URL env, then localhost. This makes emailed links (e.g. password
// reset) work correctly even when CLIENT_URL hasn't been set on the server —
// which otherwise produces an unreachable http://localhost:5173 link.
export function clientBaseFromReq(req) {
  const env = String(process.env.CLIENT_URL || "").replace(/\/$/, "");
  const originOf = (h) => {
    try { return h ? new URL(h).origin : ""; } catch { return ""; }
  };
  const cand = originOf(req?.headers?.origin) || originOf(req?.headers?.referer);
  // Only trust the request origin if it matches CLIENT_URL, a preview deployment,
  // or localhost — so a forged Origin can't redirect reset links elsewhere.
  const trusted = !!cand && (cand === env || /\.pages\.dev$/.test(cand) || /^https?:\/\/localhost(:\d+)?$/.test(cand));
  return (trusted ? cand : (env || "http://localhost:5173")).replace(/\/$/, "");
}
