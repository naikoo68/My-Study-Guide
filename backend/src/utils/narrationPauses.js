// Pause marks in narration text — a real silence between words, the same on
// every voice engine (the free ones don't support SSML breaks):
//   "Thanks for watching! [pause] Subscribe, like and share."   → 1 s pause
//   "Accounting [pause 2] Basic Terminologies"                  → 2 s pause
//   "[pause 0.5]", "[p]", "[p 1.5]", "[2s]"                       → also accepted
// Seconds are clamped to 0.1–10. Pure.
const PAUSE_RE = /\[\s*(?:pause|p)?\s*(\d+(?:\.\d+)?)?\s*s?\s*\]/gi;
export const DEFAULT_PAUSE_SEC = 1;

const isPauseMark = (m) => /\[\s*(?:pause|p)\b/i.test(m) || /\[\s*\d+(?:\.\d+)?\s*s\s*\]/i.test(m);

// → [{ text }, { pause: seconds }, …] in order; empty text parts are dropped.
export function splitNarrationPauses(text) {
  const src = String(text ?? "");
  const out = [];
  let last = 0;
  for (const m of src.matchAll(PAUSE_RE)) {
    if (!isPauseMark(m[0])) continue;
    const before = src.slice(last, m.index).trim();
    if (before) out.push({ text: before });
    const sec = m[1] !== undefined ? Number(m[1]) : DEFAULT_PAUSE_SEC;
    const pause = Math.max(0.1, Math.min(10, Number.isFinite(sec) ? sec : DEFAULT_PAUSE_SEC));
    const prev = out[out.length - 1];
    if (prev && prev.pause !== undefined) prev.pause = Math.min(10, prev.pause + pause); // [pause][pause] → longer
    else out.push({ pause });
    last = m.index + m[0].length;
  }
  const rest = src.slice(last).trim();
  if (rest) out.push({ text: rest });
  return out;
}

export const hasNarrationPauses = (text) => splitNarrationPauses(text).some((p) => p.pause !== undefined);

// The text without its pause marks (for captions / on-screen text).
export function stripNarrationPauses(text) {
  return splitNarrationPauses(text).filter((p) => p.text).map((p) => p.text).join(" ").replace(/\s+/g, " ").trim();
}
