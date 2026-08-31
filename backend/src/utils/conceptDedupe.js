// Helpers for de-duplicating AI-suggested subject / topic names.
//
// We only collapse TRUE string-level duplicates here (case, punctuation,
// spacing and a leading article like "The"). We deliberately do NOT try to
// merge names by shared words, because token/subset heuristics wrongly delete
// legitimately-distinct items — e.g. "Algebra" vs "Linear Algebra", "Physics"
// vs "Modern Physics", "The Renaissance" vs "The Reformation". Semantic
// near-duplicates and overlaps (synonyms, "X and Y" combos) are handled by a
// separate AI clean-up pass that understands meaning.

// Normalise a name for exact duplicate detection.
export function normName(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/^\s*(the|a|an)\s+/, "") // drop a single leading article
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ") // punctuation → space
    .replace(/\s+/g, " ")
    .trim();
}

// Return `items` with exact-normalised duplicates removed (first kept) and with
// anything matching an `existingNames` entry dropped. `getName` maps an item to
// its display name/title.
export function dedupeExact(items, getName = (x) => x, existingNames = []) {
  const blocked = new Set((existingNames || []).map((n) => normName(n)).filter(Boolean));
  const seen = new Set();
  const out = [];
  for (const it of items || []) {
    const k = normName(getName(it));
    if (!k || blocked.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

// Extract complete `{ ... }` JSON objects from a possibly-truncated model reply.
// Used as a fallback when the whole `[ ... ]` array can't be JSON.parsed because
// the response was cut off mid-array — so we keep every COMPLETE item instead of
// losing the entire list. Returns an array of parsed objects (may be empty).
export function salvageObjects(text) {
  const out = [];
  const s = String(text || "");
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === "\\") esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === "{") { if (depth === 0) start = i; depth++; }
    else if (c === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        try { out.push(JSON.parse(s.slice(start, i + 1))); } catch { /* skip a malformed fragment */ }
        start = -1;
      }
    }
  }
  return out;
}
