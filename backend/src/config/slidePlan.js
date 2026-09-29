// Build the SLIDE PLAN (what each slide shows + what the narrator says) for one
// question. Every question becomes exactly TWO slides — the question, then the
// answer reveal — and it adapts to the question TYPE (it never assumes a plain
// MCQ): assertion/reason, statements and matching columns are shown on the
// question slide with the options. PURE logic (no I/O). The renderer
// (slideRender.js) draws each slide; the TTS service speaks each `narration`.

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI"];

const asText = (v) => String(v ?? "").trim();
const isFilled = (v) => asText(v) !== "";
const arr = (a) => (Array.isArray(a) ? a.filter((x) => isFilled(x)) : []);

// Strip LaTeX / markup so the TTS voice reads clean, natural language rather
// than "$", backslashes and braces. Keeps the words; drops the notation.
export function toSpeech(input) {
  let s = String(input || "");
  // "statement(s) … is/are correct" → "statements … are correct" (a voice
  // would otherwise say "statement s" / "is slash are").
  s = s.replace(/(\w)\(s\)/g, "$1s").replace(/\bis\s*\/\s*are\b/gi, "are").replace(/\bhas\s*\/\s*have\b/gi, "have");
  // Accounting shorthand: "Cash A/c Dr." → "Cash account debit", "₹50,000" → "rupees 50,000".
  s = s.replace(/\bA\/c\b/gi, "account").replace(/\bDr\.(?=\s|$|,)/g, "debit").replace(/\bCr\.(?=\s|$|,)/g, "credit");
  s = s.replace(/₹\s*/g, "rupees ");
  s = s.replace(/\$/g, " ");
  s = s.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, "$1 over $2");
  s = s.replace(/\\sqrt\s*\{([^{}]*)\}/g, "square root of $1");
  s = s.replace(/\\(?:text|mathrm|mathbf|mathit|operatorname)\s*\{([^{}]*)\}/g, "$1");
  s = s.replace(/\^\{?([A-Za-z0-9+\-]+)\}?/g, " to the power $1");
  s = s.replace(/_\{?([A-Za-z0-9+\-]+)\}?/g, " $1");
  s = s.replace(/\\times/g, " times ").replace(/\\div/g, " divided by ");
  s = s.replace(/\\pm/g, " plus or minus ").replace(/\\cdot/g, " times ");
  s = s.replace(/\\rightarrow|\\to/g, " gives ").replace(/\\leftarrow/g, " from ");
  // Arrows in sequences ("Organism → Population") become a short pause
  // instead of being read out as "right arrow".
  s = s.replace(/\s*(?:→|->|⟶|⇒)\s*/g, ", ");
  // "Rust = Iron + Oxygen" (quick-recall style) → read the "=" as a word.
  s = s.replace(/\s*=\s*/g, " equals ");
  s = s.replace(/\\[a-zA-Z]+/g, " "); // any remaining commands
  s = s.replace(/[{}\\]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

// Shorten text to at most `max` characters, cutting at the last full sentence
// that fits (or a word boundary with "…" if no sentence fits).
export function clipSentences(text, max) {
  const s = String(text || "").trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (end > max * 0.4) return cut.slice(0, end + 1).trim();
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max).trim() + "…";
}

// End a spoken fragment with exactly one full stop (avoids "sea level.." when
// the source text already ends with punctuation).
const said = (t) => {
  const x = toSpeech(t).replace(/[\s.;:,]+$/, "");
  return x ? (/[!?]$/.test(x) ? x : `${x}.`) : "";
};

// ---- Mirrors of the frontend display helpers (frontend/src/lib/questions.js
// and StatementPairView) so the narration matches the slide exactly. ---------

// Split a column saved as one "1. a 2. b" blob; strip leading "1." / "I." markers.
// (?!\d): "6.5%" is a number, not a "6." list marker.
const LEADING_MARKER = /^\s*(?:[IVXLC]{1,5}|\d{1,2})\s*[.)](?!\d)\s*/i;
export function normalizeColumn(list) {
  const items = (Array.isArray(list) ? list : []).map((x) => asText(x)).filter(Boolean);
  if (items.length >= 2) return items.map((x) => x.replace(LEADING_MARKER, "").trim());
  if (items.length === 1) {
    const split = items[0].replace(/\s+/g, " ").split(/\s+(?=(?:[IVXLC]{1,5}|\d{1,2})[.)]\s)/g)
      .map((p) => p.replace(LEADING_MARKER, "").trim()).filter(Boolean);
    if (split.length >= 2) return split;
  }
  return items;
}

const ASSERTION_REASON_OPTIONS = [
  "Both A and R are true and R is the correct explanation of A",
  "Both A and R are true but R is NOT the correct explanation of A",
  "A is true but R is false",
  "A is false but R is true",
];
const NUMBER_WORDS = ["one", "two", "three", "four", "five", "six", "seven", "eight"];
function pairCountOptions(n) {
  if (n >= 4) return ["Only one pair", "Only two pairs", "Only three pairs", `All ${NUMBER_WORDS[n - 1] || n} pairs`];
  const out = [];
  for (let k = 1; k < n; k++) out.push(`Only ${NUMBER_WORDS[k - 1]} pair${k === 1 ? "" : "s"}`);
  out.push(`All ${NUMBER_WORDS[n - 1] || n} pairs`, "None of the pairs");
  return out;
}
// The options the slide DISPLAYS (rebuilds the fixed assertion / pair-count
// choices when a question was saved with blank option text).
export function displayOptions(q) {
  const opts = Array.isArray(q?.options) ? q.options : [];
  if (q?.type === "assertion" && !(opts.length === 4 && opts.every(isFilled))) return ASSERTION_REASON_OPTIONS.slice();
  if (q?.type === "pair" && (opts.length === 0 || opts.every((o) => !isFilled(o)))) {
    const a = normalizeColumn(q.columnA), b = normalizeColumn(q.columnB);
    if (a.length === b.length && [3, 4].includes(a.length)) return pairCountOptions(a.length);
  }
  return opts;
}

// The stem shown for an assertion question drops an embedded "Assertion (A): …"
// copy when A and R have their own fields (they're read separately).
function stemText(q) {
  const text = asText(q?.text);
  if (q?.type !== "assertion" || !(q?.assertion && q?.reason)) return text;
  const idx = text.search(/\bAssertion\b\s*(?:\([Aa]\))?\s*[:-]/);
  if (idx === -1) return text;
  return text.slice(0, idx).trim() || "Consider the following Assertion (A) and Reason (R):";
}

// The prompt shown under the statements / pairs list.
export function closingPrompt(type) {
  if (type === "statement") return "Which of the statement(s) given above is/are correct?";
  if (type === "pair") return "How many of the above pairs are correctly matched?";
  if (type === "pairselect") return "Which of the pairs given above is/are correctly matched?";
  if (type === "rearrange") return "Choose the correct order of the sentences:";
  return "";
}
// Rearrange sentences are labelled with the scheme the options use (letters or Roman).
function rearrangeLabels(q) {
  const opts = arr(q?.options).join(" ");
  const hasRoman = /\b(?:I{1,3}|IV|VI{0,3}|IX|X)\b/.test(opts);
  const hasLetters = /\b[A-H]\b/.test(opts);
  return hasLetters && !hasRoman ? LETTERS.concat(["G", "H"]) : ROMAN.concat(["VII", "VIII"]);
}

// Speak a "(s)" / "is/are" prompt naturally: "statement(s)" → "statements",
// "is/are" → "are".
const speakPrompt = (t) => said(t); // toSpeech turns "(s)" / "is/are" into natural words

// An accounting option stored as a pipe table ("Date | Particulars | … |")
// → "Particulars: Cash A/c, Debit: 5000. …" instead of reading the pipes.
function speakPipeTable(s) {
  const rows = String(s || "").split(/\r?\n/).map((l) => l.trim()).filter((l) => l.includes("|"))
    .map((l) => {
      let p = l.split("|");
      if (l.startsWith("|") && l.endsWith("|")) p = p.slice(1, -1);
      return p.map((c) => c.trim());
    })
    .filter((cells) => !cells.every((c) => c === "" || /^:?-{2,}:?$/.test(c)));
  if (rows.length < 2) return "";
  const looksHeader = /account|particular|debit|credit|amount|dr\.?|cr\.?|date|\blf\b/i.test(rows[0].join(" "));
  const header = looksHeader ? rows[0] : ["Account", "Debit", "Credit"];
  const body = looksHeader ? rows.slice(1) : rows;
  // Column names spoken as words; "LF"/"J.F." (folio) columns are skipped.
  const spokenHeader = header.map((h) => {
    const x = String(h || "").trim();
    if (/^(?:l\.?\s*f\.?|j\.?\s*f\.?)$/i.test(x)) return null;
    if (/\b(?:dr\.?|debit)\b/i.test(x)) return "Debit";
    if (/\b(?:cr\.?|credit)\b/i.test(x)) return "Credit";
    if (/particular|account/i.test(x)) return "";
    return x;
  });
  return body.map((r) => r.map((c, i) => {
    if (!c || spokenHeader[i] === null) return "";
    return spokenHeader[i] ? `${spokenHeader[i]} ${c}` : c;
  }).filter(Boolean).join(", "))
    .filter(Boolean).map(said).join(" ");
}
const speakOption = (t) => speakPipeTable(t) || said(t);

// Everything the QUESTION slide shows for `q`, for every question type, in the
// on-screen order (stem → columns / statements / pairs / table / figure /
// assertion-reason → closing prompt → options). Returns:
//   { speech, lead, columns, options: [{ badge, text, spokenBadge, spoken }] }
// (`lead` / `columns` feed the fallback SVG slide.)
export function questionSpeechParts(q) {
  const type = asText(q?.type) || "mcq";
  const stem = stemText(q) || "Question";
  const lead = [{ text: stem, emphasis: true }];
  const speech = [said(stem)];
  let columns = null;
  const colA = normalizeColumn(q?.columnA);
  const colB = normalizeColumn(q?.columnB);

  if (type === "matching" && (colA.length || colB.length)) {
    columns = {
      a: colA.map((t, i) => ({ badge: String(i + 1), text: t })),
      b: colB.map((t, i) => ({ badge: ROMAN[i] || String(i + 1), text: t })),
    };
    if (colA.length) speech.push("Column A: " + colA.map((t, i) => `${i + 1}, ${said(t)}`).join(" "));
    if (colB.length) speech.push("Column B: " + colB.map((t, i) => `${ROMAN[i] || i + 1}, ${said(t)}`).join(" "));
  }

  if ((type === "statement" || type === "rearrange") && colA.length) {
    const labels = type === "rearrange" ? rearrangeLabels(q) : null;
    colA.forEach((t, i) => {
      const label = labels ? labels[i] || String(i + 1) : String(i + 1);
      lead.push({ text: `${label}. ${t}` });
      speech.push(`${type === "rearrange" ? "Sentence" : "Statement"} ${label}: ${said(t)}`);
    });
  } else if ((type === "pair" || type === "pairselect") && (colA.length || colB.length)) {
    const n = Math.max(colA.length, colB.length);
    for (let i = 0; i < n; i++) {
      const a = colA[i] || "", b = colB[i] || "";
      if (!a && !b) continue;
      lead.push({ text: `${i + 1}. ${a} — ${b}` });
      speech.push(`Pair ${i + 1}: ${toSpeech(a)}, ${said(b)}`);
    }
  }
  const prompt = closingPrompt(type);
  const hasList = (type === "statement" || type === "rearrange") ? colA.length : (colA.length || colB.length);
  if (prompt && hasList) { lead.push({ text: prompt, muted: true }); speech.push(speakPrompt(prompt)); }

  if (type === "table") {
    const rows = (Array.isArray(q?.tableRows) ? q.tableRows : []).filter((r) => Array.isArray(r));
    if (rows.length) {
      const [header, ...body] = rows.map((r) => r.map((c) => asText(c)));
      const spokenRows = (body.length ? body : [header]).map((r, i) =>
        `Row ${i + 1}: ` + r.map((c, j) => (body.length && header[j] ? `${toSpeech(header[j])}, ${toSpeech(c)}` : toSpeech(c))).filter(Boolean).join("; "));
      speech.push(`In the table, ${spokenRows.map(said).join(" ")}`);
    }
  }

  // Figures can't be read aloud — point the viewer at them.
  const vizTitle = asText(q?.viz?.title || q?.graph?.title);
  if (q?.image || q?.graph || q?.viz) speech.push(vizTitle ? `Look at the figure: ${said(vizTitle)}` : "Look at the figure shown.");

  if (type === "assertion" && (isFilled(q.assertion) || isFilled(q.reason))) {
    if (isFilled(q.assertion)) { lead.push({ label: "Assertion (A)", text: asText(q.assertion) }); speech.push(`Assertion: ${said(q.assertion)}`); }
    if (isFilled(q.reason)) { lead.push({ label: "Reason (R)", text: asText(q.reason) }); speech.push(`Reason: ${said(q.reason)}`); }
  }

  if (type === "matching") speech.push("Choose the correct matching sequence.");

  // Options exactly as displayed: matching uses (a), (b)…; others A, B….
  const options = displayOptions(q).map((t, i) => {
    const text = asText(t);
    const badge = type === "matching" ? `(${String.fromCharCode(97 + i)})` : LETTERS[i] || String(i + 1);
    const spokenBadge = type === "matching" ? String.fromCharCode(97 + i) : badge;
    return { badge, text, spokenBadge, spoken: speakOption(text) };
  }).filter((o) => o.text);

  return { speech: speech.filter(Boolean).join(" "), lead, columns, options };
}

// The index / letter of the correct option, if valid.
// Uses the DISPLAYED options, unfiltered, so `correct` still points at the right
// one (filtering blanks would shift the index).
function correctInfo(q) {
  const opts = displayOptions(q);
  const idx = Number.isInteger(q.correct) ? q.correct : -1;
  if (idx < 0 || idx >= opts.length) return null;
  return { index: idx, letter: LETTERS[idx] || String(idx + 1), text: asText(opts[idx]) };
}

// Human topic label for the intro slide ("Subject — Topic" style).
function topicLabel(q, opts = {}) {
  const bits = [asText(opts.subjectName), asText(q.section), asText(q.topic)].filter(Boolean);
  // Dedupe while keeping order (subject/topic can repeat).
  const seen = new Set();
  const uniq = bits.filter((b) => (seen.has(b.toLowerCase()) ? false : seen.add(b.toLowerCase())));
  return uniq.slice(0, 2).join(" — ");
}

// What the narrator reads — admin toggles, every one ON by default:
//   question     slide 1: the question text (+ assertion/reason, statements, columns)
//   options      slide 1: every option ("Option A: …")
//   explanation  slide 2: the full explanation
//   keyPoints    slide 2: every key point
//   quickRecall  slide 2: the quick recall line
// (The "Question 2." intro and the correct answer are always read.) Accepts an
// object with those keys (missing / non-boolean → ON).
export const READ_PARTS = ["question", "options", "explanation", "keyPoints", "quickRecall"];
export function normalizeReadOptions(read) {
  const src = read && typeof read === "object" ? read : {};
  return Object.fromEntries(READ_PARTS.map((k) => [k, src[k] !== false]));
}

// The read options saved in the site settings (slideshowReadQuestion, …).
export function readOptionsFromSettings(site) {
  const s = site || {};
  return normalizeReadOptions({
    question: s.slideshowReadQuestion,
    options: s.slideshowReadOptions,
    explanation: s.slideshowReadExplanation,
    keyPoints: s.slideshowReadKeyPoints,
    quickRecall: s.slideshowReadQuickRecall,
  });
}

// Build the TWO slides for one question:
//   slide 1 "question" — the question with everything needed to answer it
//                        (assertion/reason, statements or matching columns, and
//                        the options), read aloud by the narrator;
//   slide 2 "answer"   — the correct answer, then the explanation, key points
//                        and quick recall.
// `role` tells the composer which on-screen time applies (questionSec /
// answerSec — minimums; a slide stays up until its narration ends). `opts` may
// carry { subjectName } for the small topic line, { index, total } when several
// questions share one video ("Question 2 of 5"), and { read } (see above).
export function buildSlidePlan(q, opts = {}) {
  const type = asText(q?.type) || "mcq";
  const stem = asText(q?.text) || "Question";
  const total = Math.max(1, Number(opts.total) || 1);
  const index = Math.max(1, Math.min(total, Number(opts.index) || 1));
  const ofN = total > 1 ? ` ${index} OF ${total}` : "";
  // WHAT the narrator reads (admin choice — see normalizeReadOptions). Every
  // part that's switched on is read IN FULL, never cut to fit the slide time:
  // the slide simply stays up until the narration finishes.
  const read = normalizeReadOptions(opts.read);

  // ---- Slide 1: the question ------------------------------------------------
  const topic = topicLabel(q || {}, opts);
  const meta = [topic, asText(q?.difficulty) || "Medium"].filter(Boolean).join("  ·  ");
  const lead = [{ text: meta, muted: true }]; // + the stem etc. from questionSpeechParts
  // Everything the question slide SHOWS, in the same order (see
  // questionSpeechParts) — so the narrator reads every line students see,
  // incl. the closing prompt ("Which of the statement(s) given above is/are
  // correct?") and "Choose the correct matching sequence".
  const parts = questionSpeechParts(q || {});
  lead.push(...parts.lead);
  const columns = parts.columns;
  const options = parts.options;
  let spoken = total > 1 ? `Question ${index}.` : "";
  if (read.question) spoken += ` ${parts.speech}`;
  if (read.options && options.length) {
    spoken += " " + options.map((o) => `Option ${o.spokenBadge}: ${o.spoken}`).join(" ");
  }
  // Something must be spoken (the TTS needs text, and it times the slide).
  if (!spoken.trim()) spoken = "Here is the question.";

  const slides = [
    {
      id: "question",
      role: "question",
      tag: `QUESTION${ofN}`,
      accent: "brand",
      heading: "",
      lead,
      columns,
      options,
      body: [],
      narration: spoken.trim(),
    },
  ];

  // ---- Slide 2: the answer reveal -------------------------------------------
  // The correct answer is always read; the explanation, key points and quick
  // recall are read in full when switched on.
  const correct = correctInfo(q || {});
  const body = [];
  let answerSpoken = "";
  if (correct) {
    body.push({ text: `${correct.letter}. ${correct.text}`, emphasis: true, positive: true });
    answerSpoken = `The correct answer is option ${correct.letter}. ${speakOption(correct.text)}`;
  }
  const keyPoints = arr(q?.keyPoints).map(asText);
  const recall = isFilled(q?.quickRecall) ? asText(q.quickRecall) : "";
  if (isFilled(q?.explanation)) {
    // (On-screen text of the fallback SVG slide only — the normal slide shows
    // the full explanation.)
    body.push({ label: "Explanation", text: clipSentences(asText(q.explanation), 420) });
    if (read.explanation) answerSpoken += ` Explanation: ${said(q.explanation)}`;
  }
  if (keyPoints.length && read.keyPoints) {
    answerSpoken += ` Key points: ${keyPoints.map((p) => said(p)).join(" ")}`;
  }
  // The fallback slide shows the quick recall, or the first key point.
  const recallOnScreen = recall || keyPoints[0] || "";
  if (recallOnScreen) body.push({ label: "Quick recall", text: clipSentences(recallOnScreen, 200) });
  if (recall && read.quickRecall) answerSpoken += ` Quick recall: ${said(recall)}`;
  slides.push({
    id: "answer",
    role: "answer",
    tag: `ANSWER${ofN}`,
    accent: "green",
    heading: correct ? `Correct Answer: ${correct.letter}` : "Answer",
    body,
    narration: answerSpoken.trim() || "Here is the answer.",
  });

  return slides;
}

// ---- Intro / outro slides (title + closing call-to-action). Pure. ----------
// An opening title slide for the video: subject / topic, "Let's begin".
export function introSlidePlan({ subject = "", topic = "", siteName = "" } = {}) {
  const title = [asText(subject), asText(topic)].filter(Boolean).join(" — ");
  const heading = title || "Quiz Time";
  return {
    id: "intro",
    role: "intro",
    tag: siteName ? asText(siteName) : "QUIZ",
    accent: "brand",
    heading,
    lines: ["Let's begin!"],
    body: [{ text: "Let's begin!", emphasis: true }],
    narration: `${title ? `${said(title)} ` : ""}Let's begin the quiz.`,
  };
}

// A closing slide. kind "short" → "watch the full quiz on the channel";
// otherwise the normal "thanks for watching, like/share/subscribe".
export function outroSlidePlan(kind = "full", { siteName = "" } = {}) {
  if (kind === "short") {
    return {
      id: "outro",
      role: "shortoutro",
      tag: siteName ? asText(siteName) : "",
      accent: "brand",
      heading: "Watch the full quiz",
      lines: ["on our channel", "Subscribe for more!"],
      body: [{ text: "on our channel", emphasis: true }, { text: "Subscribe for more!" }],
      narration: "Want all the questions? Watch the full quiz on our channel. Subscribe for more!",
    };
  }
  return {
    id: "outro",
    role: "outro",
    tag: siteName ? asText(siteName) : "",
    accent: "brand",
    heading: "Thanks for watching!",
    lines: ["Like, share & subscribe", "for more quizzes"],
    body: [{ text: "Like, share & subscribe", emphasis: true }, { text: "for more quizzes" }],
    narration: "Thanks for watching! Please like, share and subscribe for more quizzes.",
  };
}
