# Performance & Core Web Vitals — checklist (SEO step #12)

Performance is a real ranking + user-experience factor. Unlike the other SEO
steps, most of this can only be **measured on the live site** (Lighthouse / PageSpeed
Insights / Search Console → *Core Web Vitals*), so this file records what is
already optimised in the code and what you should measure and act on next.

---

## ✅ Already in place (in the codebase)

- **Route-level code splitting** — every page is loaded with `React.lazy(...)`
  (`frontend/src/App.jsx`), so the initial JS bundle only contains what the
  first screen needs. This is the single biggest bundle-size win and it's done.
- **API preconnect / DNS-prefetch** — `index.html` opens the connection to the
  API host early, cutting first-request latency.
- **Analytics loaded conditionally & async** — GA4 (`gtag`) only loads when a
  real Measurement ID is set, and loads with `async`, so it never blocks render.
- **PWA / service-worker caching** — repeat visits serve cached assets.
- **Lazy, non-blocking below-the-fold images** — testimonial/review photos use
  `loading="lazy"` + `decoding="async"` and explicit `width`/`height` (avoids
  layout shift → better **CLS**).
- **Single SEO system** — `useSeo` updates tags in place; no extra SEO library
  adding weight.

---

## 🔬 Measure on the live site (needs Lighthouse — can't be done offline)

Run **PageSpeed Insights** (https://pagespeed.web.dev) on the live URLs (test
**mobile** first — that's what Google ranks on):

- `https://www.mystudyguide.in/`
- `https://www.mystudyguide.in/quiz`
- `https://www.mystudyguide.in/subjects/<a-real-subject>`

Targets (Google "good" thresholds):

| Metric | Good |
| --- | --- |
| **LCP** (Largest Contentful Paint) | ≤ 2.5 s |
| **CLS** (Cumulative Layout Shift) | ≤ 0.1 |
| **INP** (Interaction to Next Paint) | ≤ 200 ms |
| **TTFB** (Time to First Byte) | ≤ 0.8 s |

Also watch **Search Console → Experience → Core Web Vitals** for field data
(real users) over the following weeks.

---

## 🛠️ Likely action items (confirm with a real Lighthouse run first)

Do **not** change working code blindly — measure, then fix the biggest item.

1. **API latency (TTFB).** The API is self-hosted on an always-on VM (no
   cold starts). Watch the biggest wins: serve it over HTTP/2 behind the CDN,
   keep list endpoints lean, and cache slow/decorative aggregations. Put the
   API behind a CDN edge so TLS terminates near users.
2. **Image sizes.** Compress/resize large uploads (logo, OG image, any
   question images). Serve appropriately sized images; prefer WebP where easy.
3. **Font loading.** If any web fonts are used, ensure `font-display: swap`.
4. **Unnecessary API calls.** Check the Network tab on first load for duplicate
   or eager requests that could be deferred until needed.
5. **Preload the LCP element** (usually the hero heading/logo) if PSI flags it.

---

## Notes / guardrails

- Performance work must not degrade the quiz/exam experience. For example, we
  deliberately did **not** add `loading="lazy"` to the current question's image
  in the timed exam/quiz players — that could cause a visible flash mid-test.
- Everything above is measurement-driven. Start from a live Lighthouse report
  and fix the highest-impact item rather than guessing.


---

## 📱 iOS lag / slowness audit (applied fixes)

A focused audit of why the site felt laggy on iOS Safari, and what was changed.
All items below are implemented in the codebase.

### Scroll jank — the biggest "lag" source
- **Sticky navbar no longer uses `backdrop-blur`.** A translucent
  `backdrop-blur` bar (`frontend/src/components/layout/Navbar.jsx`) forces iOS
  Safari to re-blur the page content behind it on *every* scroll frame — the
  classic cause of janky scrolling. Replaced with a near-opaque
  `bg-white/95` background: looks the same at a glance, scrolls smoothly.
- **Notice ticker marquee** (`animate-marquee`) now sets `will-change: transform`
  (composited off the main thread) and is fully disabled under
  `prefers-reduced-motion: reduce` — a perpetual animation is battery- and
  jank-heavy on phones.

### First paint / download
- **Web font moved from a CSS `@import` to `<link>` in `index.html`** with
  `preconnect` to the Google Fonts hosts. A CSS `@import` is only discovered
  after `index.css` downloads and parses (a render-blocking request waterfall);
  the `<link>` is found immediately by the preload scanner and fetched in
  parallel. Unused weight 300 dropped.
- **Chart.js / KaTeX removed from the first-paint bundle.** They were pinned to
  manual vendor chunks that the bundler preloaded on every page even though only
  lazy routes (dashboards, quiz result, viz) use them. `vite.config.js` now only
  pins the React runtime; feature libs code-split with their route. This cut the
  initial JS payload by ~200 KB (raw) / ~60 KB (gzip).

### Known remaining item (not yet changed — higher risk)
- The **lucide-react icon set** collapses into one shared chunk (~157 KB gzip)
  that the eager navbar pulls in on first paint. Reducing it further requires
  per-icon deep imports across the app (large refactor) and was left out of this
  low-risk pass. Revisit if PageSpeed flags initial JS on mobile.
