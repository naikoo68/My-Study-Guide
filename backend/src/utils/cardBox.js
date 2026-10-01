// Where the white question / answer card sits on an uploaded slide TEMPLATE.
// Stored as fractions of the template ({ top, bottom, side }: free space above,
// below and on each side), so it works for any template size. Templates differ
// — a tall logo or a row of icons at the bottom needs more space there, or the
// card covers them. null / missing = the built-in defaults below (unchanged
// from the old fixed boxes, so existing templates keep their layout).
//
// Pure (no DB) — shared rules for saving and for the screenshot URL.

// Old fixed boxes: 16:9 card {left 110, top 190, w 1700, h 740} on 1920×1080;
// 9:16 card {left 50, top 300, w 980, h 1360} on 1080×1920.
export const DEFAULT_CARD_BOX = {
  landscape: { top: 0.176, bottom: 0.139, side: 0.057 },
  portrait: { top: 0.156, bottom: 0.135, side: 0.046 },
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r3 = (v) => Math.round(v * 1000) / 1000;

// Opacity of the card's white background (0 = see-through, the template shows
// behind the text) and of the quiz content on it (text + option boxes). Text
// never goes below 10% so it can't vanish completely.
export const DEFAULT_CARD_OPACITY = 0.94;
export const DEFAULT_TEXT_OPACITY = 1;

// → { top, bottom, side, card, text } or null (= defaults). Keeps at least 30%
// of the template's height and 40% of its width for the card. Older saves
// without card / text get the defaults.
export function cleanCardBox(v) {
  if (!v || typeof v !== "object") return null;
  const n = (x) => Number(x);
  if (![v.top, v.bottom, v.side].every((x) => Number.isFinite(n(x)))) return null;
  let top = clamp(n(v.top), 0, 0.45);
  let bottom = clamp(n(v.bottom), 0, 0.45);
  if (top + bottom > 0.7) { const k = 0.7 / (top + bottom); top *= k; bottom *= k; }
  const side = clamp(n(v.side), 0, 0.3);
  const op = (x, d, lo) => (x === undefined || x === null || x === "" || !Number.isFinite(n(x)) ? d : clamp(n(x), lo, 1));
  const logos = cleanLogos(v);
  return {
    top: r3(top), bottom: r3(bottom), side: r3(side),
    card: r3(op(v.card, DEFAULT_CARD_OPACITY, 0)),
    text: r3(op(v.text, DEFAULT_TEXT_OPACITY, 0.1)),
    ...(logos.length ? { logos } : {}),
  };
}

// Several images can be placed on a template (logos, emoji, badges…).
export const MAX_TEMPLATE_IMAGES = 5;
// { logos:[…] } (or an older single { logo }) → clean list, in drawing order
// (later ones on top).
export function cleanLogos(v) {
  const raw = Array.isArray(v?.logos) ? v.logos : v?.logo ? [v.logo] : [];
  return raw.map(cleanLogo).filter(Boolean).slice(0, MAX_TEMPLATE_IMAGES);
}

// An extra image (logo / sticker / badge) placed ANYWHERE on the template:
// { url, x, y, w, opacity } — x / y = its top-left corner and w = its width,
// all as fractions of the template; the height follows the image. Only a
// hosted https image (it goes into the screenshot URL). → object | null.
export function cleanLogo(v) {
  if (!v || typeof v !== "object") return null;
  const url = String(v.url || "").trim();
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url) || url.length > 1000) return null;
  const n = (x, d) => (Number.isFinite(Number(x)) ? Number(x) : d);
  const w = clamp(n(v.w, 0.15), 0.02, 0.8);
  return {
    url,
    w: r3(w),
    x: r3(clamp(n(v.x, 0.02), 0, 1 - w)),
    y: r3(clamp(n(v.y, 0.02), 0, 0.98)),
    opacity: r3(clamp(n(v.opacity, 1), 0.05, 1)),
  };
}

// The images for the screenshot URL: [{ url, pos: "x,y,w,opacity" }, …].
export function cardBoxLogos(v) {
  return (cleanCardBox(v)?.logos || []).map((l) => ({ url: l.url, pos: `${l.x},${l.y},${l.w},${l.opacity}` }));
}

// The `cb` screenshot param ("top,bottom,side,card,text") or "" for the defaults.
export function cardBoxParam(v) {
  const b = cleanCardBox(v);
  return b ? `${b.top},${b.bottom},${b.side},${b.card},${b.text}` : "";
}
