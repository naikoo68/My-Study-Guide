// Admins number their streams / subjects / topics / quizzes to order the list,
// e.g. "A) Basic Terminologies", "B) Journal Entries", "1) Intro", "(C) JKSSB".
// That prefix is only for sorting — viewers should see and HEAR just the name
// ("Basic Terminologies"), in titles, thumbnails, slides, narration, captions,
// breadcrumbs and hashtags. The stored names (and the admin lists) are unchanged.
//
// Stripped (once, at the start): "A)", "(A)", "a)", "A.", "1)", "(1)", "12.",
// "A -" / "1 –" style dashes. A lone letter + dot needs a space after it, so
// "U.S. History" is left alone. Never returns an empty string for a non-empty
// name (if the whole name is the prefix, it is kept).
const ORDER_PREFIX = /^\s*(?:\(\s*(?:[A-Za-z]|\d{1,3})\s*\)\s*|(?:[A-Za-z]|\d{1,3})\s*\)\s*|(?:[A-Za-z]|\d{1,3})\.\s+|(?:[A-Za-z]|\d{1,3})\s+[-–—]\s+)/;

export function displayName(name) {
  const s = String(name ?? "").trim();
  if (!s) return "";
  const out = s.replace(ORDER_PREFIX, "").trim();
  return out || s;
}

// A "Stream › Subject › Topic" trail (or "A | B") with every part cleaned.
export function displayTrail(label, sep = /\s*(›|\|)\s*/) {
  return String(label ?? "")
    .split(sep)
    .map((p) => (p === "›" || p === "|" ? ` ${p} ` : displayName(p)))
    .join("")
    .trim();
}
