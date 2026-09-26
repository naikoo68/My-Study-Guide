// Build the SLIDE PLAN (what each slide shows + what the narrator says) for one
// question, adapting to the question TYPE. This is PURE logic (no I/O), so it is
// easy to unit-test and reuse. The renderer (slideRender.js) turns each slide
// into a branded image, and the TTS service (tts.js) speaks each `narration`.
//
// It works across the app's question types — it never assumes a plain MCQ:
//   • mcq / numericalmcq / image / etc. : stem → options → answer → explanation
//   • assertion                          : assertion+reason → options → answer …
//   • statement                          : statements → options → answer …
//   • matching / pair / pairselect       : Column A + Column B → options → answer
//   • table                              : stem (+ the table on the stem slide)
// Slides whose content is missing are skipped, so a sparse question yields fewer
// slides and a rich one yields more (roughly 4–7).

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
  s = s.replace(/\\[a-zA-Z]+/g, " "); // any remaining commands
  s = s.replace(/[{}\\]/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

// A short spoken label for the difficulty, with the correct article
// ("an easy", "a medium", "a hard") so the narration reads naturally.
const diffWord = (d) => {
  const w = ["Easy", "Medium", "Hard"].includes(d) ? d.toLowerCase() : "medium";
  return `${/^[aeiou]/.test(w) ? "an" : "a"} ${w}`;
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

// Build the ordered list of slides. `opts` may carry { subjectName, siteName,
// siteUrl, tagline } for branding text.
export function buildSlidePlan(q, opts = {}) {
  const siteName = asText(opts.siteName) || "My Study Guide";
  const siteUrl = asText(opts.siteUrl) || "www.mystudyguide.in";
  const tagline = asText(opts.tagline) || "PREPARE SMART, ACHIEVE MORE";
  const type = asText(q?.type) || "mcq";
  const slides = [];

  // ---- Slide 1: intro / "Question of the day" ------------------------------
  const topic = topicLabel(q, opts);
  slides.push({
    id: "intro",
    tag: "QUESTION OF THE DAY",
    accent: "brand",
    heading: topic || "Test Your Knowledge",
    body: [
      ...(topic ? [] : []),
      { label: "Difficulty", value: (q.difficulty || "Medium") },
      { text: "Can you answer before the reveal?", muted: true },
    ],
    narration: `Here is today's question from ${siteName}. This is ${diffWord(q.difficulty)} level question${topic ? ` on ${toSpeech(topic)}` : ""}. Try to answer it before the solution is revealed.`,
  });

  // ---- Slide 2: the question (adapts to type) ------------------------------
  const stem = asText(q.text) || "Question";
  const questionBody = [{ text: stem, emphasis: true }];
  let questionNarration = `Question. ${toSpeech(stem)}`;

  if (type === "assertion" && (isFilled(q.assertion) || isFilled(q.reason))) {
    if (isFilled(q.assertion)) questionBody.push({ label: "Assertion (A)", text: asText(q.assertion) });
    if (isFilled(q.reason)) questionBody.push({ label: "Reason (R)", text: asText(q.reason) });
    questionNarration =
      `${toSpeech(stem)} ` +
      (isFilled(q.assertion) ? `Assertion: ${toSpeech(q.assertion)}. ` : "") +
      (isFilled(q.reason) ? `Reason: ${toSpeech(q.reason)}.` : "");
  } else if (type === "statement" && arr(q.columnA).length) {
    arr(q.columnA).forEach((t, i) => questionBody.push({ badge: String(i + 1), text: asText(t) }));
    questionNarration =
      `${toSpeech(stem)} Consider the following statements. ` +
      arr(q.columnA).map((t, i) => `Statement ${i + 1}: ${toSpeech(t)}.`).join(" ");
  } else if (COLUMN_TYPES.has(type) && (arr(q.columnA).length || arr(q.columnB).length)) {
    slides.push({
      id: "question",
      tag: "QUESTION",
      accent: "brand",
      heading: "Match the columns",
      body: [{ text: stem, emphasis: true }],
      columns: {
        a: arr(q.columnA).map((t, i) => ({ badge: String(i + 1), text: asText(t) })),
        b: arr(q.columnB).map((t, i) => ({ badge: ROMAN[i] || String(i + 1), text: asText(t) })),
      },
      narration:
        `${toSpeech(stem)} Match Column A with Column B. ` +
        arr(q.columnA).map((t, i) => `${i + 1}: ${toSpeech(t)}.`).join(" ") +
        " " +
        arr(q.columnB).map((t, i) => `${ROMAN[i] || i + 1}: ${toSpeech(t)}.`).join(" "),
    });
  }

  // Push the generic question slide unless we already pushed a columns slide.
  if (!(COLUMN_TYPES.has(type) && (arr(q.columnA).length || arr(q.columnB).length))) {
    slides.push({ id: "question", tag: "QUESTION", accent: "brand", heading: "", body: questionBody, narration: questionNarration });
  }

  // ---- Slide 3: the options ------------------------------------------------
  const options = optionItems(q);
  if (options.length) {
    slides.push({
      id: "options",
      tag: "CHOOSE YOUR ANSWER",
      accent: "orange",
      heading: "",
      options,
      narration:
        "Choose your answer. " +
        options.map((o) => `Option ${o.badge}: ${toSpeech(o.text)}.`).join(" "),
    });
  }

  // ---- Slide 4: the answer -------------------------------------------------
  const correct = correctInfo(q);
  if (correct) {
    slides.push({
      id: "answer",
      tag: "ANSWER",
      accent: "green",
      heading: `Correct Answer: ${correct.letter}`,
      body: [{ text: correct.text, emphasis: true, positive: true }],
      narration: `The correct answer is option ${correct.letter}. ${toSpeech(correct.text)}.`,
    });
  }

  // ---- Slide 5: explanation ------------------------------------------------
  if (isFilled(q.explanation)) {
    slides.push({
      id: "explanation",
      tag: "EXPLANATION",
      accent: "brand",
      heading: "",
      body: [{ text: asText(q.explanation) }],
      narration: `Here's why. ${toSpeech(q.explanation)}`,
    });
  }

  // ---- Slide 6: quick recall / key point -----------------------------------
  const recall = isFilled(q.quickRecall) ? asText(q.quickRecall) : (arr(q.keyPoints)[0] ? asText(arr(q.keyPoints)[0]) : "");
  if (recall) {
    const keyPts = arr(q.keyPoints).slice(0, 3);
    slides.push({
      id: "recall",
      tag: "QUICK RECALL",
      accent: "orange",
      heading: "",
      body: isFilled(q.quickRecall)
        ? [{ text: asText(q.quickRecall), emphasis: true }]
        : keyPts.map((t) => ({ bullet: true, text: asText(t) })),
      narration: `Quick recall. ${toSpeech(recall)}`,
    });
  }

  // ---- Slide 7: brand / CTA ------------------------------------------------
  slides.push({
    id: "cta",
    tag: "",
    accent: "brand",
    brand: true,
    heading: siteName,
    body: [
      { text: tagline, emphasis: true },
      { text: "LEARN • PRACTICE • SUCCEED", muted: true },
      { text: siteUrl, link: true },
    ],
    narration: `Prepare smart, achieve more with ${siteName}. Learn, practice, test and improve. Follow us for a new question every day.`,
  });

  return slides;
}
