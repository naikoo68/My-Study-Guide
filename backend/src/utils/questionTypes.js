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

// "Split by weights": chunk question docs (each needing `_id` + `type`) into
// quizzes of `per`, where EACH quiz is composed ~50% plain MCQ and ~50% the
// OTHER question types present, split as EVENLY as possible across those types.
// Returns an array of chunks (arrays of ids), in order — chunk 0 is the first
// quiz. Every question is used exactly once and no id is duplicated.
//
// Design decisions (see the split UI help text):
//  - Half rounds UP to MCQ, so an odd quiz size (e.g. 25 → 13 MCQ + 12 others).
//  - The non-MCQ half is dealt round-robin across the present non-MCQ types in
//    the standard TYPE_ORDER, so earlier types get the extra when it doesn't
//    divide evenly (e.g. 12 across 5 types → 3,3,2,2,2).
//  - Scarce MCQs are spread EVENLY across all quizzes (early quizzes don't hoard
//    them) and MCQ demand is capped at what exists.
//  - If a pool runs dry, the shortfall is back-filled from whatever remains so
//    each quiz still reaches its target size (only the final quiz may be smaller
//    when the questions simply run out).
export function balancedMixChunks(questions, per) {
  const size = Math.max(1, per);
  const list = questions || [];
  if (!list.length) return [];

  // Plain-MCQ ids in one pool; every other present type in its own pool, kept in
  // TYPE_ORDER, each preserving input order.
  const groups = groupByType(list);
  let mcqPool = [];
  const otherPools = [];
  for (const g of groups) {
    if (g.typeKey === "mcq") mcqPool = [...g.ids];
    else otherPools.push([...g.ids]);
  }

  const otherRemaining = () => otherPools.reduce((a, p) => a + p.length, 0);
  const remaining = () => mcqPool.length + otherRemaining();

  // Deal up to `n` ids round-robin across the non-empty "other" pools so the
  // non-MCQ half is spread as evenly as possible across those types.
  const takeOthers = (n) => {
    const out = [];
    let progressed = true;
    while (out.length < n && progressed) {
      progressed = false;
      for (const pool of otherPools) {
        if (out.length >= n) break;
        if (pool.length) { out.push(pool.shift()); progressed = true; }
      }
    }
    return out;
  };

  const total = list.length;
  const numQuizzes = Math.ceil(total / size);
  const chunks = [];
  for (let q = 0; q < numQuizzes; q++) {
    const left = remaining();
    if (!left) break;
    const thisSize = Math.min(size, left);
    const quizzesLeft = numQuizzes - q;

    // Target ~half MCQ, but never more MCQs than exist and spread a scarce MCQ
    // pool evenly over the remaining quizzes rather than front-loading it.
    const half = Math.ceil(thisSize / 2);
    const mcqEven = Math.ceil(mcqPool.length / quizzesLeft);
    let mcqTake = Math.min(half, mcqEven, mcqPool.length);
    let otherTake = thisSize - mcqTake;
    // Not enough "other" questions to fill the non-MCQ half → give slots to MCQ.
    if (otherTake > otherRemaining()) {
      const shortfall = otherTake - otherRemaining();
      otherTake -= shortfall;
      mcqTake = Math.min(mcqTake + shortfall, mcqPool.length);
    }

    const chunk = [];
    for (let i = 0; i < mcqTake && mcqPool.length; i++) chunk.push(mcqPool.shift());
    chunk.push(...takeOthers(otherTake));
    // Back-fill any residual shortfall from whatever's left (MCQ first, then others).
    while (chunk.length < thisSize && mcqPool.length) chunk.push(mcqPool.shift());
    if (chunk.length < thisSize) chunk.push(...takeOthers(thisSize - chunk.length));
    if (chunk.length) chunks.push(chunk);
  }
  return chunks;
}
