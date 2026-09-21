// Detects INCOMPLETE questions for the admin "Find incomplete questions" tool.
// It validates the same effective options the question card renders, including
// deterministic Assertion and valid Pair fallbacks, plus each type's structure.
// Returns an array of human-readable issue strings; empty = complete.

import { displayOptions, normalizeColumn } from "./questions.js";

const isBlank = (v) => !String(v ?? "").trim();
const nonEmptyCount = (arr) => (Array.isArray(arr) ? arr.filter((x) => !isBlank(x)).length : 0);

export function questionIssues(q) {
  if (!q) return ["Missing question"];
  const issues = [];

  // --- Common to every type ------------------------------------------------
  if (isBlank(q.text)) issues.push("Missing question text");

  // Validate the choices users actually see. Assertion choices and complete
  // 3/4-row Pair count choices are deterministic, so their safe display
  // fallbacks are real answer options rather than "blank" content.
  const opts = displayOptions(q);
  if (opts.length === 0) {
    issues.push("No options");
  } else {
    if (opts.length !== 4) issues.push(`Has ${opts.length} option(s) (expected 4)`);
    if (opts.some((o) => isBlank(o))) issues.push("Blank option(s)");
  }

  const hasCorrect = Number.isInteger(q.correct) && q.correct >= 0 && q.correct < opts.length;
  if (!hasCorrect) issues.push("No correct answer marked");

  // --- Type-specific structural parts -------------------------------------
  switch (q.type) {
    case "matching":
    case "pair":
    case "pairselect": {
      const columnA = normalizeColumn(q.columnA);
      const columnB = normalizeColumn(q.columnB);
      if (columnA.length === 0) issues.push("Missing Column A");
      if (columnB.length === 0) issues.push("Missing Column B");
      if (q.type === "pair") {
        if (Array.isArray(q.columnA) && q.columnA.some(isBlank)) issues.push("Blank Column A item(s)");
        if (Array.isArray(q.columnB) && q.columnB.some(isBlank)) issues.push("Blank Column B item(s)");
        if (columnA.length && columnB.length && columnA.length !== columnB.length) issues.push("Pair columns have different lengths");
        if (columnA.length === columnB.length && columnA.length > 0 && ![3, 4].includes(columnA.length)) issues.push("Pair needs 3 or 4 rows");
      }
      break;
    }
    case "statement":
      if (nonEmptyCount(q.columnA) === 0) issues.push("Missing statements");
      break;
    case "rearrange":
      if (nonEmptyCount(q.columnA) < 2) issues.push("Missing sentences to rearrange");
      break;
    case "assertion":
      if (isBlank(q.assertion)) issues.push("Missing Assertion");
      if (isBlank(q.reason)) issues.push("Missing Reason");
      break;
    case "table":
    case "journal":
    case "ledger":
      if (!Array.isArray(q.tableRows) || q.tableRows.length === 0) issues.push("Missing table rows");
      break;
    case "diagram":
      if (!q.viz && !q.graph) issues.push("Missing diagram spec");
      break;
    case "image":
      if (isBlank(q.image)) issues.push("Missing image");
      break;
    default:
      break;
  }

  return issues;
}

export const isQuestionIncomplete = (q) => questionIssues(q).length > 0;

// Short one-line stem preview for lists (strips $…$ math markers, trims).
export function stemPreview(q, n = 90) {
  const s = String(q?.text || "").replace(/\$/g, "").replace(/\s+/g, " ").trim() || "(no text)";
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
