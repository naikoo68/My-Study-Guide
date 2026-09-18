// Detects INCOMPLETE questions for the admin "Find incomplete questions" tool.
// For EVERY type it checks the question text, the 4 options (present, none
// blank) and a marked correct answer, PLUS the structural parts each type needs
// (columns, statements, assertion/reason, table rows, diagram spec, sentences).
// Returns an array of human-readable issue strings; empty = complete.

const isBlank = (v) => !String(v ?? "").trim();
const nonEmptyCount = (arr) => (Array.isArray(arr) ? arr.filter((x) => !isBlank(x)).length : 0);

export function questionIssues(q) {
  if (!q) return ["Missing question"];
  const issues = [];

  // --- Common to every type ------------------------------------------------
  if (isBlank(q.text)) issues.push("Missing question text");

  const opts = Array.isArray(q.options) ? q.options : [];
  if (opts.length === 0) {
    issues.push("No options");
  } else {
    if (opts.length !== 4) issues.push(`Has ${opts.length} option(s) (expected 4)`);
    if (opts.some((o) => isBlank(o))) issues.push("Blank option(s)");
  }

  const hasCorrect = typeof q.correct === "number" && q.correct >= 0 && q.correct < (opts.length || 4);
  if (!hasCorrect) issues.push("No correct answer marked");

  // --- Type-specific structural parts -------------------------------------
  switch (q.type) {
    case "matching":
    case "pair":
    case "pairselect":
      if (nonEmptyCount(q.columnA) === 0) issues.push("Missing Column A");
      if (nonEmptyCount(q.columnB) === 0) issues.push("Missing Column B");
      break;
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
