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

// A diagonal, tiled watermark placed INSIDE each page (so it appears on every
// page in both print and the generated PDF).
function pageWatermark(label) {
  if (!label) return "";
  const spans = Array.from({ length: 300 }).map(() => `<span>${esc(label)}</span>`).join("");
  return `<div class="pwm" aria-hidden="true"><div class="in">${spans}</div></div>`;
}

// Build the shared CSS + page sections for a paper/answer-key.
function compose(title, questions, opts = {}) {
  const { withAnswers = false, brand = "My Study Guide", perPage = 0, watermark = "", watermarkOpacity = 0.12, watermarkSize = 16, border = "single" } = opts;
  const borderCss = border === "none" ? "none" : border === "double" ? "3px double #1e293b" : border === "thick" ? "3px solid #1e293b" : "1.6px solid #1e293b";
  const borderRadius = border === "none" ? "0" : "10px";
  const pagePad = border === "none" ? "10px 4px 22px" : "20px 24px 26px";
  const list = Array.isArray(questions) ? questions : [];
  const kind = withAnswers ? "ANSWER KEY" : "QUESTION PAPER";
  const blocks = list.map((q, i) => questionBlock(q, i, withAnswers));
  const n = Number(perPage) || 0;

  const chunks = [];
  if (n > 0) { for (let i = 0; i < blocks.length; i += n) chunks.push(blocks.slice(i, i + n)); }
  else chunks.push(blocks);
  if (!chunks.length) chunks.push([]);

  const fields = withAnswers
    ? ""
    : `<div class="fields"><span>Name: <b class="line">&nbsp;</b></span><span>Roll No: <b class="line sm">&nbsp;</b></span><span>Date: <b class="line sm">&nbsp;</b></span><span>Marks: <b class="line xs">&nbsp;</b></span></div>`;
  const grid = withAnswers
    ? `<h2 class="kh">Answer Key at a glance</h2><div class="grid">${list.map((q, i) => `<span class="cell"><b>${i + 1}.</b> ${answerLetter(q)}</span>`).join("")}</div><hr class="rule2">`
    : "";
  const fullHeader = (
    `<div class="hdr"><div><p class="brand">${esc(brand)}</p><h1>${esc(title)}</h1>` +
    `<p class="sub">${list.length} question(s)${withAnswers ? " · with answers &amp; explanations" : ""}</p></div>` +
    `<span class="badge">${kind}</span></div>` + fields + `<hr class="rule">`
  );
  const slimHeader = `<div class="shdr"><span>${esc(brand)} — ${esc(title)}</span><span>${kind}</span></div><hr class="rule2">`;
  const wm = pageWatermark(watermark);
  const pageCount = chunks.length;
  const pages = chunks
    .map((chunk, pi) =>
      `<section class="page">${wm}<div class="pc">` +
      (pi === 0 ? fullHeader + grid : slimHeader) +
      chunk.join("") +
      `<div class="foot">${esc(brand)} · ${withAnswers ? "Answer Key" : "Question Paper"}${pageCount > 1 ? ` · Page ${pi + 1} of ${pageCount}` : ""}</div>` +
      `</div></section>`
    )
    .join("");

  const css =
    `@page{size:A4;margin:12mm}*{box-sizing:border-box}` +
    `body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#0f172a;line-height:1.5;margin:0}` +
    `.page{position:relative;overflow:hidden;border:${borderCss};border-radius:${borderRadius};padding:${pagePad}}` +
    `.page + .page{margin-top:18px}.pc{position:relative;z-index:1}` +
    `.hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}` +
    `.brand{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#2563eb;margin:0 0 2px}` +
    `h1{font-size:20px;margin:0}.sub{color:#64748b;font-size:12px;margin:3px 0 0}` +
    `.badge{flex-shrink:0;border:1.5px solid #1e293b;border-radius:999px;padding:4px 12px;font-size:11px;font-weight:800;letter-spacing:.06em}` +
    `.shdr{display:flex;justify-content:space-between;gap:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#475569}` +
    `.fields{display:flex;flex-wrap:wrap;gap:8px 22px;margin:12px 0 0;font-size:13px;color:#334155}` +
    `.line{display:inline-block;border-bottom:1px solid #94a3b8;min-width:150px}.line.sm{min-width:90px}.line.xs{min-width:60px}` +
    `.rule{border:none;border-top:2px solid #1e293b;margin:12px 0 16px}.rule2{border:none;border-top:1px solid #cbd5e1;margin:8px 0 14px}` +
    `.q{margin:0 0 14px;page-break-inside:avoid;break-inside:avoid}.stem{margin:0 0 4px}.sub2{margin:2px 0}` +
    `.lst>div{margin:1px 0}.match{display:flex;gap:28px;margin:4px 0}.match .ch{font-weight:700;font-size:12px;text-transform:uppercase;color:#475569}` +
    `.opts{margin:4px 0 0 16px}.opt{margin:2px 0}.opt.correct{color:#15803d;font-weight:600}` +
    `.ans{margin:4px 0 0 16px;color:#15803d;font-weight:600}.exp{margin:2px 0 0 16px;color:#334155;font-size:13px}` +
    `.tbl{border-collapse:collapse;margin:4px 0}.tbl td{border:1px solid #cbd5e1;padding:3px 8px;font-size:13px}` +
    `.kh{font-size:15px;margin:0 0 6px}.grid{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0 0 6px;font-size:13px}.cell{white-space:nowrap}` +
    `.foot{margin-top:14px;border-top:1px solid #e2e8f0;padding-top:8px;text-align:center;font-size:11px;color:#94a3b8}` +
    // Per-page watermark (behind the content).
    `.pwm{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}` +
    `.pwm .in{position:absolute;inset:-25%;transform:rotate(-24deg);display:flex;flex-wrap:wrap;align-content:flex-start;justify-content:center;gap:44px;opacity:${watermarkOpacity}}` +
    `.pwm .in span{white-space:nowrap;font-weight:800;text-transform:uppercase;letter-spacing:.2em;color:#94a3b8;font-size:${watermarkSize}px}` +
    `*{-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `@media print{.page{break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}.page+.page{margin-top:0}}` +
    `@media screen{body{background:#f1f5f9;padding:16px}.page{max-width:210mm;margin-left:auto;margin-right:auto;background:#fff}}`;

  return { css, pages, kind };
}

export function buildPaperHtml(title, questions, opts = {}) {
  const { css, pages, kind } = compose(title, questions, opts);
  const autoPrint = opts.autoPrint !== false;
  return (
    `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)} — ${kind}</title>` +
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" crossorigin="anonymous">` +
    `<style>${css}</style></head><body>` +
    pages +
    (autoPrint ? `<scr` + `ipt>window.onload=function(){setTimeout(function(){window.focus();window.print();},400)};</scr` + `ipt>` : "") +
    `</body></html>`
  );
}

// Open the paper/answer-key in a print window (fallback). Returns false if the
// pop-up was blocked.
export function printPaper(title, questions, opts) {
  const win = window.open("", "_blank");
  if (!win) return false;
  win.document.write(buildPaperHtml(title, questions, opts));
  win.document.close();
  return true;
}

let html2pdfPromise = null;
function loadHtml2Pdf() {
  if (html2pdfPromise) return html2pdfPromise;
  html2pdfPromise = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && typeof window.html2pdf === "function") return resolve(window.html2pdf);
    if (typeof document === "undefined") return reject(new Error("no document"));
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/html2pdf.js@0.10.3/dist/html2pdf.bundle.min.js";
    s.async = true;
    s.onload = () => resolve(window.html2pdf);
    s.onerror = () => reject(new Error("Failed to load the PDF generator"));
    document.head.appendChild(s);
  });
  return html2pdfPromise;
}
function ensureKatexCss() {
  if (typeof document === "undefined" || document.getElementById("katex-cdn-css")) return;
  const l = document.createElement("link");
  l.id = "katex-cdn-css";
  l.rel = "stylesheet";
  l.href = "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css";
  l.crossOrigin = "anonymous";
  document.head.appendChild(l);
}

// Generate the PDF and download it AUTOMATICALLY as a real .pdf file (no print
// dialog). Resolves true on success, false if it couldn't (caller can fall back
// to printPaper).
export async function savePdf(title, questions, opts = {}) {
  let html2pdf;
  try { html2pdf = await loadHtml2Pdf(); } catch { return false; }
  if (typeof html2pdf !== "function") return false;
  ensureKatexCss();
  const { css, pages } = compose(title, questions, opts);
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;background:#ffffff;z-index:-1";
  wrap.innerHTML = `<style>${css}</style><div class="paperroot">${pages}</div>`;
  document.body.appendChild(wrap);
  try {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
    await new Promise((r) => setTimeout(r, 200)); // let CSS/fonts apply
    await html2pdf()
      .set({
        margin: [10, 10, 10, 10],
        filename: `${String(title || "paper").replace(/[^\w.-]+/g, "_")}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff", windowWidth: 794 },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"], before: ".page" },
      })
      .from(wrap.querySelector(".paperroot"))
      .save();
    return true;
  } catch {
    return false;
  } finally {
    wrap.remove();
  }
}
