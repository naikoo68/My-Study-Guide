// Build the SLIDE PLAN (what each slide shows + what the narrator says) for one
// question. Every question becomes exactly TWO slides — the question, then the
// answer reveal — and it adapts to the question TYPE (it never assumes a plain
// MCQ): assertion/reason, statements and matching columns are shown on the
// question slide with the options. PURE logic (no I/O). The renderer
// (slideRender.js) draws each slide; the TTS service speaks each `narration`.

const LETTERS = ["A", "B", "C", "D", "E", "F"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const COLUMN_TYPES = new Set(["matching", "pair", "pairselect"]);

const asText = (v) => String(v ?? "").trim();
const isFilled = (v) => asText(v) !== "";
const arr = (a) => (Array.isArray(a) ? a.filter((x) => isFilled(x)) : []);

// Strip LaTeX / markup so the TTS voice reads clean, natural language rather
// than "$", backslashes and braces. Keeps the words; drops the notation.
export function toSpeech(input) {
  let s = String(input || "");
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

// Options as { badge, text } — badge is A/B/C/D (or a number if there are more).
function optionItems(q) {
  return arr(q.options).map((t, i) => ({ badge: LETTERS[i] || String(i + 1), text: asText(t) }));
}

// The index / letter of the correct option, if valid.
function correctInfo(q) {
  const opts = arr(q.options);
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
  const lead = [{ text: meta, muted: true }, { text: stem, emphasis: true }];
  // The question text plus its parts (assertion/reason, statements, columns).
  let questionSpeech = said(stem);
  let columns = null;

  if (type === "assertion" && (isFilled(q.assertion) || isFilled(q.reason))) {
    if (isFilled(q.assertion)) lead.push({ label: "Assertion (A)", text: asText(q.assertion) });
    if (isFilled(q.reason)) lead.push({ label: "Reason (R)", text: asText(q.reason) });
    questionSpeech +=
      (isFilled(q.assertion) ? ` Assertion: ${said(q.assertion)}` : "") +
      (isFilled(q.reason) ? ` Reason: ${said(q.reason)}` : "");
  } else if (type === "statement" && arr(q.columnA).length) {
    arr(q.columnA).forEach((t, i) => lead.push({ text: `${i + 1}. ${asText(t)}` }));
    questionSpeech += " " + arr(q.columnA).map((t, i) => `Statement ${i + 1}: ${said(t)}`).join(" ");
  } else if (COLUMN_TYPES.has(type) && (arr(q.columnA).length || arr(q.columnB).length)) {
    columns = {
      a: arr(q.columnA).map((t, i) => ({ badge: String(i + 1), text: asText(t) })),
      b: arr(q.columnB).map((t, i) => ({ badge: ROMAN[i] || String(i + 1), text: asText(t) })),
    };
    questionSpeech +=
      " Column A: " + arr(q.columnA).map((t, i) => `${i + 1}, ${said(t)}`).join(" ") +
      " Column B: " + arr(q.columnB).map((t, i) => `${ROMAN[i] || i + 1}, ${said(t)}`).join(" ");
  }

  const options = optionItems(q || {});
  let spoken = total > 1 ? `Question ${index}.` : "";
  if (read.question) spoken += ` ${questionSpeech}`;
  if (read.options && options.length) {
    spoken += " " + options.map((o) => `Option ${o.badge}: ${said(o.text)}`).join(" ");
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
    answerSpoken = `The correct answer is option ${correct.letter}. ${said(correct.text)}`;
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
