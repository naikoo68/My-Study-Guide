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

// Build the TWO slides for one question:
//   slide 1 "question" — the question with everything needed to answer it
//                        (assertion/reason, statements or matching columns, and
//                        the options), read aloud by the narrator;
//   slide 2 "answer"   — the correct answer, then the explanation (or the quick
//                        recall / first key point when there's no explanation).
// `role` tells the composer which on-screen time applies (questionSec /
// answerSec). `opts` may carry { subjectName } for the small topic line, and
// { index, total } when several questions share one video ("Question 2 of 5").
export function buildSlidePlan(q, opts = {}) {
  const type = asText(q?.type) || "mcq";
  const stem = asText(q?.text) || "Question";
  const total = Math.max(1, Number(opts.total) || 1);
  const index = Math.max(1, Math.min(total, Number(opts.index) || 1));
  const ofN = total > 1 ? ` ${index} OF ${total}` : "";
  // Speech budgets (characters) so the voice fits the slide times the admin
  // set. The stem and the correct answer are always read; the options and the
  // explanation are read only as far as the time allows (they stay on screen).
  const qBudget = Number(opts.questionChars) > 0 ? Number(opts.questionChars) : Infinity;
  const aBudget = Number(opts.answerChars) > 0 ? Number(opts.answerChars) : Infinity;

  // ---- Slide 1: the question ------------------------------------------------
  const topic = topicLabel(q || {}, opts);
  const meta = [topic, asText(q?.difficulty) || "Medium"].filter(Boolean).join("  ·  ");
  const lead = [{ text: meta, muted: true }, { text: stem, emphasis: true }];
  let spoken = (total > 1 ? `Question ${index}. ` : "") + said(stem);
  let columns = null;

  if (type === "assertion" && (isFilled(q.assertion) || isFilled(q.reason))) {
    if (isFilled(q.assertion)) lead.push({ label: "Assertion (A)", text: asText(q.assertion) });
    if (isFilled(q.reason)) lead.push({ label: "Reason (R)", text: asText(q.reason) });
    spoken +=
      (isFilled(q.assertion) ? ` Assertion: ${said(q.assertion)}` : "") +
      (isFilled(q.reason) ? ` Reason: ${said(q.reason)}` : "");
  } else if (type === "statement" && arr(q.columnA).length) {
    arr(q.columnA).forEach((t, i) => lead.push({ text: `${i + 1}. ${asText(t)}` }));
    spoken += " " + arr(q.columnA).map((t, i) => `Statement ${i + 1}: ${said(t)}`).join(" ");
  } else if (COLUMN_TYPES.has(type) && (arr(q.columnA).length || arr(q.columnB).length)) {
    columns = {
      a: arr(q.columnA).map((t, i) => ({ badge: String(i + 1), text: asText(t) })),
      b: arr(q.columnB).map((t, i) => ({ badge: ROMAN[i] || String(i + 1), text: asText(t) })),
    };
    spoken +=
      " Column A: " + arr(q.columnA).map((t, i) => `${i + 1}, ${said(t)}`).join(" ") +
      " Column B: " + arr(q.columnB).map((t, i) => `${ROMAN[i] || i + 1}, ${said(t)}`).join(" ");
  }

  const options = optionItems(q || {});
  if (options.length) {
    const optSpeech = " " + options.map((o) => `Option ${o.badge}: ${said(o.text)}`).join(" ");
    if (spoken.length + optSpeech.length <= qBudget) spoken += optSpeech;
  }

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
  const correct = correctInfo(q || {});
  const body = [];
  let answerSpoken = "";
  if (correct) {
    body.push({ text: `${correct.letter}. ${correct.text}`, emphasis: true, positive: true });
    answerSpoken = `The correct answer is option ${correct.letter}. ${said(correct.text)}`;
  }
  const recall = isFilled(q?.quickRecall) ? asText(q.quickRecall) : (arr(q?.keyPoints)[0] ? asText(arr(q.keyPoints)[0]) : "");
  if (isFilled(q?.explanation)) {
    body.push({ label: "Explanation", text: clipSentences(asText(q.explanation), 420) });
    // Read as much of the explanation as fits the answer time (whole
    // sentences); the fuller explanation stays on screen.
    const room = Math.min(260, aBudget - answerSpoken.length - 1);
    if (room >= 40) {
      const part = clipSentences(toSpeech(q.explanation), room).replace(/…$/, "");
      if (part && part.length <= room) answerSpoken += ` ${part}`;
    }
  }
  if (recall) {
    body.push({ label: "Quick recall", text: clipSentences(recall, 200) });
    const r = ` Quick recall: ${said(recall)}`;
    if (!isFilled(q?.explanation) && answerSpoken.length + r.length <= aBudget) answerSpoken += r;
  }
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
