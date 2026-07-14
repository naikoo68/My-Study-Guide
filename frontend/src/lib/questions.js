// Shared helpers for question lists (used across Content, Tests, Practice).

// Format a date as "12 Jul 2026, 11:05 AM" — always 12-hour with AM/PM
// (hour12:true) so it never shows 24-hour time regardless of browser locale.
export const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("en-US", { day: "2-digit", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true }) : "";

// Upload date of a question. Uses `createdAt` when present; otherwise derives it
// from the Mongo `_id` — every ObjectId embeds its creation time in the first 4
// bytes — so questions uploaded before timestamps were tracked STILL show an
// accurate date, with no data migration needed.
export function questionDate(item) {
  if (item?.createdAt) return new Date(item.createdAt);
  const id = String(item?._id || item?.id || "");
  if (/^[a-f\d]{24}$/i.test(id)) return new Date(parseInt(id.substring(0, 8), 16) * 1000);
  return null;
}

// Formatted upload date/time for a question ("" if unknown).
export const questionDateText = (item) => {
  const d = questionDate(item);
  return d ? fmtDateTime(d) : "";
};

// Search relevance 0–100%. Full phrase present → 100%; otherwise the share of
// query words found in the question's text/options/explanation/etc. The UI
// shows results at 40%+.
export function matchPercent(query, item) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return 0;
  const hay = [item.text, ...(item.options || []), item.explanation, item.topic, item.section, item.assertion, item.reason]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!hay) return 0;
  if (hay.includes(q)) return 100;
  const words = q.split(/\s+/).filter(Boolean);
  if (!words.length) return 0;
  const matched = words.filter((w) => hay.includes(w)).length;
  return Math.round((matched / words.length) * 100);
}

// Apply a search query to a list of questions → 40%+ matches sorted best-first,
// each tagged with `_match` (the %). Returns null when the query is empty.
export function searchQuestions(list, query) {
  const q = String(query || "").trim();
  if (!q) return null;
  return (list || [])
    .map((it) => ({ ...it, _match: matchPercent(q, it) }))
    .filter((it) => it._match >= 40)
    .sort((a, b) => b._match - a._match);
}
