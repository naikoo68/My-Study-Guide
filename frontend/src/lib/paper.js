// Build a printable A4 "question paper" or "answer key" from a list of question
// objects and open it in a print window (→ Save as PDF). Handles every question
// type (mcq, matching, statement, pair/pairselect, assertion, table) and renders
// inline $…$ math with KaTeX. No extra dependency — uses the browser's print.
import katex from "katex";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Render a string with inline ($…$) / block ($$…$$) math; everything else escaped.
function inline(text) {
  const t = String(text == null ? "" : text);
  const re = /\$\$([^$]+)\$\$|\$([^$]+)\$/g;
  let out = "";
  let last = 0;
  let m;
  while ((m = re.exec(t)) !== null) {
    if (m.index > last) out += esc(t.slice(last, m.index));
    try { out += katex.renderToString(m[1] ?? m[2], { throwOnError: false, displayMode: m[1] != null }); }
    catch { out += esc(m[0]); }
    last = re.lastIndex;
  }
  if (last < t.length) out += esc(t.slice(last));
  return out;
}

export const answerLetter = (q) => (typeof q?.correct === "number" && q.correct >= 0 ? (LETTERS[q.correct] || "?") : "—");

function questionBlock(q, idx, withAnswers) {
  const parts = [`<div class="q"><p class="stem"><b>${idx + 1}.</b> ${inline(q.text)}</p>`];
  const A = (q.columnA || []).map((x) => String(x)).filter((x) => x.trim());
  const B = (q.columnB || []).map((x) => String(x)).filter((x) => x.trim());

  if (q.type === "assertion") {
    if (q.assertion) parts.push(`<p class="sub"><b>Assertion (A):</b> ${inline(q.assertion)}</p>`);
    if (q.reason) parts.push(`<p class="sub"><b>Reason (R):</b> ${inline(q.reason)}</p>`);
  } else if (q.type === "statement") {
    parts.push(`<div class="lst">${A.map((s, i) => `<div>${i + 1}. ${inline(s)}</div>`).join("")}</div>`);
  } else if (q.type === "pair" || q.type === "pairselect") {
    const n = Math.max(A.length, B.length);
    const rows = [];
    for (let i = 0; i < n; i++) rows.push(`<div>${i + 1}. ${inline(A[i] || "")} — ${inline(B[i] || "")}</div>`);
    parts.push(`<div class="lst">${rows.join("")}</div>`);
  } else if (q.type === "matching") {
    parts.push(
      `<div class="match"><div><div class="ch">Column A</div>${A.map((x, i) => `<div>${i + 1}. ${inline(x)}</div>`).join("")}</div>` +
      `<div><div class="ch">Column B</div>${B.map((x, i) => `<div>${ROMAN[i] || i + 1}. ${inline(x)}</div>`).join("")}</div></div>`
    );
  } else if (q.type === "table") {
    const rows = (q.tableRows || []).map((r) => `<tr>${(Array.isArray(r) ? r : [r]).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("");
    if (rows) parts.push(`<table class="tbl">${rows}</table>`);
  }

  const opts = q.options || [];
  const optHtml = opts
    .map((o, i) => {
      if (String(o).trim() === "") return "";
      const isCorrect = withAnswers && i === q.correct;
      return `<div class="opt${isCorrect ? " correct" : ""}">${isCorrect ? "&#10003; " : ""}<b>${LETTERS[i] || i + 1})</b> ${inline(o)}</div>`;
    })
    .join("");
  if (optHtml) parts.push(`<div class="opts">${optHtml}</div>`);

  if (withAnswers) {
    parts.push(`<p class="ans"><b>Answer:</b> ${answerLetter(q)}</p>`);
    if (q.explanation && String(q.explanation).trim()) parts.push(`<p class="exp"><b>Explanation:</b> ${inline(q.explanation)}</p>`);
  }
  parts.push(`</div>`);
  return parts.join("");
}

export function buildPaperHtml(title, questions, { withAnswers = false } = {}) {
  const list = Array.isArray(questions) ? questions : [];
  let body = "";
  if (withAnswers) {
    const grid = list.map((q, i) => `<span class="cell"><b>${i + 1}.</b> ${answerLetter(q)}</span>`).join("");
    body += `<h2 class="kh">Answer Key</h2><div class="grid">${grid}</div><hr class="rule">`;
  }
  body += list.map((q, i) => questionBlock(q, i, withAnswers)).join("");

  const css =
    `@page{size:A4;margin:16mm}*{box-sizing:border-box}` +
    `body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;line-height:1.5;margin:0}` +
    `h1{font-size:20px;margin:0 0 4px}.meta{color:#64748b;font-size:12px;margin:0 0 14px}` +
    `.q{margin:0 0 14px;page-break-inside:avoid}.stem{margin:0 0 4px}.sub{margin:2px 0}` +
    `.lst>div{margin:1px 0}.match{display:flex;gap:28px;margin:4px 0}.match .ch{font-weight:700;font-size:12px;text-transform:uppercase;color:#475569}` +
    `.opts{margin:4px 0 0 16px}.opt{margin:2px 0}.opt.correct{color:#15803d;font-weight:600}` +
    `.ans{margin:4px 0 0 16px;color:#15803d;font-weight:600}.exp{margin:2px 0 0 16px;color:#334155;font-size:13px}` +
    `.tbl{border-collapse:collapse;margin:4px 0}.tbl td{border:1px solid #cbd5e1;padding:3px 8px;font-size:13px}` +
    `.kh{font-size:16px;margin:12px 0 6px}.grid{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0 0 10px;font-size:13px}.cell{white-space:nowrap}` +
    `.rule{border:none;border-top:1px solid #e2e8f0;margin:8px 0 16px}` +
    `@media screen{body{max-width:210mm;margin:16px auto;padding:0 16mm}}`;

  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>` +
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous">` +
    `<style>${css}</style></head><body>` +
    `<h1>${esc(title)}</h1><p class="meta">${list.length} question(s)${withAnswers ? " · Answer Key (with answers &amp; explanations)" : " · Question paper"}</p>` +
    body +
    `<scr` + `ipt>window.onload=function(){setTimeout(function(){window.focus();window.print();},400)};</scr` + `ipt>` +
    `</body></html>`
  );
}

// Open the paper/answer-key in a print window. Returns false if pop-up blocked.
export function printPaper(title, questions, opts) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(buildPaperHtml(title, questions, opts));
  win.document.close();
  return true;
}
