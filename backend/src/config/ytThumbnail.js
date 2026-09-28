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
import { launchBrowser } from "./cardShot.js";

export const THUMB_W = 1280;
export const THUMB_H = 720;

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
// The installed server fonts (see backend/Dockerfile: font-noto, ttf-freefont).
const FONT_STACKS = {
  sans: `"Inter","Noto Sans","Noto Sans Devanagari","DejaVu Sans","FreeSans",Arial,sans-serif`,
  serif: `"Noto Serif","DejaVu Serif","FreeSerif","Times New Roman",serif`,
  mono: `"Noto Sans Mono","DejaVu Sans Mono","FreeMono",monospace`,
};
export const THUMB_FONTS = Object.keys(FONT_STACKS);
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
  } = opts;

  const color = hex(textColor, "#ffffff");
  const kColor = hex(kickerColor, "") || color;
  const badgeBg = hex(accentColor, "#facc15");
  const badgeColor = hex(badgeTextColor, "#111111");
  const family = FONT_STACKS[font] || FONT_STACKS.sans;
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
    ? `<div id="box" style="position:absolute;display:flex;flex-direction:column;justify-content:${justify};align-items:${alignItems};text-align:${textAlign};${boxCss}">
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
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${THUMB_W}px;height:${THUMB_H}px;overflow:hidden}
    body{font-family:${family}}
    #thumb{position:relative;width:${THUMB_W}px;height:${THUMB_H}px;${bg}}
    .kicker{font-size:44px;font-weight:800;color:${kColor};${up}letter-spacing:1px;${kShadowCss}}
    .headline{font-size:104px;line-height:1.05;font-weight:900;color:${color};width:100%;${up}
      overflow-wrap:break-word;${stroke}${shadowCss}}
    .badge{display:inline-block;font-size:46px;font-weight:900;color:${badgeColor};background:${badgeBg};
      padding:8px 26px;border-radius:14px;box-shadow:0 6px 18px rgba(0,0,0,.45)}
  </style></head><body><div id="thumb">${text}</div>
  <script>
    // Shrink the headline until it's at most 3 lines, no word is cut, and the
    // whole text block fits its box (a short topic stays big and bold).
    (function(){
      var h=document.getElementById("headline"), box=document.getElementById("box"), inner=document.getElementById("inner");
      if(!h||!box||!inner) return;
      var size=104;
      function over(){
        var lines=Math.round(h.offsetHeight/(size*1.05));
        return lines>3 || h.scrollWidth>h.clientWidth+4 || inner.scrollHeight>box.clientHeight-4;
      }
      while(size>36 && over()){ size-=4; h.style.fontSize=size+"px"; }
    })();
  </script></body></html>`;
}

// Render the thumbnail → { image: Buffer, mime } | { error }. Never throws.
export async function renderYoutubeThumbnail(opts = {}) {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: THUMB_W, height: THUMB_H, deviceScaleFactor: 1 });
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
