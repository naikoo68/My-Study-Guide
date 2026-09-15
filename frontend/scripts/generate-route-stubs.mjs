// Post-build step: emit a real static HTML file for every PUBLIC route so a
// static host (Cloudflare Pages) serves them with **HTTP 200** instead of the
// SPA 404 fallback.
//
// WHY THIS EXISTS
// ---------------
// This is a client-rendered SPA: only `dist/index.html` (served at "/") is a
// real file. For any other path (e.g. /about, /streams/<slug>) the host finds
// no file and serves `public/404.html` — which returns a **404 status** and a
// `<meta name="robots" content="noindex">` "Redirecting…" page. A browser runs
// its JS and recovers, but a CRAWLER (Googlebot / the AdSense reviewer) just
// sees "404 + noindex" for every page except the home page. That makes the
// whole site look like a single page with no content, which blocks indexing
// and AdSense approval.
//
// The fix: after `vite build`, drop a copy of `index.html` at `<route>/index.html`
// for each public route. Now the host finds a real file and returns 200 with
// the app shell; React Router boots and renders the right page, and crawlers
// get an indexable page (with the correct per-page canonical/og:url). Genuinely
// unknown URLs still fall through to `404.html` and correctly return 404.
//
// This never fails the build: any error is logged and we exit 0, so a flaky
// network (the optional sitemap fetch) or edge case can't break a deploy.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(__dirname, "..", "dist");

// Canonical production origin. Keep in sync with index.html and the backend
// sitemap (SITE_URL). Trailing slash stripped.
const SITE = (process.env.SITE_URL || "https://www.mystudyguide.in").replace(/\/+$/, "");

// The public, indexable routes that always exist (mirror the app's public
// pages). Legal/info pages (privacy/terms/refund/pricing) matter for AdSense —
// a reachable Privacy Policy is required — so they're included explicitly.
// "/" is intentionally excluded: dist/index.html already serves it.
const STATIC_ROUTES = [
  "/about",
  "/contact",
  "/faq",
  "/pricing",
  "/privacy",
  "/terms",
  "/refund",
  "/quiz",
  "/test-series",
  "/practice",
  "/study",
  "/subjects",
  "/streams",
  "/exams",
];

// Best-effort: pull the dynamic content routes (stream/subject/exam landing
// pages) straight from the live sitemap so the stubs match exactly what we tell
// Google to crawl. If the fetch fails (offline build, API down) we just use the
// static list — the build still succeeds.
async function fetchSitemapRoutes() {
  const url = `${SITE}/sitemap.xml`;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const routes = [];
    const re = /<loc>\s*([^<]+?)\s*<\/loc>/g;
    let m;
    while ((m = re.exec(xml)) !== null) {
      const loc = m[1].trim();
      if (!loc.startsWith(SITE)) continue;
      const path = loc.slice(SITE.length) || "/";
      routes.push(path);
    }
    return routes;
  } catch (err) {
    console.warn(`[route-stubs] sitemap fetch skipped (${err.message}) — using static routes only`);
    return [];
  }
}

// Rewrite the two per-page SEO tags that index.html hard-codes to the site root
// so each stub advertises its OWN URL (otherwise every page would claim the
// homepage as canonical and Google could collapse them into one).
function personalize(html, absUrl) {
  return html
    .replace(
      /<link rel="canonical" href="https:\/\/www\.mystudyguide\.in\/"\s*\/>/,
      `<link rel="canonical" href="${absUrl}" />`
    )
    .replace(
      /<meta property="og:url" content="https:\/\/www\.mystudyguide\.in\/"\s*\/>/,
      `<meta property="og:url" content="${absUrl}" />`
    );
}

// Normalise a path into the on-disk file location: "/about" -> "about/index.html".
function fileForRoute(path) {
  const clean = path.replace(/^\/+/, "").replace(/\/+$/, "");
  return join(DIST, clean, "index.html");
}

async function main() {
  if (!existsSync(DIST)) {
    console.warn(`[route-stubs] dist/ not found at ${DIST} — nothing to do`);
    return;
  }
  const indexPath = join(DIST, "index.html");
  if (!existsSync(indexPath)) {
    console.warn(`[route-stubs] dist/index.html not found — skipping`);
    return;
  }
  const baseHtml = await readFile(indexPath, "utf8");

  // Merge static + dynamic routes, drop "/", de-dupe, and skip anything that
  // would clobber index.html.
  const dynamic = await fetchSitemapRoutes();
  const all = [...STATIC_ROUTES, ...dynamic]
    .map((p) => (p.startsWith("/") ? p : `/${p}`))
    .filter((p) => p && p !== "/");
  const unique = [...new Set(all)];

  let written = 0;
  for (const path of unique) {
    try {
      const absUrl = SITE + path;
      const html = personalize(baseHtml, absUrl);
      const out = fileForRoute(path);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, html, "utf8");
      written++;
    } catch (err) {
      console.warn(`[route-stubs] skip ${path}: ${err.message}`);
    }
  }
  console.log(
    `[route-stubs] wrote ${written} static route file(s) ` +
      `(${STATIC_ROUTES.length} static + ${unique.length - STATIC_ROUTES.length} dynamic) so public routes return 200.`
  );
}

main().catch((err) => {
  // Never fail the build over stub generation.
  console.warn(`[route-stubs] non-fatal error: ${err?.stack || err}`);
  process.exit(0);
});
