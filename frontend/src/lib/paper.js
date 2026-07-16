// Build a printable A4 "question paper" or "answer key" from a list of question
// objects. Renders every question type (mcq, matching, statement, pair/
// pairselect, assertion, table) with inline $…$ math (KaTeX), the site's brand
// colours, a clean serif look, coloured difficulty chips and coloured Column
// A/B boxes — then downloads it as a real PDF (html2canvas + jsPDF) or, as a
// fallback, opens a print window.
import katex from "katex";

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

// Fixed difficulty-chip palette (mirrors the quiz UI: Easy=emerald,
// Medium=amber, Hard=rose).
const DIFF = {
  Easy: { bg: "#dcfce7", fg: "#047857", bd: "#a7f3d0" },
  Medium: { bg: "#fef3c7", fg: "#b45309", bd: "#fde68a" },
  Hard: { bg: "#ffe4e6", fg: "#be123c", bd: "#fecdd3" },
};

const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// hex (#rgb / #rrggbb) → rgba() with the given alpha (for soft tints).
function hexA(hex, a) {
  const h = String(hex || "").replace("#", "").trim();
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(v, 16);
  if (v.length !== 6 || Number.isNaN(n)) return `rgba(37,99,235,${a})`;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

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
  const diff = DIFF[q?.difficulty] ? q.difficulty : "";
  const chip = diff ? `<span class="chip d-${diff.toLowerCase()}">${esc(diff)}</span>` : "";
  const parts = [`<div class="q"><p class="stem"><b class="qn">${idx + 1}.</b> ${inline(q.text)} ${chip}</p>`];
  const A = (q.columnA || []).map((x) => String(x)).filter((x) => x.trim());
  const B = (q.columnB || []).map((x) => String(x)).filter((x) => x.trim());

  if (q.type === "assertion") {
    if (q.assertion) parts.push(`<div class="box boxA"><span class="bx-h">Assertion (A)</span> ${inline(q.assertion)}</div>`);
    if (q.reason) parts.push(`<div class="box boxB"><span class="bx-h">Reason (R)</span> ${inline(q.reason)}</div>`);
  } else if (q.type === "statement") {
    parts.push(`<div class="box boxA"><div class="lst">${A.map((s, i) => `<div>${i + 1}. ${inline(s)}</div>`).join("")}</div></div>`);
  } else if (q.type === "pair" || q.type === "pairselect") {
    const n = Math.max(A.length, B.length);
    const rows = [];
    for (let i = 0; i < n; i++) rows.push(`<div>${i + 1}. ${inline(A[i] || "")} — ${inline(B[i] || "")}</div>`);
    parts.push(`<div class="box boxA"><div class="lst">${rows.join("")}</div></div>`);
  } else if (q.type === "matching") {
    parts.push(
      `<div class="match"><div class="box boxA"><div class="ch chA">Column A</div>${A.map((x, i) => `<div>${i + 1}. ${inline(x)}</div>`).join("")}</div>` +
      `<div class="box boxB"><div class="ch chB">Column B</div>${B.map((x, i) => `<div>${ROMAN[i] || i + 1}. ${inline(x)}</div>`).join("")}</div></div>`
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
  const {
    withAnswers = false,
    brand = "My Study Guide",
    perPage = 0,
    watermark = "",
    watermarkOpacity = 0.12,
    watermarkSize = 16,
    border = "single",
    brandColor = "#2563eb",
    accentColor = "#f97316",
    fontFamily = 'Georgia, "Times New Roman", "Cambria", serif',
  } = opts;
  const borderCss = border === "none" ? "none" : border === "double" ? `3px double ${brandColor}` : border === "thick" ? `3px solid ${brandColor}` : `1.6px solid ${hexA(brandColor, 0.65)}`;
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
      `<section class="page"><div class="frame">${wm}<div class="pc">` +
      (pi === 0 ? fullHeader + grid : slimHeader) +
      chunk.join("") +
      `<div class="foot">${esc(brand)} · ${withAnswers ? "Answer Key" : "Question Paper"}${pageCount > 1 ? ` · Page ${pi + 1} of ${pageCount}` : ""}</div>` +
      `</div></div></section>`
    )
    .join("");

  const css =
    `@page{size:A4;margin:12mm}*{box-sizing:border-box}` +
    `body{font-family:${fontFamily};color:#0f172a;line-height:1.55;margin:0}` +
    // .page is an A4-proportioned sheet (794px wide = 210mm) with a comfortable
    // outer MARGIN. It GROWS with its content (min-height, no clipping); the PDF
    // generator fits each rendered page onto one A4 sheet (shrinking dense pages
    // so nothing is ever cut off).
    `.page{position:relative;background:#fff;padding:34px;display:flex;flex-direction:column;width:794px;min-height:1123px;margin:0 auto}` +
    `.frame{flex:1;position:relative;border:${borderCss};border-radius:${borderRadius};padding:${pagePad}}` +
    `.page + .page{margin-top:18px}.pc{position:relative;z-index:1}` +
    `.hdr{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}` +
    `.brand{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${brandColor};margin:0 0 2px}` +
    `h1{font-size:21px;margin:0;color:${brandColor}}.sub{color:#64748b;font-size:12px;margin:3px 0 0}` +
    `.badge{flex-shrink:0;background:${brandColor};color:#fff;border-radius:999px;padding:5px 13px;font-size:11px;font-weight:800;letter-spacing:.06em}` +
    `.shdr{display:flex;justify-content:space-between;gap:12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:${brandColor}}` +
    `.fields{display:flex;flex-wrap:wrap;gap:8px 22px;margin:12px 0 0;font-size:13px;color:#334155}` +
    `.line{display:inline-block;border-bottom:1px solid #94a3b8;min-width:150px}.line.sm{min-width:90px}.line.xs{min-width:60px}` +
    `.rule{border:none;border-top:2px solid ${brandColor};margin:12px 0 16px}.rule2{border:none;border-top:1px solid ${hexA(brandColor, 0.35)};margin:8px 0 14px}` +
    `.q{margin:0 0 15px;page-break-inside:avoid;break-inside:avoid}.stem{margin:0 0 5px}` +
    `.qn{color:${brandColor};font-weight:800;margin-right:2px}` +
    // Difficulty chips.
    `.chip{display:inline-block;vertical-align:middle;border-radius:999px;padding:1px 9px;font-size:10.5px;font-weight:800;letter-spacing:.03em;border:1px solid;line-height:1.5}` +
    `.d-easy{background:${DIFF.Easy.bg};color:${DIFF.Easy.fg};border-color:${DIFF.Easy.bd}}` +
    `.d-medium{background:${DIFF.Medium.bg};color:${DIFF.Medium.fg};border-color:${DIFF.Medium.bd}}` +
    `.d-hard{background:${DIFF.Hard.bg};color:${DIFF.Hard.fg};border-color:${DIFF.Hard.bd}}` +
    // Coloured Column A / B (and statement / assertion) boxes.
    `.box{border-radius:9px;padding:8px 12px;margin:5px 0;font-size:14px}` +
    `.boxA{background:${hexA(brandColor, 0.07)};border:1px solid ${hexA(brandColor, 0.3)}}` +
    `.boxB{background:${hexA(accentColor, 0.09)};border:1px solid ${hexA(accentColor, 0.32)}}` +
    `.box .lst>div{margin:2px 0}.bx-h{display:inline-block;font-weight:800;margin-right:6px}` +
    `.boxA .bx-h{color:${brandColor}}.boxB .bx-h{color:${accentColor}}` +
    `.match{display:flex;gap:16px;margin:5px 0}.match .box{flex:1}` +
    `.match .ch{font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}` +
    `.chA{color:${brandColor}}.chB{color:${accentColor}}` +
    `.opts{margin:5px 0 0 16px}.opt{margin:2px 0}.opt.correct{color:#15803d;font-weight:700}` +
    `.ans{margin:5px 0 0 16px;color:#15803d;font-weight:700}.exp{margin:2px 0 0 16px;color:#334155;font-size:13px}` +
    `.tbl{border-collapse:collapse;margin:5px 0}.tbl td{border:1px solid #cbd5e1;padding:3px 8px;font-size:13px}` +
    `.kh{font-size:15px;margin:0 0 6px;color:${brandColor}}.grid{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0 0 6px;font-size:13px}.cell{white-space:nowrap}` +
    `.foot{margin-top:16px;border-top:1px solid ${hexA(brandColor, 0.2)};padding-top:8px;text-align:center;font-size:11px;color:#94a3b8}` +
    // Per-page watermark (behind the content).
    `.pwm{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0}` +
    `.pwm .in{position:absolute;inset:-25%;transform:rotate(-24deg);display:flex;flex-wrap:wrap;align-content:flex-start;justify-content:center;gap:44px;opacity:${watermarkOpacity}}` +
    `.pwm .in span{white-space:nowrap;font-weight:800;text-transform:uppercase;letter-spacing:.2em;color:#94a3b8;font-size:${watermarkSize}px}` +
    `*{-webkit-print-color-adjust:exact;print-color-adjust:exact}` +
    `@media print{.page{break-after:page;page-break-after:always}.page:last-child{break-after:auto;page-break-after:auto}.page+.page{margin-top:0}}` +
    `@media screen{body{background:#f1f5f9;padding:16px}}`;

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
    (autoPrint ? `<scr` + `ipt>window.onload=function(){setTimeout(function(){window.focus();window.print();},600)};</scr` + `ipt>` : "") +
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

function loadScript(src, ready) {
  return new Promise((resolve, reject) => {
    if (ready()) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(s);
  });
}
async function loadPdfLibs() {
  await loadScript("https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js", () => typeof window !== "undefined" && !!window.html2canvas);
  await loadScript("https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js", () => typeof window !== "undefined" && window.jspdf && !!window.jspdf.jsPDF);
  return { html2canvas: window.html2canvas, jsPDF: window.jspdf && window.jspdf.jsPDF };
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

// Build the PDF and download it AUTOMATICALLY (no print dialog). Renders EACH
// page section at its NATURAL size (no CSS transform — that broke html2canvas)
// and fits it onto one A4 sheet: normal pages fill the width; dense pages are
// scaled down so every question stays on the sheet. A chosen page count maps
// 1:1 to A4 pages. Returns true on success, false to fall back to print.
export async function savePdf(title, questions, opts = {}) {
  if (typeof document === "undefined") return false;
  let libs;
  try { libs = await loadPdfLibs(); } catch { return false; }
  const { html2canvas, jsPDF } = libs || {};
  if (typeof html2canvas !== "function" || typeof jsPDF !== "function") return false;
  ensureKatexCss();

  const { css, pages } = compose(title, questions, opts);
  const wrap = document.createElement("div");
  wrap.style.cssText = "position:fixed;left:-10000px;top:0;background:#ffffff;z-index:-1";
  wrap.innerHTML = `<style>${css} .page{margin:0 !important}.page+.page{margin-top:0 !important}</style><div class="paperroot">${pages}</div>`;
  document.body.appendChild(wrap);

  try {
    if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
    await new Promise((r) => setTimeout(r, 250)); // let CSS/fonts apply
    const pageEls = wrap.querySelectorAll(".page");
    if (!pageEls.length) return false;
    // Normalise EVERY page to the tallest page's height so all pages render at
    // the SAME dimensions. This makes each page fit onto A4 with an identical
    // scale — so the border thickness and text size are uniform across pages
    // (a page's content just leaves more/less blank space, never a resized
    // frame). Never below A4 (1123px) and never clipped.
    let maxH = 1123;
    pageEls.forEach((p) => { p.style.height = "auto"; });
    pageEls.forEach((p) => { maxH = Math.max(maxH, Math.ceil(p.offsetHeight)); });
    pageEls.forEach((p) => { p.style.height = `${maxH}px`; });
    await new Promise((r) => setTimeout(r, 40)); // let the reflow settle
    const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
    const A4W = 210, A4H = 297; // mm
    // Compute the fit ONCE (all pages share dimensions → identical placement).
    const ratio = maxH / 794; // height / width of every page
    let w = A4W;
    let h = A4W * ratio;
    let x = 0;
    const y = 0;
    if (h > A4H) { h = A4H; w = A4H / ratio; x = (A4W - w) / 2; }
    for (let i = 0; i < pageEls.length; i++) {
      // Every page is now 794 × maxH px → renders identically and fits A4 the
      // same way, giving uniform borders and text across all pages.
      // eslint-disable-next-line no-await-in-loop
      const canvas = await html2canvas(pageEls[i], { scale: 2.5, useCORS: true, backgroundColor: "#ffffff", logging: false, windowWidth: 794 });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "JPEG", x, y, w, h);
    }
    pdf.save(`${String(title || "paper").replace(/[^\w.-]+/g, "_")}.pdf`);
    return true;
  } catch {
    return false;
  } finally {
    wrap.remove();
  }
}
