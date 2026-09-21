// Decide whether a question has all the CONTENT its type needs to render a
// correct card. The auto-poster (Facebook/Instagram — post, reel, story) uses
// this to SKIP incomplete questions instead of publishing a broken/half-empty
// card (e.g. a flashcard with a blank answer, or an MCQ with a missing option).
//
// "Complete" is defined per question type, matching what the card actually
// draws (see config/socialImage.js and the /q-card + /flashcard pages):
//   • every question:      a non-empty stem (text)
//   • answer options:      present, none blank, with a valid `correct` index
//   • statement:           the statements list (columnA)
//   • matching/pair types: BOTH columns (columnA + columnB)
//   • assertion:           both the assertion AND the reason
//   • table:               a non-empty table (tableRows)
// Anything not required by a type is left alone (e.g. we don't force an image
// on an image question or key-points on a flashcard — only the content whose
// absence would visibly break the card).

// Question types whose card shows the two matching columns to the student.
const COLUMN_TYPES = new Set(["matching", "pair", "pairselect"]);

const asText = (v) => String(v ?? "").trim();
const isFilled = (v) => asText(v) !== "";
// An array counts as filled only when it has at least one entry and NONE of its
// entries are blank — so "one missing option/statement" is treated as missing.
const isArrFilled = (a) => Array.isArray(a) && a.length > 0 && a.every(isFilled);

// A table is filled when it has at least one row and every cell has content.
function isTableFilled(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return false;
  return rows.every((row) => Array.isArray(row) && row.length > 0 && row.every(isFilled));
}

// Returns { ok: true } when the question can be safely posted, or
// { ok: false, reason } listing the missing content (for logs / admin notices).
export function isQuestionComplete(q) {
  if (!q || typeof q !== "object") return { ok: false, reason: "missing question" };

  const type = asText(q.type) || "mcq";
  const missing = [];

  // Every card renders the stem.
  if (!isFilled(q.text)) missing.push("question text");

  // Answer options + a valid correct index. Every quiz question type in this
  // app presents options as the answer choices, so this applies across types.
  const options = Array.isArray(q.options) ? q.options : [];
  if (options.length === 0 || options.some((o) => !isFilled(o))) {
    missing.push("options");
  } else if (!(Number.isInteger(q.correct) && q.correct >= 0 && q.correct < options.length)) {
    missing.push("correct answer");
  }

  // Type-specific content shown on the card.
  if (type === "statement") {
    if (!isArrFilled(q.columnA)) missing.push("statements");
  } else if (COLUMN_TYPES.has(type)) {
    if (!isArrFilled(q.columnA)) missing.push("column A");
    if (!isArrFilled(q.columnB)) missing.push("column B");
  } else if (type === "assertion") {
    if (!isFilled(q.assertion)) missing.push("assertion");
    if (!isFilled(q.reason)) missing.push("reason");
  } else if (type === "table") {
    if (!isTableFilled(q.tableRows)) missing.push("table rows");
  }

  return missing.length ? { ok: false, reason: `missing ${missing.join(", ")}` } : { ok: true };
}
