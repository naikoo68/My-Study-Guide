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
    if (q.assertion) parts.push(`<p class="sub2"><b>Assertion (A):</b> ${inline(q.assertion)}</p>`);
    if (q.reason) parts.push(`<p class="sub2"><b>Reason (R):</b> ${inline(q.reason)}</p>`);
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

// A diagonal, tiled watermark that prints on EVERY page (position:fixed repeats
// per printed page in Chrome/print-to-PDF).
function watermarkHtml(label) {
  if (!label) return "";
  const spans = Array.from({ length: 240 }).map(() => `<span>${esc(label)}</span>`).join("");
  return `<div class="wm" aria-hidden="true"><div class="wm-in">${spans}</div></div>`;
}

export function buildPaperHtml(title, questions, { withAnswers = false, brand = "My Study Guide", perPage = 0, watermark = "", watermarkOpacity = 0.1, watermarkSize = 16 } = {}) {
  const list = Array.isArray(questions) ? questions : [];
  let body = "";
  if (withAnswers) {
    const grid = list.map((q, i) => `<span class="cell"><b>${i + 1}.</b> ${answerLetter(q)}</span>`).join("");
    body += `<h2 class="kh">Answer Key at a glance</h2><div class="grid">${grid}</div><hr class="rule2">`;
  }
  const blocks = list.map((q, i) => questionBlock(q, i, withAnswers));
  const n = Number(perPage) || 0;
  if (n > 0) {
    // Force a page break after every `n` questions.
    body += blocks.map((b, i) => ((i + 1) % n === 0 && i + 1 < blocks.length ? `${b}<div class="pb"></div>` : b)).join("");
  } else {
    body += blocks.join("");
  }

  const kind = withAnswers ? "ANSWER KEY" : "QUESTION PAPER";
  const fields = withAnswers
    ? ""
    : `<div class="fields"><span>Name: <b class="line">&nbsp;</b></span><span>Roll No: <b class="line sm">&nbsp;</b></span><span>Date: <b class="line sm">&nbsp;</b></span><span>Marks: <b class="line xs">&nbsp;</b></span></div>`;

  const css =
    `@page{size:A4;margin:12mm}*{box-sizing:border-box}` +
    `body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;line-height:1.5;margin:0}` +
    // Bordered "sheet" frame around the whole paper
    `.sheet{border:1.6px solid #1e293b;border-radius:10px;padding:20px 24px 26px}` +
    `.hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}` +
    `.brand{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#2563eb;margin:0 0 2px}` +
    `h1{font-size:20px;margin:0}.sub{color:#64748b;font-size:12px;margin:3px 0 0}` +
    `.badge{flex-shrink:0;border:1.5px solid #1e293b;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:800;letter-spacing:.06em}` +
    `.fields{display:flex;flex-wrap:wrap;gap:8px 22px;margin:12px 0 0;font-size:13px;color:#334155}` +
    `.line{display:inline-block;border-bottom:1px solid #94a3b8;min-width:150px}.line.sm{min-width:90px}.line.xs{min-width:60px}` +
    `.rule{border:none;border-top:2px solid #1e293b;margin:12px 0 16px}.rule2{border:none;border-top:1px solid #cbd5e1;margin:10px 0 16px}` +
    `.q{margin:0 0 14px;page-break-inside:avoid}.stem{margin:0 0 4px}.sub2{margin:2px 0}` +
    `.lst>div{margin:1px 0}.match{display:flex;gap:28px;margin:4px 0}.match .ch{font-weight:700;font-size:12px;text-transform:uppercase;color:#475569}` +
    `.opts{margin:4px 0 0 16px}.opt{margin:2px 0}.opt.correct{color:#15803d;font-weight:600}` +
    `.ans{margin:4px 0 0 16px;color:#15803d;font-weight:600}.exp{margin:2px 0 0 16px;color:#334155;font-size:13px}` +
    `.tbl{border-collapse:collapse;margin:4px 0}.tbl td{border:1px solid #cbd5e1;padding:3px 8px;font-size:13px}` +
    `.kh{font-size:15px;margin:0 0 6px}.grid{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0 0 6px;font-size:13px}.cell{white-space:nowrap}` +
    `.foot{margin-top:14px;border-top:1px solid #e2e8f0;padding-top:8px;text-align:center;font-size:11px;color:#94a3b8}` +
    `.pb{break-after:page;page-break-after:always;height:0}` +
    // Watermark on every page (fixed elements repeat per printed page)
    `.wm{position:fixed;inset:0;z-index:0;overflow:hidden;pointer-events:none}` +
    `.wm-in{position:absolute;left:50%;top:50%;width:240vw;transform:translate(-50%,-50%) rotate(-24deg);display:flex;flex-wrap:wrap;justify-content:center;gap:56px;opacity:${watermarkOpacity}}` +
    `.wm-in span{white-space:nowrap;font-weight:800;text-transform:uppercase;letter-spacing:.2em;color:#94a3b8;font-size:${watermarkSize}px}` +
    `.sheet{position:relative;z-index:1}` +
    `*{-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `@media screen{body{background:#f1f5f9;padding:16px}.sheet{max-width:210mm;margin:0 auto}}`;

  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — ${kind}</title>` +
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous">` +
    `<style>${css}</style></head><body>` +
    watermarkHtml(watermark) +
    `<div class="sheet">` +
    `<div class="hdr"><div><p class="brand">${esc(brand)}</p><h1>${esc(title)}</h1>` +
    `<p class="sub">${list.length} question(s)${withAnswers ? " · with answers &amp; explanations" : ""}</p></div>` +
    `<span class="badge">${kind}</span></div>` +
    fields +
    `<hr class="rule">` +
    body +
    `<div class="foot">${esc(brand)} · ${kind === "ANSWER KEY" ? "Answer Key" : "Question Paper"}</div>` +
    `</div>` +
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
