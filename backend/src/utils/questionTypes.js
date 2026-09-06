// Shared question-TYPE helpers. Mirrors the frontend's QUESTION_TYPE_LABELS
// (frontend/src/lib/questions.js) so "split by question type" names the new
// quizzes exactly like the badges/filters the admin already sees.

// Human-readable label per question type.
export const QUESTION_TYPE_LABELS = {
  mcq: "MCQ",
  numericalmcq: "Numerical MCQ",
  assertion: "Assertion & Reason",
  matching: "Matching",
  statement: "Statement",
  pair: "Pair",
  pairselect: "Pair-select",
  table: "Table",
  image: "Image",
  journal: "Journal Entry",
  ledger: "Ledger Posting",
  rearrange: "Sentence Rearrangement",
  diagram: "Diagram",
};

// Stable display order so a type-split always produces quizzes in the same,
// sensible sequence (plain MCQ first). Types not listed collapse to "mcq".
export const TYPE_ORDER = [
  "mcq", "numericalmcq", "assertion", "matching", "statement",
  "pair", "pairselect", "table", "image", "journal", "ledger",
  "rearrange", "diagram",
];

// The canonical TYPE key for a question — anything unknown/blank is a plain MCQ.
export const typeKeyOf = (q) => (QUESTION_TYPE_LABELS[q?.type] ? q.type : "mcq");

// Group question docs (each needing at least `_id` and `type`) by type key.
// Returns ordered groups [{ typeKey, label, ids: [...] }] following TYPE_ORDER,
// including ONLY the types actually present. Ids preserve their input order.
export function groupByType(questions) {
  const byKey = new Map();
  for (const q of questions || []) {
    const k = typeKeyOf(q);
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k).push(q._id);
  }
  return TYPE_ORDER
    .filter((k) => byKey.has(k))
    .map((k) => ({ typeKey: k, label: QUESTION_TYPE_LABELS[k], ids: byKey.get(k) }));
}

// Make `label` unique against a set of already-used (lower-cased) names by
// appending " (2)", " (3)", … so a type-named quiz never clobbers an existing
// same-named sibling. Mutates `usedLower` to record the returned name.
export function uniqueName(label, usedLower) {
  let name = label;
  let n = 2;
  while (usedLower.has(name.toLowerCase())) name = `${label} (${n++})`;
  usedLower.add(name.toLowerCase());
  return name;
}
