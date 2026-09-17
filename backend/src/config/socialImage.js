import { uploadImage, isCloudinaryConfigured } from "./cloudinary.js";
import Settings from "../models/Settings.js";
// NOTE: MathJax is intentionally NOT loaded here. On the free-tier server (512MB)
// loading full MathJax on each image render risks an out-of-memory crash that
// takes down the whole API. We use the lightweight native SVG fraction renderer
// below (real fraction bars, negligible memory) instead.

// Renders a question into a quiz-style card image for Facebook/Instagram, built
// as an SVG and rasterised to PNG by Cloudinary. LaTeX \frac renders as a real
// STACKED fraction with a bar; other math (superscripts, Greek, operators) is
// converted to Unicode. Lightweight (no MathJax) so it can't OOM the server.

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const esc = (s) => String(s || "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

// ---- LaTeX → Unicode (native fallback only) --------------------------------
const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "n": "ⁿ", "i": "ⁱ", "a": "ᵃ", "b": "ᵇ", "x": "ˣ" };
const SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", "n": "ₙ", "i": "ᵢ", "a": "ₐ", "x": "ₓ" };
const GREEK = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", theta: "θ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Omega: "Ω" };
const OPS = { times: "×", div: "÷", pm: "±", cdot: "·", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", propto: "∝", rightarrow: "→", to: "→", leftarrow: "←", leftrightarrow: "↔", infty: "∞", sum: "∑", prod: "∏", int: "∫", partial: "∂", angle: "∠", perp: "⊥", cup: "∪", cap: "∩", subset: "⊂", supset: "⊃", in: "∈", notin: "∉", forall: "∀", exists: "∃", therefore: "∴", ldots: "…", degree: "°", circ: "∘" };
const toScript = (str, map) => String(str).split("").map((c) => map[c] || c).join("");

function uni(input) {
  let s = String(input || "").replace(/\$/g, "");
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)").replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, "$1");
  s = s.replace(/\^\{([^{}]*)\}/g, (_, g) => toScript(g, SUP)).replace(/\^\s*([A-Za-z0-9+\-()])/g, (_, g) => toScript(g, SUP));
  s = s.replace(/_\{([^{}]*)\}/g, (_, g) => toScript(g, SUB)).replace(/_\s*([A-Za-z0-9+\-()])/g, (_, g) => toScript(g, SUB));
  s = s.replace(/\\left|\\right|\\!|\\,|\\;|\\:|\\quad|\\qquad/g, " ").replace(/\\([A-Za-z]+)/g, (_, name) => GREEK[name] || OPS[name] || "");
  return s.replace(/[{}\\^_]/g, "").replace(/\s+/g, " ").trim();
}

const T = (x, y, s, fill, txt, { weight = "400", anchor = "start", ls = "0" } = {}) =>
  `<text x="${x}" y="${y}" font-size="${s}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}" font-family="Arial, Helvetica, sans-serif">${txt}</text>`;
const RR = (x, y, w, h, r, fill, stroke = "none", sw = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}/>`;

const measure = (t, fs) => String(t).length * fs * 0.52;
const hasFrac = (s) => /\\[dt]?frac/.test(String(s || ""));

function readTwoGroups(s, pos) {
  const grab = (p) => {
    while (p < s.length && s[p] === " ") p++;
    if (s[p] !== "{") return null;
    let depth = 0;
    for (let i = p; i < s.length; i++) { if (s[i] === "{") depth++; else if (s[i] === "}") { depth--; if (depth === 0) return { val: s.slice(p + 1, i), end: i + 1 }; } }
    return null;
  };
  const a = grab(pos); if (!a) return null;
  const b = grab(a.end); if (!b) return null;
  return { a: a.val, b: b.val, end: b.end };
}

// Native fallback: inline layout with real stacked fractions.
function layoutInline(str, fs, color, weight = "400") {
  const parts = [];
  let x = 0, ascent = fs * 0.72, descent = fs * 0.22, buf = "", i = 0;
  const flush = () => { if (!buf) return; const u = uni(buf); if (u) { parts.push(T(x.toFixed(1), 0, fs, color, esc(u), { weight })); x += measure(u, fs); } buf = ""; };
  while (i < str.length) {
    if (str.startsWith("\\frac", i) || str.startsWith("\\dfrac", i) || str.startsWith("\\tfrac", i)) {
      const skip = /^\\[dt]frac/.test(str.slice(i)) ? 6 : 5;
      const g = readTwoGroups(str, i + skip);
      if (g) {
        flush();
        const nf = fs * 0.86;
        const nl = layoutInline(g.a, nf, color, weight), dl = layoutInline(g.b, nf, color, weight);
        const fw = Math.max(nl.w, dl.w) + 12, barY = -fs * 0.32, numB = barY - fs * 0.08 - 0.2 * nf, denB = barY + fs * 0.08 + 0.75 * nf;
        parts.push(`<g transform="translate(${(x + (fw - nl.w) / 2).toFixed(1)},${numB.toFixed(1)})">${nl.svg}</g>`);
        parts.push(`<line x1="${(x + 4).toFixed(1)}" y1="${barY.toFixed(1)}" x2="${(x + fw - 4).toFixed(1)}" y2="${barY.toFixed(1)}" stroke="${color}" stroke-width="${Math.max(1.6, fs * 0.05).toFixed(1)}"/>`);
        parts.push(`<g transform="translate(${(x + (fw - dl.w) / 2).toFixed(1)},${denB.toFixed(1)})">${dl.svg}</g>`);
        x += fw + fs * 0.12;
        ascent = Math.max(ascent, -numB + nl.ascent); descent = Math.max(descent, denB + dl.descent);
        i = g.end; continue;
      }
    }
    buf += str[i]; i++;
  }
  flush();
  return { w: x, ascent, descent, svg: parts.join("") };
}

function wrap(text, maxChars) {
  const words = uni(text).split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxChars) cur = (cur + " " + w).trim();
    else { if (cur) lines.push(cur); cur = w.length > maxChars ? w.slice(0, maxChars - 1) + "…" : w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Prepare a content string → { height, emit(x, yTop) }. Uses the native
// stacked-fraction layout for \frac, else plain (Unicode-converted) text.
async function prepareContent(str, availW, { size, color, weight = "400" }) {
  if (hasFrac(str)) {
    const lay = layoutInline(String(str), size, color, weight);
    const scale = lay.w > availW ? availW / lay.w : 1;
    const asc = lay.ascent * scale;
    return { height: (lay.ascent + lay.descent) * scale + 6, emit: (x, yTop) => [`<g transform="translate(${x.toFixed(1)},${(yTop + asc).toFixed(1)}) scale(${scale.toFixed(3)})">${lay.svg}</g>`] };
  }
  const lines = wrap(str, Math.max(8, Math.floor(availW / (size * 0.52))));
  const lineH = size * 1.28;
  return { height: Math.max(lineH, lines.length * lineH), emit: (x, yTop) => lines.map((ln, k) => T(x, yTop + size + k * lineH, size, color, esc(ln), { weight })) };
}

// Does an option look like a PIPE-DELIMITED TABLE (journal/ledger answers)?
const isPipeTable = (s) => String(s || "").includes("|");

// Parse "| a | b |\n| c | d |" into a 2D array of trimmed cells, dropping the
// empty leading/trailing cells created by the outer pipes.
function parsePipeTable(str) {
  const rows = String(str || "").split(/\r?\n/).map((r) => r.trim()).filter(Boolean);
  const cells = rows.map((r) => {
    let parts = r.split("|");
    if (parts.length && parts[0].trim() === "") parts = parts.slice(1);
    if (parts.length && parts[parts.length - 1].trim() === "") parts = parts.slice(0, -1);
    return parts.map((c) => c.trim());
  }).filter((r) => r.length);
  const cols = cells.reduce((m, r) => Math.max(m, r.length), 1);
  return { cells, cols };
}

// Truncate text with an ellipsis so it fits within pixel width `w` at font `fs`.
function truncToWidth(t, fs, w) {
  let s = String(t || "");
  if (measure(s, fs) <= w) return s;
  while (s.length > 1 && measure(s + "…", fs) > w) s = s.slice(0, -1);
  return s + "…";
}

// Render a pipe-table option as a real bordered grid (so journal/ledger answers
// are readable in the card instead of a wall of "|" characters). Returns the
// SVG string and the height consumed.
function buildOptionTable(str, x, y, width, { fs = 18 } = {}) {
  const { cells, cols } = parsePipeTable(str);
  const colW = width / cols;
  const rowH = Math.round(fs * 1.9);
  const parts = [];
  cells.forEach((row, r) => {
    const ry = y + r * rowH;
    const isHeader = r === 0;
    for (let c = 0; c < cols; c++) {
      const cx = x + c * colW;
      parts.push(RR(cx, ry, colW, rowH, 0, isHeader ? "#eef2ff" : "#ffffff", "#cbd5e1", 1));
      const txt = truncToWidth(uni(row[c] || ""), fs, colW - 10);
      if (txt) parts.push(T(cx + 6, ry + rowH * 0.68, fs, "#0f172a", esc(txt), { weight: isHeader ? "700" : "400" }));
    }
  });
  return { svg: parts.join(""), height: cells.length * rowH };
}

async function buildQuestionSvg(q, opts = {}) {
  const W = 1080, PAD = 56, CM = 24; // CM = margin of the white card on the page
  const brand = opts.brandColor || "#4f46e5";
  const accent = "#ea580c";
  const siteName = esc(uni(opts.siteName || "My Study Guide"));
  const els = [];
  let y = 56;

  // Header row — mirrors the on-screen quiz card: a difficulty PILL on the left,
  // with a small muted site name on the right for identity (the watermark, when
  // set, carries the main branding). No big coloured header bar — this reads as
  // the same white question card students see.
  const diff = q.difficulty || "Medium";
  // Match the app's Badge palette EXACTLY (Easy=emerald, Medium=amber, Hard=rose).
  const dc = diff === "Hard" ? ["#ffe4e6", "#be123c"] : diff === "Easy" ? ["#d1fae5", "#047857"] : ["#fef3c7", "#b45309"];
  const dw = Math.max(112, Math.round(measure(diff, 26) + 56));
  els.push(RR(PAD, y, dw, 46, 23, dc[0]));
  els.push(T(PAD + dw / 2, y + 31, 26, dc[1], esc(diff), { weight: "700", anchor: "middle" }));
  els.push(T(W - PAD, y + 30, 24, "#94a3b8", siteName, { anchor: "end", weight: "700" }));
  y += 46 + 30;

  // Stem.
  {
    const prep = await prepareContent(q.text || "Question", W - 2 * PAD, { size: 40, color: "#0f172a", weight: "800" });
    els.push(...prep.emit(PAD, y)); y += prep.height + 26;
  }

  const isColumns = ["matching", "pair", "pairselect"].includes(q.type) && Array.isArray(q.columnA) && q.columnA.length;
  const isStatements = q.type === "statement" && Array.isArray(q.columnA) && q.columnA.length;

  const renderColumn = async (title, titleColor, items, badgeBg, badgeColor, x, colW, y0) => {
    const inner = [];
    let yy = y0 + 46;
    inner.push(T(x + 24, yy, 24, titleColor, title, { weight: "800", ls: "1.5" }));
    yy += 20;
    for (const it of items) {
      const by = yy + 8;
      inner.push(RR(x + 24, by, 36, 36, 9, badgeBg));
      inner.push(T(x + 42, by + 25, 20, badgeColor, esc(it.badge), { weight: "700", anchor: "middle" }));
      const prep = await prepareContent(it.text, colW - 90, { size: 28, color: "#1e293b" });
      inner.push(...prep.emit(x + 74, by - 2));
      yy += Math.max(46, prep.height + 12);
    }
    return { inner, height: yy - y0 + 18 };
  };

  if (isColumns) {
    const gap = 28;
    const colW = (W - 2 * PAD - gap) / 2;
    const colA = (q.columnA || []).map((t, i) => ({ badge: String(i + 1), text: String(t) }));
    const colB = (q.columnB || []).map((t, i) => ({ badge: ROMAN[i] || String(i + 1), text: String(t) }));
    const a = await renderColumn("COLUMN A", brand, colA, "#eef2ff", brand, PAD, colW, y);
    const b = await renderColumn("COLUMN B", accent, colB, "#fff7ed", accent, PAD + colW + gap, colW, y);
    const h = Math.max(a.height, b.height);
    els.push(RR(PAD, y, colW, h, 16, "#ffffff", "#e2e8f0", 2));
    els.push(RR(PAD + colW + gap, y, colW, h, 16, "#ffffff", "#e2e8f0", 2));
    els.push(...a.inner, ...b.inner);
    y += h + 30;
  } else if (isStatements) {
    const items = (q.columnA || []).map((t, i) => ({ badge: String(i + 1), text: String(t) }));
    const c = await renderColumn("STATEMENTS", brand, items, "#eef2ff", brand, PAD, W - 2 * PAD, y);
    els.push(RR(PAD, y, W - 2 * PAD, c.height, 16, "#ffffff", "#e2e8f0", 2));
    els.push(...c.inner);
    y += c.height + 30;
  } else if (q.type === "assertion" && (q.assertion || q.reason)) {
    for (const [lab, txt] of [["Assertion (A)", q.assertion], ["Reason (R)", q.reason]]) {
      if (!txt) continue;
      els.push(T(PAD, y + 28, 26, brand, lab, { weight: "700" })); y += 38;
      const prep = await prepareContent(txt, W - 2 * PAD, { size: 30, color: "#1e293b" });
      els.push(...prep.emit(PAD, y)); y += prep.height + 10;
    }
  }

  const prompt = { matching: "Choose the correct matching sequence:", pair: "How many pairs are correctly matched?", pairselect: "Which pairs are correctly matched?", statement: "Which statement(s) is/are correct?" }[q.type] || "Choose the correct option:";
  if (opts.includeOptions !== false && Array.isArray(q.options) && q.options.length) {
    els.push(T(PAD, y + 22, 26, "#64748b", esc(prompt))); y += 44;
    for (let i = 0; i < q.options.length; i++) {
      const correct = opts.includeAnswer && i === q.correct;
      const availW = W - 2 * PAD - 76 - 24;
      // Journal/ledger options are pipe tables — render them as a real grid so
      // they're readable, instead of raw "| | |" text.
      if (isPipeTable(q.options[i])) {
        const tbl = buildOptionTable(q.options[i], PAD + 76, y + 12, availW);
        const boxH = Math.max(66, tbl.height + 24);
        els.push(RR(PAD, y, W - 2 * PAD, boxH, 16, "#ffffff", "#e2e8f0", 2));
        els.push(RR(PAD + 18, y + boxH / 2 - 19, 38, 38, 19, "#f1f5f9"));
        els.push(T(PAD + 37, y + boxH / 2 + 8, 22, "#475569", `(${String.fromCharCode(97 + i)})`, { weight: "700", anchor: "middle" }));
        els.push(tbl.svg);
        y += boxH + 14;
        continue;
      }
      const prep = await prepareContent(q.options[i], availW, { size: 30, color: correct ? "#065f46" : "#1e293b", weight: correct ? "700" : "500" });
      const boxH = Math.max(66, prep.height + 26);
      els.push(RR(PAD, y, W - 2 * PAD, boxH, 16, correct ? "#ecfdf5" : "#ffffff", correct ? "#059669" : "#e2e8f0", 2));
      els.push(RR(PAD + 18, y + boxH / 2 - 19, 38, 38, 19, correct ? "#059669" : "#f1f5f9"));
      els.push(T(PAD + 37, y + boxH / 2 + 8, 22, correct ? "#ffffff" : "#475569", `(${String.fromCharCode(97 + i)})`, { weight: "700", anchor: "middle" }));
      els.push(...prep.emit(PAD + 76, y + (boxH - prep.height) / 2));
      y += boxH + 14;
    }
  }
  if (opts.includeAnswer && Number.isInteger(q.correct)) { els.push(T(PAD, y + 30, 30, "#059669", `✓ Answer: ${LETTERS[q.correct] || q.correct + 1}`, { weight: "800" })); y += 46; }
  else if (opts.includeOptions !== false && !opts.hideCta) { els.push(T(PAD, y + 30, 30, brand, "👉 Comment your answer!", { weight: "700" })); y += 46; }

  if (opts.hashtags) { els.push(T(PAD, y + 30, 26, brand, esc(uni(opts.hashtags)))); y += 40; }

  // Card grows with content (min keeps short questions a tidy card; max allows
  // multi-row table options (journal/ledger) without being cut off).
  const H = Math.max(680, Math.min(2600, y + 56));
  // Selfie watermark: embed a circular clipped image if configured.
  let watermarkSvg = "";
  if (opts.selfieWatermarkUrl) {
    const sz = opts.selfieWatermarkSize || 120;
    const opacity = (opts.selfieWatermarkOpacity || 90) / 100;
    const pos = opts.selfieWatermarkPosition || "bottom-right";
    const shape = opts.selfieWatermarkShape || "circle";
    // Keep the watermark inside the white card (inset CM) with a little padding.
    const margin = CM + 20;
    let cx, cy;
    if (pos === "bottom-right") { cx = W - margin - sz / 2; cy = H - margin - sz / 2; }
    else if (pos === "bottom-left") { cx = margin + sz / 2; cy = H - margin - sz / 2; }
    else if (pos === "top-right") { cx = W - margin - sz / 2; cy = CM + 92 + sz / 2; }
    else { cx = margin + sz / 2; cy = CM + 92 + sz / 2; } // top-left (below the header row)
    const r = sz / 2;

    if (shape === "rectangle") {
      // Rectangle watermark: rounded-corner box with the image inside
      const rx = cx - r;
      const ry = cy - r;
      const cornerR = Math.min(12, sz * 0.1);
      watermarkSvg = `
    <defs><clipPath id="wm-clip"><rect x="${rx}" y="${ry}" width="${sz}" height="${sz}" rx="${cornerR}"/></clipPath></defs>
    <rect x="${rx - 2}" y="${ry - 2}" width="${sz + 4}" height="${sz + 4}" rx="${cornerR + 2}" fill="#ffffff" opacity="${opacity}"/>
    <image href="${esc(opts.selfieWatermarkUrl)}" x="${rx}" y="${ry}" width="${sz}" height="${sz}" clip-path="url(#wm-clip)" opacity="${opacity}" preserveAspectRatio="xMidYMid slice"/>
    <rect x="${rx}" y="${ry}" width="${sz}" height="${sz}" rx="${cornerR}" fill="none" stroke="${brand}" stroke-width="2.5" opacity="${opacity}"/>`;
    } else {
      // Circle watermark (selfie style)
      watermarkSvg = `
    <defs><clipPath id="wm-clip"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>
    <circle cx="${cx}" cy="${cy}" r="${r + 3}" fill="#ffffff" opacity="${opacity}"/>
    <image href="${esc(opts.selfieWatermarkUrl)}" x="${cx - r}" y="${cy - r}" width="${sz}" height="${sz}" clip-path="url(#wm-clip)" opacity="${opacity}" preserveAspectRatio="xMidYMid slice"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${brand}" stroke-width="3" opacity="${opacity}"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#f1f5f9"/>
    <rect x="${CM}" y="${CM}" width="${W - 2 * CM}" height="${H - 2 * CM}" rx="24" fill="#ffffff" stroke="#e2e8f0" stroke-width="2"/>
    ${els.join("\n    ")}
    ${watermarkSvg}
  </svg>`;
}

// Build a LANDSCAPE (1200x630) preview card for a SHARED LINK. Social apps —
// especially Facebook — crop link-preview images to a landscape window, so a
// tall portrait card (stem + four full tables) gets its question cut off. This
// card guarantees the FULL QUESTION is always visible: the stem auto-shrinks to
// fit, and for normal MCQs the options are listed compactly. Journal/ledger
// options are tables that can't fit a preview, so we show a clear pointer to
// open the link instead (the full tables render in the quiz itself).
async function buildPreviewSvg(q, opts = {}) {
  // LANDSCAPE card (1200x630 = 1.91:1) — the one ratio Facebook/LinkedIn/etc.
  // show WITHOUT cropping. So the FULL QUESTION is guaranteed visible everywhere
  // (auto-sized to be as big as possible while still complete). Normal MCQ
  // options are listed; journal/ledger table options can't fit a preview, so we
  // show a "view options in the quiz" line (the tables render inside the quiz).
  const W = 1200, H = 630, PAD = 64;
  const brand = opts.brandColor || "#4f46e5";
  const siteName = esc(uni(opts.siteName || "My Study Guide"));
  const subtitle = opts.subtitle ? esc(uni(opts.subtitle)) : "";
  const footer = opts.footer ? esc(uni(opts.footer)) : "";
  const els = [];

  const optsAreTables = Array.isArray(q.options) && q.options.some((o) => isPipeTable(o));
  const listOptions = !optsAreTables && Array.isArray(q.options) && q.options.length > 0;

  const contentTop = 156;
  const footerY = H - 42;
  // Space the stem may occupy (leave room for options / the CTA line below).
  const stemBottom = listOptions ? 356 : footerY - 54;

  // Auto-size the question so it's as BIG as possible while fitting fully.
  let size = 52, prep;
  for (;;) {
    prep = await prepareContent(q.text || "Question", W - 2 * PAD, { size, color: "#0f172a", weight: "800" });
    if (prep.height <= stemBottom - contentTop || size <= 26) break;
    size -= 3;
  }
  els.push(...prep.emit(PAD, contentTop));
  let y = contentTop + prep.height + 18;

  if (listOptions) {
    for (let i = 0; i < q.options.length && y < footerY - 46; i++) {
      const line = truncToWidth(`(${String.fromCharCode(97 + i)})  ${uni(q.options[i])}`, 30, W - 2 * PAD);
      els.push(T(PAD, y + 28, 30, "#334155", esc(line)));
      y += 46;
    }
  } else if (optsAreTables) {
    els.push(T(PAD, y + 30, 30, brand, "👉 Open to view the answer options", { weight: "700" }));
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#f8fafc"/>
    <rect x="0" y="0" width="${W}" height="128" fill="${brand}"/>
    ${T(PAD, 60, 42, "#ffffff", siteName, { weight: "800" })}
    ${subtitle ? T(PAD, 104, 27, "#e0e7ff", subtitle) : ""}
    ${els.join("\n    ")}
    ${footer ? T(PAD, footerY, 27, "#64748b", footer, { weight: "600" }) : ""}
    <rect x="0" y="${H - 8}" width="${W}" height="8" fill="${brand}"/>
  </svg>`;
}

// Render a question to a hosted PNG URL (via Cloudinary). Returns { url } on
// success or { error } with the REAL reason (so the UI can show what failed).
// Pass { preview: true } for the landscape shared-link card (full question).
export async function renderQuestionImage(q, opts = {}) {
  if (!isCloudinaryConfigured()) return { error: "Cloudinary keys are not set on the server (CLOUDINARY_CLOUD_NAME / API_KEY / API_SECRET)." };
  try {
    const s = await Settings.findOne({ key: "site" }).lean();
    // Pass selfie watermark settings if enabled and a URL is set.
    const selfieOpts = {};
    if (s?.fbSelfieWatermarkEnabled !== false && s?.fbSelfieWatermarkUrl) {
      selfieOpts.selfieWatermarkUrl = s.fbSelfieWatermarkUrl;
      selfieOpts.selfieWatermarkSize = s.fbSelfieWatermarkSize || 120;
      selfieOpts.selfieWatermarkOpacity = s.fbSelfieWatermarkOpacity || 90;
      selfieOpts.selfieWatermarkPosition = s.fbSelfieWatermarkPosition || "bottom-right";
      selfieOpts.selfieWatermarkShape = s.fbSelfieWatermarkShape || "circle";
    }
    const builder = opts.preview ? buildPreviewSvg : buildQuestionSvg;
    const svg = await builder(q, {
      ...opts,
      ...selfieOpts,
      siteName: opts.siteName || s?.siteName || "My Study Guide",
      brandColor: opts.brandColor || s?.brandColor || s?.primaryColor || "#4f46e5",
    });
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    const { url } = await uploadImage(dataUri, { format: "png", folder: "mystudyguide/social" });
    if (url) return { url };
    return { error: "Cloudinary returned no URL for the image." };
  } catch (err) {
    // Surface the real Cloudinary/render error (e.g. SVG upload disabled, bad keys).
    return { error: `Image render failed: ${err?.message || err}` };
  }
}
