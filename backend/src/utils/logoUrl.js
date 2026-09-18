// The site logo can be stored either as a hosted URL or as a base64 data URI
// (the admin panel used to save uploads inline). An inline logo can be HUNDREDS
// of kilobytes, and it was shipped inside the /api/settings JSON that the
// frontend fetches on EVERY page load — a big, repeated download that made the
// site slow to load on mobile.
//
// This helper rewrites an inline (data:) logo into a URL that points at the
// cacheable /api/settings/logo endpoint, so the heavy bytes leave the settings
// payload and are fetched once and then served from the browser/CDN cache. A
// logo that is already a normal http(s) URL is returned unchanged.

const DATA_URI_RE = /^data:/i;

// Build the public logo value for the settings response.
//   logoRaw   : the stored logoUrl (data URI, http(s) URL, or "")
//   origin    : the API origin, e.g. "https://api.mystudyguide.in"
//   version   : cache-busting token (e.g. settings.updatedAt ms) so the URL
//               changes when the logo changes, invalidating stale caches
//   tenantId  : optional tenant id so the endpoint serves the right site's logo
//               for <img> requests (which don't carry the tenant host header)
export function publicLogoUrl(logoRaw, { origin = "", version = 1, tenantId = "" } = {}) {
  const raw = String(logoRaw || "").trim();
  if (!raw) return "";
  if (!DATA_URI_RE.test(raw)) return raw; // already a URL — leave it
  const base = String(origin || "").replace(/\/+$/, "");
  const q = `v=${encodeURIComponent(version)}${tenantId ? `&t=${encodeURIComponent(tenantId)}` : ""}`;
  return `${base}/api/settings/logo?${q}`;
}

// Derive the API origin (scheme + host) from the incoming request, honouring the
// proxy headers set by Nginx/Cloudflare in front of the app so we build https://
// URLs (not http://) and the correct host.
export function apiOriginFromRequest(req) {
  const proto = String(req?.headers?.["x-forwarded-proto"] || req?.protocol || "https")
    .split(",")[0]
    .trim();
  const host = req?.headers?.["x-forwarded-host"] || (req?.get && req.get("host")) || "";
  return host ? `${proto}://${host}` : "";
}
