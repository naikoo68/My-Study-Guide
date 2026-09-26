// Render a SLIDE (from slidePlan.js) into a branded 1080×1920 (9:16) image on
// Cloudinary — clean, light, MyStudyGuide-branded, high-contrast and readable on
// a phone. Built as an SVG and rasterised to JPEG by Cloudinary (same technique
// as config/socialImage.js), so it needs no canvas/ffmpeg on the host.
//
// Returns { url, publicId } for use by the video composer, or throws on failure.
import { uploadBufferToCloudinary } from "./cloudinary.js";

const W = 1080;
const H = 1920;
const PAD = 96; // inner content padding
const CARD_X = 48;
const CARD_W = W - CARD_X * 2;

const esc = (s) =>
  String(s || "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

// Light LaTeX → Unicode for DISPLAY (superscripts, common symbols). Anything we
// can't map is stripped so the slide never shows raw "$\frac{}{}" markup.
const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "n": "ⁿ", "x": "ˣ" };
const SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "x": "ₓ", "n": "ₙ" };
const SYM = { times: "×", div: "÷", pm: "±", cdot: "·", leq: "≤", geq: "≥", neq: "≠", approx: "≈", rightarrow: "→", to: "→", infty: "∞", alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", pi: "π", mu: "μ", omega: "ω", degree: "°" };
const toScript = (str, map) => String(str).split("").map((c) => map[c] || c).join("");

function uni(input) {
  let s = String(input || "").replace(/\$/g, "");
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "($1)/($2)");
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, "$1");
  s = s.replace(/\^\{([^{}]*)\}/g, (_, g) => toScript(g, SUP)).replace(/\^\s*([0-9A-Za-z+\-])/g, (_, g) => toScript(g, SUP));
  s = s.replace(/_\{([^{}]*)\}/g, (_, g) => toScript(g, SUB)).replace(/_\s*([0-9A-Za-z+\-])/g, (_, g) => toScript(g, SUB));
  s = s.replace(/\\([A-Za-z]+)/g, (_, name) => SYM[name] || "");
  return s.replace(/[{}\\^_]/g, "").replace(/\s+/g, " ").trim();
}

const T = (x, y, s, fill, txt, { weight = "400", anchor = "start", ls = "0" } = {}) =>
  `<text x="${x}" y="${y}" font-size="${s}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}" font-family="Arial, Helvetica, sans-serif">${txt}</text>`;
const RR = (x, y, w, h, r, fill, stroke = "none", sw = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}/>`;

// Wrap `text` to fit pixel width `w` at font size `fs`. Returns lines.
function wrapLines(text, fs, w, maxLines = 30) {
  const words = uni(text).split(" ");
  const perChar = fs * 0.54;
  const maxChars = Math.max(6, Math.floor(w / perChar));
  const lines = [];
  let cur = "";
  for (const word of words) {
    const next = (cur + " " + word).trim();
    if (next.length <= maxChars) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = word.length > maxChars ? word.slice(0, maxChars - 1) + "…" : word;
    }
    if (lines.length >= maxLines) break;
  }
  if (cur && lines.length < maxLines) lines.push(cur);
  return lines;
}

function palette(accent, brandColor) {
  const brand = brandColor || "#2563eb";
  switch (accent) {
    case "orange": return { pill: "#fff1e6", pillText: "#c2410c", bar: "#ea580c" };
    case "green": return { pill: "#ecfdf5", pillText: "#047857", bar: "#059669" };
    default: return { pill: "#e8f0fe", pillText: brand, bar: brand };
  }
}

// Draw one text block (label + wrapped body). Returns { svg, height }.
function block(x, yTop, availW, item, brand) {
  const parts = [];
  let y = yTop;
  if (item.label) {
    parts.push(T(x, y + 30, 30, brand, esc(uni(item.label)), { weight: "800", ls: "0.5" }));
    y += 46;
  }
  const positive = item.positive;
  const muted = item.muted;
  const link = item.link;
  const emphasis = item.emphasis;
  const fs = emphasis ? 46 : muted ? 34 : 40;
  const color = positive ? "#047857" : muted ? "#64748b" : link ? brand : "#0f172a";
  const weight = emphasis ? "800" : link ? "700" : "500";
  const bulletPrefix = item.bullet ? "•  " : "";
  const lines = wrapLines(bulletPrefix + (item.text || ""), fs, availW, 14);
  const lineH = fs * 1.34;
  for (const ln of lines) {
    parts.push(T(x, y + fs, fs, color, esc(ln), { weight }));
    y += lineH;
  }
  return { svg: parts.join("\n"), height: y - yTop + 12 };
}

// Options grid: A/B/C/D pills. Returns { svg, height }.
function optionsBlock(x, yTop, availW, options, brand) {
  const parts = [];
  let y = yTop;
  for (const o of options) {
    const fs = 38;
    const badgeSize = 60;
    const textW = availW - badgeSize - 40;
    const lines = wrapLines(o.text, fs, textW, 4);
    const lineH = fs * 1.3;
    const boxH = Math.max(96, lines.length * lineH + 40);
    parts.push(RR(x, y, availW, boxH, 20, "#ffffff", "#e2e8f0", 2));
    parts.push(RR(x + 22, y + boxH / 2 - badgeSize / 2, badgeSize, badgeSize, 16, brand));
    parts.push(T(x + 22 + badgeSize / 2, y + boxH / 2 + 14, 34, "#ffffff", esc(o.badge), { weight: "800", anchor: "middle" }));
    let ty = y + (boxH - lines.length * lineH) / 2;
    for (const ln of lines) {
      parts.push(T(x + 22 + badgeSize + 24, ty + fs, fs, "#1e293b", esc(ln), { weight: "600" }));
      ty += lineH;
    }
    y += boxH + 20;
  }
  return { svg: parts.join("\n"), height: y - yTop };
}

// Two-column matching block. Returns { svg, height }.
function columnsBlock(x, yTop, availW, columns, brand) {
  const parts = [];
  const gap = 28;
  const colW = (availW - gap) / 2;
  const drawCol = (title, items, cx, titleColor, badgeBg) => {
    const cParts = [T(cx + 20, yTop + 34, 28, titleColor, esc(title), { weight: "800", ls: "1" })];
    let yy = yTop + 66;
    for (const it of items) {
      const lines = wrapLines(it.text, 30, colW - 84, 4);
      const boxH = Math.max(64, lines.length * 40 + 24);
      cParts.push(RR(cx + 16, yy, 44, 44, 12, badgeBg));
      cParts.push(T(cx + 38, yy + 30, 24, "#ffffff", esc(String(it.badge)), { weight: "800", anchor: "middle" }));
      let ty = yy;
      for (const ln of lines) { cParts.push(T(cx + 74, ty + 30, 30, "#1e293b", esc(ln), { weight: "500" })); ty += 40; }
      yy += boxH;
    }
    return { svg: cParts.join("\n"), bottom: yy };
  };
  const a = drawCol("COLUMN A", columns.a || [], x, brand, brand);
  const b = drawCol("COLUMN B", columns.b || [], x + colW + gap, "#ea580c", "#ea580c");
  const h = Math.max(a.bottom, b.bottom) - yTop + 20;
  parts.push(RR(x, yTop, colW, h, 20, "#ffffff", "#e2e8f0", 2));
  parts.push(RR(x + colW + gap, yTop, colW, h, 20, "#ffffff", "#e2e8f0", 2));
  parts.push(a.svg, b.svg);
  return { svg: parts.join("\n"), height: h };
}

// Build the full slide SVG.
function buildSlideSvg(slide, opts = {}) {
  const brandColor = opts.brandColor || "#2563eb";
  const siteName = esc(uni(opts.siteName || "My Study Guide"));
  const pal = palette(slide.accent, brandColor);
  const els = [];

  // Header: brand strip with the site name.
  els.push(RR(0, 0, W, 150, 0, brandColor));
  els.push(T(PAD, 96, 44, "#ffffff", siteName, { weight: "800" }));
  els.push(RR(0, 150, W, 6, 0, "#ea580c"));

  let y = 226;

  // Tag pill (e.g. "QUESTION OF THE DAY").
  if (slide.tag) {
    const tw = Math.max(220, slide.tag.length * 20 + 80);
    els.push(RR(PAD, y, tw, 64, 32, pal.pill));
    els.push(T(PAD + tw / 2, y + 43, 30, pal.pillText, esc(slide.tag), { weight: "800", anchor: "middle", ls: "1" }));
    y += 108;
  }

  // Heading.
  if (slide.heading) {
    const hs = slide.brand ? 84 : 56;
    const lines = wrapLines(slide.heading, hs, CARD_W - (PAD - CARD_X) * 2, 4);
    for (const ln of lines) {
      els.push(T(PAD, y + hs, hs, slide.brand ? brandColor : "#0f172a", esc(ln), { weight: "900" }));
      y += hs * 1.2;
    }
    y += 24;
  }

  const availW = W - PAD * 2;

  // Columns (matching questions).
  if (slide.columns) {
    const c = columnsBlock(PAD, y, availW, slide.columns, brandColor);
    els.push(c.svg);
    y += c.height + 20;
  }

  // Options grid.
  if (slide.options && slide.options.length) {
    const o = optionsBlock(PAD, y, availW, slide.options, brandColor);
    els.push(o.svg);
    y += o.height + 10;
  }

  // Body items.
  for (const item of slide.body || []) {
    const b = block(PAD, y, availW, item, brandColor);
    els.push(b.svg);
    y += b.height;
  }

  // Caption band (auto-captions) — the slide's narration, readable at the bottom.
  let caption = "";
  if (opts.autoCaptions && opts.captionText) {
    const capLines = wrapLines(opts.captionText, 32, W - PAD * 2 - 40, 3);
    const bandH = capLines.length * 44 + 48;
    const bandY = H - bandH - 60;
    const inner = capLines
      .map((ln, i) => T(W / 2, bandY + 44 + i * 44, 32, "#ffffff", esc(ln), { weight: "600", anchor: "middle" }))
      .join("\n");
    caption = `${RR(50, bandY, W - 100, bandH, 24, "rgba(15,23,42,0.82)")}\n${inner}`;
  }

  // Footer brand line (skip on the CTA slide, which is itself the brand slide).
  const footer = slide.brand
    ? ""
    : T(W / 2, H - 32, 28, "#94a3b8", `${siteName}  ·  ${esc(uni(opts.siteUrl || "www.mystudyguide.in"))}`, { weight: "700", anchor: "middle" });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#ffffff"/>
        <stop offset="1" stop-color="#eef2f7"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    ${els.join("\n    ")}
    ${caption}
    ${footer}
  </svg>`;
}

// Render + upload one slide → { url, publicId }.
export async function renderSlideImage(slide, opts = {}) {
  const captionText = opts.autoCaptions ? slide.narration : "";
  const svg = buildSlideSvg(slide, { ...opts, captionText });
  const uploaded = await uploadBufferToCloudinary(Buffer.from(svg), {
    resourceType: "image",
    folder: "mystudyguide/slideshow/slides",
    format: "jpg",
    mime: "image/svg+xml",
  });
  if (!uploaded.secure_url) throw new Error("Cloudinary returned no URL for the slide image.");
  return { url: uploaded.secure_url, publicId: uploaded.public_id };
}

// Exported for unit tests.
export { buildSlideSvg };
