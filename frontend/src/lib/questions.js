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

// Every piece of searchable text for a question, covering ALL question types:
//  - mcq:        text, options, per-option explanations, explanation
//  - assertion:  assertion (A) + reason (R) statements
//  - matching:   columnA + columnB (the two matched columns)
//  - statement:  columnA (the numbered statements)
//  - pair/pairselect: columnA + columnB (the left/right pairs)
//  - table:      every cell in tableRows (header + body)
//  plus shared metadata (topic, section). So a search hits meaning found in the
//  question body OR the options OR any type-specific part — not just the stem.
function questionHaystack(item) {
  const parts = [
    item.text,
    item.explanation,
    item.topic,
    item.section,
    item.assertion,
    item.reason,
    ...(item.options || []),
    ...(item.optionExplanations || []),
    ...(item.columnA || []),
    ...(item.columnB || []),
    ...(Array.isArray(item.tableRows) ? item.tableRows.flat(Infinity) : []),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

// Option labels that must NOT count as search words (roman numerals ii–xv;
// single letters a/b/c/d and lone digits 1/2 are dropped by the length rule).
const OPTION_LABELS = new Set(["ii", "iii", "iv", "vi", "vii", "viii", "ix", "xi", "xii", "xiii", "xiv", "xv"]);

// Meaningful words from a query. Splits on ANY non-alphanumeric char so option
// labels like "(a)", "1.", "(ii)" detach from the real word ("(a)Dual" → "dual"),
// then drops single letters, lone digits and roman-numeral labels — so search
// keys off the question body only, never the option marker or its place.
const meaningfulWords = (query) => [
  ...new Set(
    String(query || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/i)
      .filter((w) => w.length >= 2 && !OPTION_LABELS.has(w))
  ),
];

// Search relevance 0–100%. Full phrase present anywhere in the question → 100%;
// otherwise the share of meaningful query WORDS found (word-level, not whole-
// phrase, ignoring option labels), so a query matches even when its words are
// split across the body and the options. The UI shows results at 40%+.
export function matchPercent(query, item) {
  const q = String(query || "").toLowerCase().trim();
  if (!q) return 0;
  const hay = questionHaystack(item);
  if (!hay) return 0;
  if (hay.includes(q)) return 100;
  const words = meaningfulWords(query);
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
