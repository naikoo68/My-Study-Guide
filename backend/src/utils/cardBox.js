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

// → { top, bottom, side } or null (= defaults). Keeps at least 30% of the
// template's height and 40% of its width for the card.
export function cleanCardBox(v) {
  if (!v || typeof v !== "object") return null;
  const n = (x) => Number(x);
  if (![v.top, v.bottom, v.side].every((x) => Number.isFinite(n(x)))) return null;
  let top = clamp(n(v.top), 0, 0.45);
  let bottom = clamp(n(v.bottom), 0, 0.45);
  if (top + bottom > 0.7) { const k = 0.7 / (top + bottom); top *= k; bottom *= k; }
  const side = clamp(n(v.side), 0, 0.3);
  return { top: r3(top), bottom: r3(bottom), side: r3(side) };
}

// The `cb` screenshot param ("top,bottom,side") or "" for the defaults.
export function cardBoxParam(v) {
  const b = cleanCardBox(v);
  return b ? `${b.top},${b.bottom},${b.side}` : "";
}
