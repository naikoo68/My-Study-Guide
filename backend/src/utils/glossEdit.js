// Accept an AI's "gloss-removed" version of a stem / option ONLY when the ONLY
// change is dropping bracketed glosses — e.g.
//   "Insurance Expense (bima vyay)"                        → "Insurance Expense"
//   "… 'Non-Operating Income' (income from secondary activities; 'gair-sanchalan aay') …"
//                                                          → "… (income from secondary activities) …"
// Anything else (a reworded sentence, a changed number, a different option) is
// rejected, so Extend / Regenerate can clean glosses without ever changing what
// a question says. Pure.

const norm = (s) => String(s ?? "")
  .replace(/\s+/g, " ")
  .replace(/\s+([,.;:!?)\]])/g, "$1")
  .replace(/([([])\s+/g, "$1")
  .trim();

// Split into plain text and top-level (...) groups.
function segments(s) {
  const out = [];
  let buf = "", depth = 0, grp = "";
  for (const ch of String(s ?? "")) {
    if (ch === "(") {
      if (depth === 0) { if (buf) out.push({ t: buf }); buf = ""; grp = ""; } else grp += ch;
      depth++;
    } else if (ch === ")" && depth > 0) {
      depth--;
      if (depth === 0) out.push({ g: grp }); else grp += ch;
    } else if (depth > 0) grp += ch;
    else buf += ch;
  }
  if (depth > 0) buf += `(${grp}`; // unbalanced → plain text
  if (buf) out.push({ t: buf });
  return out;
}
const parts = (g) => g.split(/\s*;\s*/).map((x) => norm(x)).filter(Boolean);

// Is `cleaned` = `orig` with some (...) groups removed, or trimmed to a subset
// of their ";"-separated parts, each kept group staying in its PLACE?
// (whitespace/punctuation spacing ignored)
const squash = (s) => String(s).replace(/[\s,.;:!?]+/g, "");
function layout(s) {
  const segs = segments(norm(s));
  let at = 0, text = "";
  const groups = [];
  for (const x of segs) {
    if (x.t != null) { text += x.t; at += squash(x.t).length; } else groups.push({ at, parts: parts(x.g) });
  }
  return { text: squash(text), groups };
}
export function isGlossOnlyEdit(orig, cleaned) {
  const a = norm(orig), b = norm(cleaned);
  if (!b) return false;
  if (a === b) return true;
  const A = layout(a), B = layout(b);
  if (A.text !== B.text) return false; // the words outside brackets must be identical
  let j = 0;
  for (const bg of B.groups) {
    while (j < A.groups.length && !(A.groups[j].at === bg.at && bg.parts.length && bg.parts.every((w) => A.groups[j].parts.includes(w)))) j++;
    if (j >= A.groups.length) return false;
    j++;
  }
  return true;
}

// Pick the AI's cleaned value when it is a gloss-only edit of the original.
export const glossCleaned = (orig, cleaned) => (typeof cleaned === "string" && isGlossOnlyEdit(orig, cleaned) && norm(cleaned) !== norm(orig) ? norm(cleaned) : null);

// The bracket groups that a gloss-only edit dropped or trimmed, as
// [{ from: "(bima vyay)", to: "" }, { from: "(income …; 'gair-sanchalan aay')", to: "(income …)" }].
export function glossReplacements(orig, cleaned) {
  if (!isGlossOnlyEdit(orig, cleaned)) return [];
  const A = segments(norm(orig)).filter((x) => x.g != null).map((x) => x.g);
  const B = segments(norm(cleaned)).filter((x) => x.g != null).map((x) => parts(x.g));
  const out = [];
  let j = 0;
  for (const g of A) {
    const p = parts(g);
    if (j < B.length && B[j].every((w) => p.includes(w))) {
      if (B[j].length < p.length) out.push({ from: `(${g})`, to: `(${B[j].join("; ")})` });
      j++;
    } else out.push({ from: `(${g})`, to: "" });
  }
  return out;
}

// Apply those replacements to free text (explanations / option notes), so a
// gloss removed from the question is also removed wherever it is repeated.
export function applyGlossReplacements(text, reps) {
  let s = String(text ?? "");
  for (const { from, to } of reps || []) {
    const esc = from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\s|\s+/g, "\\s+");
    s = s.replace(new RegExp(to ? esc : `\\s*${esc}`, "gi"), to);
  }
  return s.replace(/[ \t]+([,.;:!?])/g, "$1").replace(/[ \t]{2,}/g, " ");
}
