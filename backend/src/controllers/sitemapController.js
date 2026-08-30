import Stream from "../models/Stream.js";
import Subject from "../models/Subject.js";
import Exam from "../models/Exam.js";
import { NOT_DELETED } from "../utils/softDelete.js";

// Dynamic XML sitemap served at the site root (proxied from the frontend host
// to this API — see frontend/vercel.json). It lists the fixed public pages PLUS
// every REAL, public, non-deleted subject/stream/exam landing page so Google
// can discover them directly instead of only via internal links.
//
// Rules honoured:
//   • Only public content that is visible on the live site: streams/subjects
//     use the SAME filter as the public list endpoints ({ isActive:true, not
//     deleted }); exams have no visibility flag so all are public.
//   • Valid slugs only. Streams/subjects have a real `slug`; exams have none,
//     so the slug is derived from the name with the SAME slugify the frontend
//     /exams/:slug page uses — and de-duplicated.
//   • NEVER includes private/authenticated/admin/client/student/tenant content.
//   • Canonical host is https://www.mystudyguide.in (override with SITE_URL).

const SITE = (process.env.SITE_URL || "https://www.mystudyguide.in").replace(/\/+$/, "");

// Mirror of the frontend slugify (frontend/src/lib/slug.js) so exam URLs in the
// sitemap match exactly what /exams/:slug resolves.
const slugify = (s) =>
  String(s || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// Fixed public routes (must mirror the app's public pages).
const STATIC = [
  { path: "/", priority: "1.0", changefreq: "weekly" },
  { path: "/about", priority: "0.7", changefreq: "monthly" },
  { path: "/contact", priority: "0.6", changefreq: "monthly" },
  { path: "/faq", priority: "0.7", changefreq: "monthly" },
  { path: "/quiz", priority: "0.8", changefreq: "weekly" },
  { path: "/test-series", priority: "0.8", changefreq: "weekly" },
  { path: "/practice", priority: "0.8", changefreq: "weekly" },
  { path: "/study", priority: "0.7", changefreq: "weekly" },
  { path: "/subjects", priority: "0.8", changefreq: "weekly" },
  { path: "/streams", priority: "0.8", changefreq: "weekly" },
  { path: "/exams", priority: "0.8", changefreq: "weekly" },
];

const xmlEscape = (s) =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const isoDay = (d) => {
  try { return new Date(d).toISOString().slice(0, 10); } catch { return null; }
};

function urlTag({ path, priority, changefreq, lastmod }) {
  const lines = [`    <loc>${xmlEscape(SITE + path)}</loc>`];
  if (lastmod) lines.push(`    <lastmod>${lastmod}</lastmod>`);
  if (changefreq) lines.push(`    <changefreq>${changefreq}</changefreq>`);
  if (priority) lines.push(`    <priority>${priority}</priority>`);
  return `  <url>\n${lines.join("\n")}\n  </url>`;
}

function buildXml(entries) {
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    entries.map(urlTag).join("\n") +
    `\n</urlset>\n`
  );
}

// GET /sitemap.xml
export async function sitemap(req, res) {
  let entries = [...STATIC];

  try {
    const [streams, subjects, exams] = await Promise.all([
      Stream.find({ isActive: true, disabled: { $ne: true }, ...NOT_DELETED, slug: { $exists: true, $ne: "" } })
        .select("slug updatedAt").sort("order name").lean(),
      Subject.find({ isActive: true, disabled: { $ne: true }, ...NOT_DELETED, slug: { $exists: true, $ne: "" } })
        .select("slug updatedAt").sort("name").lean(),
      Exam.find().select("name updatedAt").sort("order name").lean(),
    ]);

    streams.forEach((s) =>
      entries.push({ path: `/streams/${s.slug}`, priority: "0.7", changefreq: "weekly", lastmod: isoDay(s.updatedAt) }));

    subjects.forEach((s) =>
      entries.push({ path: `/subjects/${s.slug}`, priority: "0.7", changefreq: "weekly", lastmod: isoDay(s.updatedAt) }));

    // Exams: derive slug from name, skip blanks, de-dupe on the derived slug.
    const seen = new Set();
    exams.forEach((e) => {
      const slug = slugify(e.name);
      if (!slug || seen.has(slug)) return;
      seen.add(slug);
      entries.push({ path: `/exams/${slug}`, priority: "0.7", changefreq: "weekly", lastmod: isoDay(e.updatedAt) });
    });
  } catch (err) {
    // Never fail the sitemap: if the DB is unreachable, still return a valid
    // sitemap of the fixed public pages so Google always gets something usable.
    entries = [...STATIC];
  }

  res.set("Content-Type", "application/xml; charset=utf-8");
  // Cache at the edge/CDN for an hour so this stays fast and shields the
  // (free-tier) API from repeated crawler hits.
  res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
  res.send(buildXml(entries));
}
