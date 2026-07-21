import { uploadImage, isCloudinaryConfigured } from "./cloudinary.js";
import Settings from "../models/Settings.js";

// Renders a question into a quiz-style card image for Facebook/Instagram, built
// as an SVG and rasterised to PNG by Cloudinary. LaTeX ($…$) is converted to
// readable Unicode math (fractions, superscripts, Greek letters, operators) so
// options read like "(AB)/(B) > (Aβ)/(β)" instead of raw \frac commands.
// No extra dependencies (keeps the deploy lockfile clean).

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const esc = (s) => String(s || "").replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));

// ---- LaTeX → readable Unicode ----------------------------------------------
const SUP = { "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴", "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹", "+": "⁺", "-": "⁻", "=": "⁼", "(": "⁽", ")": "⁾", "n": "ⁿ", "i": "ⁱ", "a": "ᵃ", "b": "ᵇ", "x": "ˣ" };
const SUB = { "0": "₀", "1": "₁", "2": "₂", "3": "₃", "4": "₄", "5": "₅", "6": "₆", "7": "₇", "8": "₈", "9": "₉", "+": "₊", "-": "₋", "=": "₌", "(": "₍", ")": "₎", "n": "ₙ", "i": "ᵢ", "a": "ₐ", "x": "ₓ" };
const GREEK = { alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ", eta: "η", theta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν", xi: "ξ", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ", chi: "χ", psi: "ψ", omega: "ω", Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Psi: "Ψ", Omega: "Ω" };
const OPS = { times: "×", div: "÷", pm: "±", mp: "∓", cdot: "·", ast: "∗", star: "⋆", leq: "≤", le: "≤", geq: "≥", ge: "≥", neq: "≠", ne: "≠", approx: "≈", equiv: "≡", cong: "≅", sim: "∼", propto: "∝", rightarrow: "→", Rightarrow: "⇒", to: "→", leftarrow: "←", Leftarrow: "⇐", leftrightarrow: "↔", longrightarrow: "→", infty: "∞", sum: "∑", prod: "∏", int: "∫", oint: "∮", partial: "∂", nabla: "∇", sqrt: "√", angle: "∠", perp: "⊥", parallel: "∥", cup: "∪", cap: "∩", subset: "⊂", subseteq: "⊆", supset: "⊃", supseteq: "⊇", in: "∈", notin: "∉", forall: "∀", exists: "∃", therefore: "∴", because: "∵", cdots: "⋯", ldots: "…", dots: "…", prime: "′", circ: "∘", degree: "°", deg: "°", bullet: "•", Re: "ℜ", Im: "ℑ", aleph: "ℵ", hbar: "ℏ", ell: "ℓ", nought: "∅", emptyset: "∅", triangle: "△", square: "□" };
const toScript = (str, map) => String(str).split("").map((c) => map[c] || c).join("");

function mathText(input) {
  let s = String(input || "").replace(/\$/g, "");
  // \frac{a}{b} → a/b, wrapping a part in parens only when it needs them.
  const wrapArg = (a) => { a = a.trim(); return /^[A-Za-z0-9.]+$/.test(a) || /^\(.*\)$/.test(a) ? a : `(${a})`; };
  for (let k = 0; k < 5; k++) s = s.replace(/\\(?:d|t|c)?frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${wrapArg(a)}/${wrapArg(b)}`);
  s = s.replace(/\\sqrt\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g, "($1)√($2)");
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "√($1)");
  s = s.replace(/\\text\s*\{([^{}]*)\}/g, "$1");
  s = s.replace(/\\(?:mathrm|mathbf|mathit|operatorname|boxed)\s*\{([^{}]*)\}/g, "$1");
  // Super/subscripts.
  s = s.replace(/\^\{([^{}]*)\}/g, (_, g) => toScript(g, SUP)).replace(/\^\s*([A-Za-z0-9+\-()])/g, (_, g) => toScript(g, SUP));
  s = s.replace(/_\{([^{}]*)\}/g, (_, g) => toScript(g, SUB)).replace(/_\s*([A-Za-z0-9+\-()])/g, (_, g) => toScript(g, SUB));
  // Named commands → symbols (Greek, then operators). Unknown commands are dropped.
  s = s.replace(/\\left|\\right|\\!|\\,|\\;|\\:|\\quad|\\qquad/g, " ");
  s = s.replace(/\\([A-Za-z]+)/g, (_, name) => GREEK[name] || OPS[name] || "");
  // Strip leftover braces/backslashes/carets.
  s = s.replace(/[{}\\^_]/g, "");
  return s.replace(/\s+/g, " ").trim();
}

const T = (x, y, s, fill, txt, { weight = "400", anchor = "start", ls = "0" } = {}) =>
  `<text x="${x}" y="${y}" font-size="${s}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${ls}" font-family="Arial, Helvetica, sans-serif">${txt}</text>`;
const RR = (x, y, w, h, r, fill, stroke = "none", sw = 0) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"${stroke !== "none" ? ` stroke="${stroke}" stroke-width="${sw}"` : ""}/>`;

// Greedy word-wrap on the prettified text.
function wrap(text, maxChars) {
  const words = mathText(text).split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length <= maxChars) cur = (cur + " " + w).trim();
    else { if (cur) lines.push(cur); cur = w.length > maxChars ? w.slice(0, maxChars - 1) + "…" : w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

// Build the quiz-style card SVG: difficulty pill, stem, styled Column A/B boxes
// with badges, then options in rounded boxes. Height grows with content.
function buildQuestionSvg(q, opts = {}) {
  const W = 1080, PAD = 56;
  const brand = opts.brandColor || "#4f46e5";
  const accent = "#ea580c";
  const siteName = esc(mathText(opts.siteName || "My Study Guide"));
  const els = [];
  let y = 150;

  const diff = q.difficulty || "Medium";
  const dc = diff === "Hard" ? ["#fee2e2", "#dc2626"] : diff === "Easy" ? ["#dcfce7", "#16a34a"] : ["#fef9c3", "#ca8a04"];
  els.push(RR(PAD, y, 118, 46, 12, dc[0]));
  els.push(T(PAD + 59, y + 31, 26, dc[1], esc(diff), { weight: "700", anchor: "middle" }));
  els.push(T(W - PAD, y + 31, 26, "#94a3b8", "Question of the day", { anchor: "end" }));
  y += 46 + 34;

  wrap(q.text || "Question", 46).forEach((ln, i) => { y += i === 0 ? 44 : 50; els.push(T(PAD, y, 40, "#0f172a", esc(ln), { weight: "800" })); });
  y += 34;

  const isColumns = ["matching", "pair", "pairselect"].includes(q.type) && Array.isArray(q.columnA) && q.columnA.length;
  const isStatements = q.type === "statement" && Array.isArray(q.columnA) && q.columnA.length;

  const renderColumn = (title, titleColor, items, badgeBg, badgeColor, x, colW, y0) => {
    const inner = [];
    let yy = y0 + 46;
    inner.push(T(x + 24, yy, 24, titleColor, title, { weight: "800", ls: "1.5" }));
    yy += 20;
    items.forEach((it) => {
      const by = yy + 8;
      inner.push(RR(x + 24, by, 36, 36, 9, badgeBg));
      inner.push(T(x + 42, by + 25, 20, badgeColor, esc(it.badge), { weight: "700", anchor: "middle" }));
      const lines = wrap(it.text, Math.max(14, Math.floor((colW - 90) / 15)));
      lines.forEach((ln, k) => inner.push(T(x + 74, by + 26 + k * 34, 28, "#1e293b", esc(ln))));
      yy += Math.max(46, lines.length * 34 + 14);
    });
    return { inner, height: yy - y0 + 18 };
  };

  if (isColumns) {
    const gap = 28;
    const colW = (W - 2 * PAD - gap) / 2;
    const colA = (q.columnA || []).map((t, i) => ({ badge: String(i + 1), text: String(t) }));
    const colB = (q.columnB || []).map((t, i) => ({ badge: ROMAN[i] || String(i + 1), text: String(t) }));
    const a = renderColumn("COLUMN A", brand, colA, "#eef2ff", brand, PAD, colW, y);
    const b = renderColumn("COLUMN B", accent, colB, "#fff7ed", accent, PAD + colW + gap, colW, y);
    const h = Math.max(a.height, b.height);
    els.push(RR(PAD, y, colW, h, 16, "#ffffff", "#e2e8f0", 2));
    els.push(RR(PAD + colW + gap, y, colW, h, 16, "#ffffff", "#e2e8f0", 2));
    els.push(...a.inner, ...b.inner);
    y += h + 30;
  } else if (isStatements) {
    const items = (q.columnA || []).map((t, i) => ({ badge: String(i + 1), text: String(t) }));
    const c = renderColumn("STATEMENTS", brand, items, "#eef2ff", brand, PAD, W - 2 * PAD, y);
    els.push(RR(PAD, y, W - 2 * PAD, c.height, 16, "#ffffff", "#e2e8f0", 2));
    els.push(...c.inner);
    y += c.height + 30;
  } else if (q.type === "assertion" && (q.assertion || q.reason)) {
    [["Assertion (A)", q.assertion], ["Reason (R)", q.reason]].forEach(([lab, txt]) => {
      if (!txt) return;
      els.push(T(PAD, y + 30, 26, brand, lab, { weight: "700" })); y += 40;
      wrap(txt, 58).forEach((ln) => { els.push(T(PAD, y + 26, 30, "#1e293b", esc(ln))); y += 38; });
      y += 8;
    });
    y += 8;
  }

  const prompt = { matching: "Choose the correct matching sequence:", pair: "How many pairs are correctly matched?", pairselect: "Which pairs are correctly matched?", statement: "Which statement(s) is/are correct?" }[q.type] || "Choose the correct option:";
  if (opts.includeOptions !== false && Array.isArray(q.options) && q.options.length) {
    els.push(T(PAD, y + 22, 26, "#64748b", esc(prompt))); y += 44;
    q.options.forEach((o, i) => {
      const lines = wrap(o, 50);
      const boxH = Math.max(66, lines.length * 40 + 26);
      const correct = opts.includeAnswer && i === q.correct;
      els.push(RR(PAD, y, W - 2 * PAD, boxH, 16, correct ? "#ecfdf5" : "#ffffff", correct ? "#059669" : "#e2e8f0", 2));
      els.push(RR(PAD + 18, y + boxH / 2 - 19, 38, 38, 19, correct ? "#059669" : "#f1f5f9"));
      els.push(T(PAD + 37, y + boxH / 2 + 8, 22, correct ? "#ffffff" : "#475569", `(${String.fromCharCode(97 + i)})`, { weight: "700", anchor: "middle" }));
      lines.forEach((ln, k) => els.push(T(PAD + 76, y + boxH / 2 + 8 - (lines.length - 1) * 20 + k * 40, 30, correct ? "#065f46" : "#1e293b", esc(ln), { weight: correct ? "700" : "500" })));
      y += boxH + 14;
    });
  }
  if (opts.includeAnswer && Number.isInteger(q.correct)) { els.push(T(PAD, y + 30, 30, "#059669", `✓ Answer: ${LETTERS[q.correct] || q.correct + 1}`, { weight: "800" })); y += 46; }
  else if (opts.includeOptions !== false) { els.push(T(PAD, y + 30, 30, brand, "👉 Comment your answer!", { weight: "700" })); y += 46; }

  if (opts.hashtags) { els.push(T(PAD, y + 30, 26, brand, esc(mathText(opts.hashtags)))); y += 40; }

  const H = Math.max(1080, Math.min(1350, y + 40));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="#f8fafc"/>
    <rect x="0" y="0" width="${W}" height="118" fill="${brand}"/>
    ${T(PAD, 74, 44, "#ffffff", siteName, { weight: "800" })}
    ${els.join("\n    ")}
    <rect x="0" y="${H - 10}" width="${W}" height="10" fill="${brand}"/>
  </svg>`;
}

// Render a question to a hosted PNG URL (via Cloudinary). Returns the URL or
// null on any failure (caller falls back to a text post).
export async function renderQuestionImage(q, opts = {}) {
  if (!isCloudinaryConfigured()) return null;
  try {
    const s = await Settings.findOne({ key: "site" }).lean();
    const svg = buildQuestionSvg(q, {
      ...opts,
      siteName: opts.siteName || s?.siteName || "My Study Guide",
      brandColor: opts.brandColor || s?.brandColor || s?.primaryColor || "#4f46e5",
    });
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    const { url } = await uploadImage(dataUri, { format: "png", folder: "mystudyguide/social" });
    return url || null;
  } catch {
    return null;
  }
}
