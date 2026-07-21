import { uploadImage, isCloudinaryConfigured } from "./cloudinary.js";
import Settings from "../models/Settings.js";

// Renders a question into a clean 1080×1080 "card" image for Facebook/Instagram.
// Built as an SVG (no native deps) and rasterised to PNG by Cloudinary (already
// configured for this app). If anything fails, callers fall back to a text post.

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const esc = (s) => String(s || "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
const plain = (s) => String(s || "").replace(/\$/g, "").replace(/\s+/g, " ").trim();

// Greedy word-wrap to a max character count per line (approx for the font size).
function wrap(text, maxChars) {
  const words = plain(text).split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxChars) cur = (cur + " " + w).trim();
    else { if (cur) lines.push(cur); cur = w.length > maxChars ? w.slice(0, maxChars - 1) + "…" : w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Build the SVG string. Content is laid out top-down; if it would overflow the
// card, the least-important trailing lines are dropped.
function buildQuestionSvg(q, opts = {}) {
  const W = 1080, H = 1080, PAD = 72;
  const brand = opts.brandColor || "#4f46e5";
  const siteName = esc(opts.siteName || "My Study Guide");
  const maxChars = 44;

  const body = []; // { text, size, color, gap(before) , weight }
  const push = (text, size, color, gap = 0, weight = "normal") => body.push({ text, size, color, gap, weight });

  // Question stem.
  wrap(q.text || "Question", maxChars).forEach((ln, i) => push(esc(ln), 40, "#0f172a", i === 0 ? 0 : 6, "700"));

  // Matching / pair columns.
  if (Array.isArray(q.columnA) && q.columnA.length) {
    push("", 10, "#000", 8);
    q.columnA.forEach((a, i) => wrap(`${i + 1}. ${plain(a)}`, maxChars + 4).forEach((ln, k) => push(esc(ln), 32, "#334155", k === 0 ? 6 : 2)));
    if (Array.isArray(q.columnB) && q.columnB.length) {
      push("", 8, "#000", 6);
      q.columnB.forEach((b, i) => wrap(`${ROMAN[i] || i + 1}. ${plain(b)}`, maxChars + 4).forEach((ln, k) => push(esc(ln), 32, "#334155", k === 0 ? 6 : 2)));
    }
  }

  // Options.
  if (opts.includeOptions !== false && Array.isArray(q.options) && q.options.length) {
    push("", 10, "#000", 14);
    q.options.forEach((o, i) => {
      const correct = opts.includeAnswer && i === q.correct;
      wrap(`${LETTERS[i]})  ${plain(o)}`, maxChars).forEach((ln, k) =>
        push(esc(ln), 34, correct ? "#059669" : "#1e293b", k === 0 ? 12 : 2, correct ? "700" : "500"));
    });
  }

  if (opts.includeAnswer && Number.isInteger(q.correct)) {
    push(`✓ Answer: ${LETTERS[q.correct] || q.correct + 1}`, 34, "#059669", 18, "700");
  } else if (opts.includeOptions !== false) {
    push("Comment your answer below!", 32, brand, 18, "700");
  }

  // Lay out with a vertical budget; drop trailing lines that don't fit.
  const top = 210, bottom = opts.hashtags ? 120 : 90;
  let y = top;
  const tspans = [];
  for (const b of body) {
    const lineH = Math.round(b.size * 1.28);
    y += b.gap;
    if (y + lineH > H - bottom) { tspans.push(`<text x="${PAD}" y="${y}" font-size="30" fill="#94a3b8">…</text>`); break; }
    y += b.size;
    if (b.text) tspans.push(`<text x="${PAD}" y="${y}" font-size="${b.size}" font-weight="${b.weight}" fill="${b.color}" font-family="Arial, sans-serif">${b.text}</text>`);
  }

  const footer = opts.hashtags
    ? `<text x="${PAD}" y="${H - 48}" font-size="28" fill="${brand}" font-family="Arial, sans-serif">${esc(plain(opts.hashtags))}</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#ffffff"/>
    <rect x="0" y="0" width="${W}" height="130" fill="${brand}"/>
    <text x="${PAD}" y="84" font-size="46" font-weight="800" fill="#ffffff" font-family="Arial, sans-serif">${siteName}</text>
    <text x="${W - PAD}" y="84" text-anchor="end" font-size="30" fill="#e0e7ff" font-family="Arial, sans-serif">Question of the day</text>
    ${tspans.join("\n    ")}
    ${footer}
    <rect x="0" y="${H - 12}" width="${W}" height="12" fill="${brand}"/>
  </svg>`;
}

// Render a question to a hosted PNG URL (via Cloudinary). Returns the URL or
// null on any failure (caller falls back to a text post).
export async function renderQuestionImage(q, opts = {}) {
  if (!isCloudinaryConfigured()) return null;
  try {
    const s = await Settings.findOne({ key: "site" }).lean();
    const svg = buildQuestionSvg(q, {
      ...opts,
      siteName: opts.siteName || s?.siteName || "My Study Guide",
      brandColor: opts.brandColor || s?.brandColor || s?.primaryColor || "#4f46e5",
    });
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    // Force PNG output so Facebook/Instagram get a real raster image.
    const { url } = await uploadImage(dataUri, { format: "png", folder: "mystudyguide/social" });
    return url || null;
  } catch {
    return null;
  }
}
