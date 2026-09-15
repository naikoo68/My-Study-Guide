import { useEffect } from "react";

// Per-page SEO. Path-based routing means each route is a real, crawlable URL, so
// every public page gets its own <title>, description, canonical URL and
// OG/Twitter tags. This is the SINGLE SEO system for the app — reuse it, don't
// add a competing one.
//
// Usage:  useSeo("Online Quizzes & Mock Tests", "Practise …");
//   - title       → shown as "<title> | My Study Guide" (omit on the homepage).
//   - description → meta description + OG/Twitter description.
//   - canonical   → optional absolute URL; defaults to the current clean URL
//                   (origin + pathname), which is what search engines should index.

const SITE = "My Study Guide";
const DEFAULT_TITLE = "My Study Guide — Prepare Smart, Achieve More";
const DEFAULT_DESC =
  "My Study Guide offers subject-wise quizzes, mock tests, test series, instant results, performance analytics and study resources for competitive exam preparation.";

function upsertMeta(attr, key, content) {
  if (typeof document === "undefined") return;
  let el = document.head.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertCanonical(href) {
  if (typeof document === "undefined" || !href) return;
  let el = document.head.querySelector('link[rel="canonical"]');
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", "canonical");
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

// Inject (or clear) a single page-level Schema.org JSON-LD block. Pass a plain
// object (e.g. a BreadcrumbList) or null to remove it. Kept in the ONE SEO
// system so we don't sprinkle competing <script> tags around.
function upsertJsonLd(obj) {
  if (typeof document === "undefined") return;
  let el = document.getElementById("seo-jsonld");
  if (!obj) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement("script");
    el.type = "application/ld+json";
    el.id = "seo-jsonld";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(obj);
}

// options.noindex → emit <meta name="robots" content="noindex, nofollow"> so the
// page is kept out of search results (defense-in-depth on top of the HTTP-level
// X-Robots-Tag header in public/_headers). We ALWAYS set the robots meta — to
// "index, follow" by default — so navigating from a noindex page (e.g. the admin
// login) to a normal page flips it back and a stale "noindex" can never leak.
export function useSeo(title, description, canonical, jsonLd, options = {}) {
  const noindex = !!options.noindex;
  useEffect(() => {
    const fullTitle = title ? `${title} | ${SITE}` : DEFAULT_TITLE;
    const desc = description || DEFAULT_DESC;
    const url =
      canonical ||
      (typeof window !== "undefined" ? window.location.origin + window.location.pathname : "");
    document.title = fullTitle;
    upsertMeta("name", "description", desc);
    upsertMeta("name", "robots", noindex ? "noindex, nofollow" : "index, follow");
    upsertMeta("property", "og:title", fullTitle);
    upsertMeta("property", "og:description", desc);
    if (url) upsertMeta("property", "og:url", url);
    upsertMeta("name", "twitter:title", fullTitle);
    upsertMeta("name", "twitter:description", desc);
    upsertCanonical(url);
    upsertJsonLd(jsonLd || null);
    // Clear page-specific JSON-LD on unmount so it never leaks to the next page.
    return () => upsertJsonLd(null);
  }, [title, description, canonical, JSON.stringify(jsonLd), noindex]);
}
