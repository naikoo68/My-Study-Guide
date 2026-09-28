// YouTube THUMBNAIL from the admin's uploaded template (Admin → Facebook →
// YouTube long videos → Thumbnail template). The template is the background
// (1280×720, 16:9); the video's subject / topic / "25 Questions" are written on
// it in big bold text (optional), in the empty area the admin chooses.
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

// The HTML page for one thumbnail. Pure (tested).
//   templateUrl — background image (blank → a plain brand-colour background)
//   lines       — { kicker, headline, badge } (see thumbnailLines in youtube.js)
//   showText    — false → the template alone
//   position    — left | center | right | bottom (where the text block sits)
export function buildThumbnailHtml({ templateUrl = "", lines = {}, showText = true, position = "left", textColor = "#ffffff", accentColor = "#facc15", brandColor = "#2563eb" } = {}) {
  const pos = ["left", "center", "right", "bottom"].includes(position) ? position : "left";
  const color = hex(textColor, "#ffffff");
  const accent = hex(accentColor, "#facc15");
  const bg = templateUrl
    ? `background:#000 url("${esc(templateUrl)}") center/cover no-repeat;`
    : `background:linear-gradient(135deg, ${hex(brandColor, "#2563eb")}, #0f172a);`;
  const box = {
    left: "left:64px;top:0;bottom:0;width:62%;justify-content:center;align-items:flex-start;text-align:left;",
    right: "right:64px;top:0;bottom:0;width:62%;justify-content:center;align-items:flex-end;text-align:right;",
    center: "left:80px;right:80px;top:0;bottom:0;justify-content:center;align-items:center;text-align:center;",
    bottom: "left:64px;right:64px;bottom:72px;height:50%;justify-content:flex-end;align-items:flex-start;text-align:left;",
  }[pos];
  const { kicker = "", headline = "", badge = "" } = lines || {};
  const text = showText && (kicker || headline || badge)
    ? `<div id="box" style="position:absolute;display:flex;flex-direction:column;${box}">
        <div id="inner" style="display:flex;flex-direction:column;gap:18px;width:100%;align-items:inherit">
          ${kicker ? `<div class="kicker">${esc(kicker)}</div>` : ""}
          ${headline ? `<div id="headline" class="headline">${esc(headline)}</div>` : ""}
          ${badge ? `<div class="badge">${esc(badge)}</div>` : ""}
        </div>
      </div>`
    : "";
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${THUMB_W}px;height:${THUMB_H}px;overflow:hidden}
    body{font-family:"Inter","Noto Sans","Noto Sans Devanagari","DejaVu Sans",Arial,sans-serif}
    #thumb{position:relative;width:${THUMB_W}px;height:${THUMB_H}px;${bg}}
    .kicker{font-size:44px;font-weight:800;color:${color};text-transform:uppercase;letter-spacing:1px;
      text-shadow:0 3px 10px rgba(0,0,0,.75)}
    .headline{font-size:112px;line-height:1.05;font-weight:900;color:${color};width:100%;
      overflow-wrap:break-word;-webkit-text-stroke:3px rgba(0,0,0,.55);paint-order:stroke fill;
      text-shadow:0 6px 18px rgba(0,0,0,.8)}
    .badge{display:inline-block;font-size:48px;font-weight:900;color:#111;background:${accent};
      padding:8px 26px;border-radius:14px;box-shadow:0 6px 18px rgba(0,0,0,.45)}
  </style></head><body><div id="thumb">${text}</div>
  <script>
    // Shrink the headline until it's at most 3 lines, no word is cut, and the
    // whole text block fits its area (a short topic stays big and bold).
    (function(){
      var h=document.getElementById("headline"), box=document.getElementById("box"), inner=document.getElementById("inner");
      if(!h||!box||!inner) return;
      var size=112;
      function over(){
        var lines=Math.round(h.offsetHeight/(size*1.05));
        return lines>3 || h.scrollWidth>h.clientWidth+4 || inner.offsetHeight>box.clientHeight-16;
      }
      while(size>44 && over()){ size-=4; h.style.fontSize=size+"px"; }
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
