// YouTube THUMBNAIL from the admin's uploaded template (Admin → Facebook →
// YouTube long videos → Thumbnail template). The template is the background
// (1280×720, 16:9); the video's subject / topic / quiz are written INTO the
// empty box the admin positions, with full text styling (font, colour, outline,
// shadow, a shade panel and a coloured quiz badge).
//
// Rendered with the same headless Chromium as the slides (cardShot.js), so the
// text supports every script the server has fonts for. Returns JPEG bytes
// ≤ 2 MB (YouTube's limit). Best-effort: callers treat a failure as "no custom
// thumbnail" — the upload itself never fails because of it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./cardShot.js";

export const THUMB_W = 1280;
export const THUMB_H = 720;
// Long-video slides are 16:9 at full HD.
export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

// Bundled OFL display fonts (backend/assets/fonts) — inlined into the thumbnail
// page as base64 @font-face, so they render the same on any server regardless
// of installed system fonts. "sans"/"serif"/"mono" use the system stacks.
const FONT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "assets", "fonts");
const BUNDLED_FONTS = {
  anton: { file: "Anton-Regular.ttf", weight: 400, label: "Anton (heavy display)" },
  bebas: { file: "BebasNeue-Regular.ttf", weight: 400, label: "Bebas Neue (tall condensed)" },
  poppins: { file: "Poppins-ExtraBold.ttf", weight: 800, label: "Poppins (rounded)" },
  oswald: { file: "Oswald-VF.ttf", weight: 700, label: "Oswald (condensed)" },
  montserrat: { file: "Montserrat-VF.ttf", weight: 800, label: "Montserrat (modern)" },
};
// Path of a bundled font file (for the admin editor's instant preview), or "".
export function bundledFontPath(key) {
  const f = Object.prototype.hasOwnProperty.call(BUNDLED_FONTS, key) ? BUNDLED_FONTS[key] : null;
  return f ? path.join(FONT_DIR, f.file) : "";
}
const _fontCache = new Map(); // key → base64 data URI ("" when the file is missing)
function fontDataUri(key) {
  if (_fontCache.has(key)) return _fontCache.get(key);
  let uri = "";
  try {
    const f = BUNDLED_FONTS[key];
    if (f) uri = `data:font/ttf;base64,${fs.readFileSync(path.join(FONT_DIR, f.file)).toString("base64")}`;
  } catch { /* missing → fall back to a system font */ }
  _fontCache.set(key, uri);
  return uri;
}

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const hex = (v, d) => (/^#[0-9a-f]{6}$/i.test(String(v || "")) ? v : d);
const num = (v, d, lo, hi) => { const n = Number(v); return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : d; };
const frac = (v, d) => num(v, d, 0, 1);
// A hex colour + 0–100 opacity → rgba(). Blank colour → transparent.
function rgba(color, opacityPct) {
  const h = hex(color, "");
  if (!h) return "transparent";
  const a = num(opacityPct, 100, 0, 100) / 100;
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}
// System font stacks (see backend/Dockerfile: font-noto, ttf-freefont). Bundled
// fonts fall back to the sans stack if their file is ever missing.
const SANS = `"Inter","Noto Sans","Noto Sans Devanagari","DejaVu Sans","FreeSans",Arial,sans-serif`;
const FONT_STACKS = {
  sans: SANS,
  serif: `"Noto Serif","DejaVu Serif","FreeSerif","Times New Roman",serif`,
  mono: `"Noto Sans Mono","DejaVu Sans Mono","FreeMono",monospace`,
};
// Every choice offered in the admin (system + bundled).
export const THUMB_FONTS = [...Object.keys(FONT_STACKS), ...Object.keys(BUNDLED_FONTS)];
// Family name + weight + optional @font-face for a chosen font key.
function fontFace(key) {
  if (FONT_STACKS[key]) return { family: FONT_STACKS[key], weight: null, css: "" };
  const b = BUNDLED_FONTS[key];
  const uri = b ? fontDataUri(key) : "";
  if (!uri) return { family: SANS, weight: null, css: "" };
  const fam = `MSG_${key}`;
  return {
    family: `"${fam}",${SANS}`,
    weight: b.weight,
    css: `@font-face{font-family:"${fam}";src:url(${uri}) format("truetype");font-weight:100 900;font-display:block;}`,
  };
}
export const THUMB_ALIGN = ["left", "center", "right"];
export const THUMB_VALIGN = ["top", "center", "bottom"];
// The default text box (fractions of the 1280×720 frame): the left ~58%.
export const DEFAULT_THUMB_BOX = { x: 0.05, y: 0.12, w: 0.56, h: 0.76 };

// Clean a saved/received box → { x, y, w, h } fractions, kept on-frame.
export function cleanThumbBox(b) {
  if (!b || typeof b !== "object") return { ...DEFAULT_THUMB_BOX };
  const x = frac(b.x, DEFAULT_THUMB_BOX.x);
  const y = frac(b.y, DEFAULT_THUMB_BOX.y);
  const w = Math.max(0.1, Math.min(1 - x, frac(b.w, DEFAULT_THUMB_BOX.w)));
  const h = Math.max(0.1, Math.min(1 - y, frac(b.h, DEFAULT_THUMB_BOX.h)));
  return { x, y, w, h };
}

// The HTML page for one thumbnail. Pure (tested).
//   templateUrl — background image (blank → a plain brand-colour background)
//   lines       — { kicker, headline, badge } (see thumbnailLines in youtube.js)
//   showText    — false → the template alone
//   box         — { x, y, w, h } fractions: where the text sits (the empty area)
//   align/vAlign, font, uppercase — layout & type
//   textColor, kickerColor, strokeColor, strokeWidth, shadow — headline/kicker look
//   accentColor (badge fill), badgeTextColor — the quiz badge
//   panelColor, panelOpacity, panelRadius — a shade box behind the text
//   position — legacy preset, used only when no box is given (back-compat)
export function buildThumbnailHtml(opts = {}) {
  const {
    templateUrl = "", lines = {}, showText = true, brandColor = "#2563eb",
    box, position = "left",
    align = "left", vAlign = "center",
    font = "sans", uppercase = false,
    textColor = "#ffffff", kickerColor = "", strokeColor = "#000000", strokeWidth = 3, shadow = true,
    accentColor = "#facc15", badgeTextColor = "#111111",
    panelColor = "", panelOpacity = 0, panelRadius = 24,
    headlineSize = 104, kickerSize = 44, badgeSize = 46, lineHeight = 1.05,
    rotate = 0, width = THUMB_W, height = THUMB_H,
  } = opts;
  const W = Number(width) || THUMB_W;
  const H = Number(height) || THUMB_H;
  const rot = num(rotate, 0, -180, 180);
  const rotCss = rot ? `transform:rotate(${rot}deg);transform-origin:center center;` : "";

  const color = hex(textColor, "#ffffff");
  const kColor = hex(kickerColor, "") || color;
  const badgeBg = hex(accentColor, "#facc15");
  const badgeColor = hex(badgeTextColor, "#111111");
  const ff = fontFace(font);
  const family = ff.family;
  const weightCss = ff.weight ? `font-weight:${ff.weight};` : "font-weight:900;";
  const hSize = num(headlineSize, 104, 24, 200);
  const kSize = num(kickerSize, 44, 12, 120);
  const bSize = num(badgeSize, 46, 12, 120);
  const lh = num(lineHeight, 1.05, 0.8, 2);
  const sw = num(strokeWidth, 3, 0, 16);
  const stroke = sw > 0 ? `-webkit-text-stroke:${sw}px ${hex(strokeColor, "#000000")};paint-order:stroke fill;` : "";
  const shadowCss = shadow ? "text-shadow:0 6px 18px rgba(0,0,0,.8);" : "";
  const kShadowCss = shadow ? "text-shadow:0 3px 10px rgba(0,0,0,.75);" : "";
  const up = uppercase ? "text-transform:uppercase;" : "";
  const alignItems = align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start";
  const justify = vAlign === "top" ? "flex-start" : vAlign === "bottom" ? "flex-end" : "center";
  const textAlign = THUMB_ALIGN.includes(align) ? align : "left";

  // Position: the box (fractions) wins; otherwise the legacy preset.
  let boxCss;
  if (box && typeof box === "object") {
    const b = cleanThumbBox(box);
    boxCss = `left:${(b.x * 100).toFixed(2)}%;top:${(b.y * 100).toFixed(2)}%;width:${(b.w * 100).toFixed(2)}%;height:${(b.h * 100).toFixed(2)}%;`;
  } else {
    boxCss = {
      left: "left:5%;top:12%;width:56%;height:76%;",
      right: "right:5%;top:12%;width:56%;height:76%;",
      center: "left:8%;right:8%;top:12%;height:76%;",
      bottom: "left:5%;right:5%;bottom:10%;height:50%;",
    }[["left", "center", "right", "bottom"].includes(position) ? position : "left"];
  }

  const panel = num(panelOpacity, 0, 0, 100) > 0 && hex(panelColor, "")
    ? `background:${rgba(panelColor, panelOpacity)};border-radius:${num(panelRadius, 24, 0, 80)}px;padding:24px 32px;`
    : "";

  const { kicker = "", headline = "", badge = "" } = lines || {};
  const text = showText && (kicker || headline || badge)
    ? `<div id="box" style="position:absolute;display:flex;flex-direction:column;justify-content:${justify};align-items:${alignItems};text-align:${textAlign};${boxCss}${rotCss}">
        <div id="inner" style="display:flex;flex-direction:column;gap:16px;max-width:100%;align-items:inherit;${panel}">
          ${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ""}
          ${headline ? `<div id="headline" class="headline">${esc(headline)}</div>` : ""}
          ${badge ? `<div class="badge">${esc(badge)}</div>` : ""}
        </div>
      </div>`
    : "";

  const bg = templateUrl
    ? `background:#000 url("${esc(templateUrl)}") center/cover no-repeat;`
    : `background:linear-gradient(135deg, ${hex(brandColor, "#2563eb")}, #0f172a);`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${ff.css}
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${W}px;height:${H}px;overflow:hidden}
    body{font-family:${family}}
    #thumb{position:relative;width:${W}px;height:${H}px;${bg}}
    .kicker{font-size:${kSize}px;font-weight:800;color:${kColor};${up}letter-spacing:1px;${kShadowCss}}
    .headline{font-size:${hSize}px;line-height:${lh};${weightCss}color:${color};width:100%;${up}
      overflow-wrap:break-word;${stroke}${shadowCss}}
    .badge{display:inline-block;font-size:${bSize}px;font-weight:900;color:${badgeColor};background:${badgeBg};
      padding:8px 26px;border-radius:14px;box-shadow:0 6px 18px rgba(0,0,0,.45)}
  </style></head><body><div id="thumb">${text}</div>
  <script>
    // Start at the chosen size, then shrink ONLY if the headline overflows its
    // box (more than 3 lines, a cut word, or taller than the box). A short
    // topic keeps the size you set.
    (function(){
      var h=document.getElementById("headline"), box=document.getElementById("box"), inner=document.getElementById("inner");
      if(!h||!box||!inner) return;
      var size=${hSize}, lh=${lh};
      function over(){
        var lines=Math.round(h.offsetHeight/(size*lh));
        return lines>3 || h.scrollWidth>h.clientWidth+4 || inner.scrollHeight>box.clientHeight-4;
      }
      while(size>24 && over()){ size-=4; h.style.fontSize=size+"px"; }
    })();
  </script></body></html>`;
}

// Render the thumbnail → { image: Buffer, mime } | { error }. Never throws.
export async function renderYoutubeThumbnail(opts = {}) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: Number(opts.width) || THUMB_W, height: Number(opts.height) || THUMB_H, deviceScaleFactor: 1 });
    await page.setContent(buildThumbnailHtml(opts), { waitUntil: "networkidle0", timeout: 25000 });
    if (opts.templateUrl) {
      // Make sure the background image actually loaded (a broken link → error, not a blank thumbnail).
      const ok = await page.evaluate((u) => new Promise((res) => {
        const i = new Image(); i.onload = () => res(true); i.onerror = () => res(false); i.src = u;
      }), opts.templateUrl);
      if (!ok) throw new Error("The thumbnail template image could not be loaded.");
    }
    const el = await page.$("#thumb");
    let image = null;
    for (const quality of [90, 80, 70]) {
      image = Buffer.from(await el.screenshot({ type: "jpeg", quality }));
      if (image.length <= 2 * 1024 * 1024) break;
    }
    return { image, mime: "image/jpeg" };
  } catch (e) {
    return { error: `Thumbnail render failed: ${e?.message || e}` };
  } finally {
    if (browser) { try { await browser.close(); } catch { /* ignore */ } }
  }
}
