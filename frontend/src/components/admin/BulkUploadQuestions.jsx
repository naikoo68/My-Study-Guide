import { useState } from "react";
import { X, Upload, FileText, CheckCircle2, AlertTriangle } from "lucide-react";

// Full CSV parser that respects double-quoted fields — which may contain
// commas AND line breaks (e.g. a multi-line "Consider the following
// statements…" question). Returns an array of records (each an array of cells).
function parseCsvRecords(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote ""
        else inQ = false;
      } else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* ignore */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  row.push(field);
  rows.push(row);
  // Keep only records that have some content; trim each cell.
  return rows.filter((r) => r.some((f) => String(f).trim() !== "")).map((r) => r.map((f) => f.trim()));
}

function correctIndex(v) {
  const s = String(v ?? "").trim().toUpperCase();
  if (["A", "B", "C", "D"].includes(s)) return "ABCD".indexOf(s);
  const n = parseInt(s, 10);
  if (n >= 1 && n <= 4) return n - 1;
  return 0;
}

const asDifficulty = (d) => (["Easy", "Medium", "Hard"].includes(d) ? d : "Medium");
// Strip a leading list marker ("1.", "2)", "I.", "(iii)", "IV -") from an item,
// since the app auto-numbers Column A (1,2,3,4) and Column B (I,II,III,IV) and
// statement/pair lists. This avoids double numbering like "1  1. Constant MRT".
export const stripListMarker = (x) =>
  String(x || "").replace(/^\s*[([]?\s*(?:\d{1,2}|[ivxlcIVXLC]{1,5})\s*[.)\]:\-]\s+/, "").trim();
const splitList = (s) => String(s || "").split("|").map((x) => stripListMarker(x)).filter(Boolean);

// Builds the per-option brief notes (why each WRONG option is wrong). The four
// cells align to options A–D; the correct option's cell is always cleared,
// since the correct answer is covered by the detailed Explanation column.
// Returns undefined when no notes were supplied so we don't store empty arrays.
function buildOptionExplanations(cells, correctIdx) {
  const four = [cells[0], cells[1], cells[2], cells[3]].map((x) => String(x || "").trim());
  if (!four.some(Boolean)) return undefined;
  four[correctIdx] = "";
  return four;
}

// Turns pasted CSV text into question objects + a list of skipped-row errors.
// Supports seven row shapes (all end with optional Difficulty, Explanation, WhyA..D):
//   MCQ (default):  Question, OptionA..D, Correct, ...
//   Matching:       matching, Question, ColumnA, ColumnB, OptionA..D, Correct, ...
//   Statement:      statement, Intro, Statements, OptionA..D, Correct, ...
//   Pair:           pair, Intro, LeftList, RightList, OptionA..D, Correct, ...
//   Pair-select:    pairselect, Intro, LeftList, RightList, OptionA..D, Correct, ...
//   Image:          image, ImageURL, Question, OptionA..D, Correct, ...
//   Table:          table, Intro, TableData, OptionA..D, Correct, ...
//   Assertion:      assertion, Assertion, Reason, OptionA..D, Correct, ...
// Explanation is the DETAILED note for the correct answer; WhyA..D are optional
// BRIEF notes shown when a student selects that (wrong) option — the correct
// option's Why cell is ignored. Lists (ColumnA/ColumnB/Statements/LeftList/
// RightList) are pipe-separated, e.g. "Newton|Bohr|Curie". TableData uses "|"
// between rows and ";" between cells; the first row is the header.
export function parseQuestionsCsv(text) {
  const records = parseCsvRecords(text);
  const rows = [];
  const errors = [];
  records.forEach((cells, idx) => {
    const first = (cells[0] || "").toLowerCase();

    // Skip an optional header row.
    if (idx === 0 && /^(type|text|question)$/i.test(first)) return;

    // ---- Matching row ----
    if (first === "matching") {
      const [, qtext, colA, colB, a, b, c, d, correct, difficulty, explanation, wa, wb, wc, wd] = cells;
      const columnA = splitList(colA);
      const columnB = splitList(colB);
      if (!qtext || columnA.length < 2 || columnB.length < 2 || !a || !b || !c || !d) {
        errors.push(`Row ${idx + 1}: matching needs a question, ColumnA & ColumnB (2+ items each, pipe-separated) and 4 options`);
        return;
      }
      const ci = correctIndex(correct);
      const optExp = buildOptionExplanations([wa, wb, wc, wd], ci);
      rows.push({
        type: "matching",
        text: qtext,
        columnA,
        columnB,
        options: [a, b, c, d],
        correct: ci,
        difficulty: asDifficulty(difficulty),
        explanation: explanation || "",
        ...(optExp ? { optionExplanations: optExp } : {}),
        status: "published",
      });
      return;
    }

    // ---- Statement-based row ----
    if (first === "statement") {
      const [, qtext, statements, a, b, c, d, correct, difficulty, explanation, wa, wb, wc, wd] = cells;
      const columnA = splitList(statements);
      if (!qtext || columnA.length < 2 || !a || !b || !c || !d) {
        errors.push(`Row ${idx + 1}: statement needs an intro, 2+ pipe-separated statements and 4 options`);
        return;
      }
      const ci = correctIndex(correct);
      const optExp = buildOptionExplanations([wa, wb, wc, wd], ci);
      rows.push({
        type: "statement",
        text: qtext,
        columnA,
        options: [a, b, c, d],
        correct: ci,
        difficulty: asDifficulty(difficulty),
        explanation: explanation || "",
        ...(optExp ? { optionExplanations: optExp } : {}),
        status: "published",
      });
      return;
    }

    // ---- Pair-matching row (how many pairs are correct) ----
    if (first === "pair") {
      const [, qtext, leftList, rightList, a, b, c, d, correct, difficulty, explanation, wa, wb, wc, wd] = cells;
      const columnA = splitList(leftList);
      const columnB = splitList(rightList);
      if (!qtext || columnA.length < 2 || columnA.length !== columnB.length || !a || !b || !c || !d) {
        errors.push(`Row ${idx + 1}: pair needs an intro, equal-length Left & Right lists (2+ items, pipe-separated) and 4 options`);
        return;
      }
      const ci = correctIndex(correct);
      const optExp = buildOptionExplanations([wa, wb, wc, wd], ci);
      rows.push({
        type: "pair",
        text: qtext,
        columnA,
        columnB,
        options: [a, b, c, d],
        correct: ci,
        difficulty: asDifficulty(difficulty),
        explanation: explanation || "",
        ...(optExp ? { optionExplanations: optExp } : {}),
        status: "published",
      });
      return;
    }

    // ---- Pair-select row (which pairs are correct — combination options) ----
    if (first === "pairselect") {
      const [, qtext, leftList, rightList, a, b, c, d, correct, difficulty, explanation, wa, wb, wc, wd] = cells;
      const columnA = splitList(leftList);
      const columnB = splitList(rightList);
      if (!qtext || columnA.length < 2 || columnA.length !== columnB.length || !a || !b || !c || !d) {
        errors.push(`Row ${idx + 1}: pairselect needs an intro, equal-length Left & Right lists (2+ items, pipe-separated) and 4 options`);
        return;
      }
      const ci = correctIndex(correct);
      const optExp = buildOptionExplanations([wa, wb, wc, wd], ci);
      rows.push({
        type: "pairselect",
        text: qtext,
        columnA,
        columnB,
        options: [a, b, c, d],
        correct: ci,
        difficulty: asDifficulty(difficulty),
        explanation: explanation || "",
        ...(optExp ? { optionExplanations: optExp } : {}),
        status: "published",
      });
      return;
    }

    // ---- Assertion & Reason row ----
    if (first === "assertion") {
      const [, assertion, reason, a, b, c, d, correct, difficulty, explanation, wa, wb, wc, wd] = cells;
      if (!assertion || !reason || !a || !b || !c || !d) {
        errors.push(`Row ${idx + 1}: assertion needs an Assertion, a Reason and 4 options`);
        return;
      }
      const ci = correctIndex(correct);
      const optExp = buildOptionExplanations([wa, wb, wc, wd], ci);
      rows.push({
        type: "assertion",
        text: "In the following question, a statement of Assertion (A) is followed by a statement of Reason (R). Select the correct option:",
        assertion,
        reason,
        options: [a, b, c, d],
        correct: ci,
        difficulty: asDifficulty(difficulty),
        explanation: explanation || "",
        ...(optExp ? { optionExplanations: optExp } : {}),
        status: "published",
      });
      return;
    }

    // ---- Image / diagram row ----
    if (first === "image") {
      const [, imageUrl, qtext, a, b, c, d, correct, difficulty, explanation, wa, wb, wc, wd] = cells;
      if (!imageUrl || !qtext || !a || !b || !c || !d) {
        errors.push(`Row ${idx + 1}: image needs an image URL, a question and 4 options`);
        return;
      }
      const ci = correctIndex(correct);
      const optExp = buildOptionExplanations([wa, wb, wc, wd], ci);
      rows.push({
        type: "image",
        image: imageUrl,
        text: qtext,
        options: [a, b, c, d],
        correct: ci,
        difficulty: asDifficulty(difficulty),
        explanation: explanation || "",
        ...(optExp ? { optionExplanations: optExp } : {}),
        status: "published",
      });
      return;
    }

    // ---- Table row (dynamic rows × columns) ----
    if (first === "table") {
      const [, qtext, tableData, a, b, c, d, correct, difficulty, explanation, wa, wb, wc, wd] = cells;
      // Rows separated by "|", cells within a row separated by ";".
      const tableRows = String(tableData || "")
        .split("|")
        .map((r) => r.split(";").map((cell) => cell.trim()))
        .filter((r) => r.some((cell) => cell !== ""));
      if (!qtext || tableRows.length < 2 || !a || !b || !c || !d) {
        errors.push(`Row ${idx + 1}: table needs an intro, a table (rows split by "|", cells by ";") and 4 options`);
        return;
      }
      const ci = correctIndex(correct);
      const optExp = buildOptionExplanations([wa, wb, wc, wd], ci);
      rows.push({
        type: "table",
        text: qtext,
        tableRows,
        options: [a, b, c, d],
        correct: ci,
        difficulty: asDifficulty(difficulty),
        explanation: explanation || "",
        ...(optExp ? { optionExplanations: optExp } : {}),
        status: "published",
      });
      return;
    }

    // ---- MCQ row (optionally prefixed with "mcq") ----
    const cols = first === "mcq" ? cells.slice(1) : cells;
    if (cols.length < 5) { errors.push(`Row ${idx + 1}: needs a question + 4 options`); return; }
    const [qtext, a, b, c, d, correct, difficulty, explanation, wa, wb, wc, wd] = cols;
    if (!qtext || !a || !b || !c || !d) { errors.push(`Row ${idx + 1}: empty question or option`); return; }
    const ci = correctIndex(correct);
    const optExp = buildOptionExplanations([wa, wb, wc, wd], ci);
    rows.push({
      type: "mcq",
      text: qtext,
      options: [a, b, c, d],
      correct: ci,
      difficulty: asDifficulty(difficulty),
      explanation: explanation || "",
      ...(optExp ? { optionExplanations: optExp } : {}),
      status: "published",
    });
  });
  return { rows, errors };
}

// ---- CSV export (reverse of parseQuestionsCsv) ----
const LETTERS = ["A", "B", "C", "D"];

// Escape a single CSV cell: quote it when it contains a comma/quote/newline.
function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// The WhyA..D tail cells from optionExplanations (the correct option is blank).
function whyCells(q) {
  const oe = Array.isArray(q.optionExplanations) ? q.optionExplanations : [];
  return [0, 1, 2, 3].map((i) => (i === q.correct ? "" : oe[i] || ""));
}

// Convert an array of question objects into CSV text that parseQuestionsCsv can
// read back — used to "Copy whole quiz/test as CSV". Handles every type.
export function questionsToCsv(questions) {
  return (questions || [])
    .map((q) => {
      const o = q.options || [];
      const [a, b, c, d] = [o[0] || "", o[1] || "", o[2] || "", o[3] || ""];
      const tail = [LETTERS[q.correct] || "A", q.difficulty || "Medium", q.explanation || "", ...whyCells(q)];
      const A = (arr) => (arr || []).join("|");
      let cells;
      switch (q.type) {
        case "matching": cells = ["matching", q.text, A(q.columnA), A(q.columnB), a, b, c, d, ...tail]; break;
        case "statement": cells = ["statement", q.text, A(q.columnA), a, b, c, d, ...tail]; break;
        case "pair": cells = ["pair", q.text, A(q.columnA), A(q.columnB), a, b, c, d, ...tail]; break;
        case "pairselect": cells = ["pairselect", q.text, A(q.columnA), A(q.columnB), a, b, c, d, ...tail]; break;
        case "table": cells = ["table", q.text, (q.tableRows || []).map((r) => (r || []).join(";")).join("|"), a, b, c, d, ...tail]; break;
        case "assertion": cells = ["assertion", q.assertion || "", q.reason || "", a, b, c, d, ...tail]; break;
        case "image": cells = ["image", q.image || "", q.text, a, b, c, d, ...tail]; break;
        default: cells = [q.text, a, b, c, d, ...tail];
      }
      while (cells.length && cells[cells.length - 1] === "") cells.pop(); // trim trailing empties
      return cells.map(csvCell).join(",");
    })
    .join("\n");
}

const TEMPLATE =
  "Question,Option A,Option B,Option C,Option D,Correct,Difficulty,Explanation,WhyA,WhyB,WhyC,WhyD\n" +
  '"What is 2+2?",3,4,5,6,B,Easy,"2+2 equals 4 because you add two and two.","3 is 2+1, not 2+2.",,"5 is 2+3.","6 is 2+4."\n' +
  '"Speed of light in vacuum (m/s)?","3x10^8","1x10^6","3x10^6","9x10^8",A,Medium,"Light travels at ~3x10^8 m/s in vacuum.",,"Too small by 100x.","Too small by 100x.","This is higher than the actual value."\n' +
  'matching,"Match the scientist to the discovery","Newton|Einstein|Bohr|Curie","Relativity|Gravity|Atom model|Radioactivity","1-II, 2-I, 3-III, 4-IV","1-I, 2-II, 3-III, 4-IV","1-III, 2-IV, 3-I, 4-II","1-IV, 2-III, 3-II, 4-I",A,Medium,"Newton-Gravity, Einstein-Relativity, Bohr-Atom model, Curie-Radioactivity",,"Swaps Newton and Einstein.","All mappings are shifted.","Order is fully reversed."\n' +
  'statement,"Consider the following statements:","The Sun is a star.|The Moon is a planet.|Water boils at 100°C at sea level.","1 and 3 only","2 and 3 only","1 and 2 only","1, 2 and 3",A,Medium,"Statements 1 and 3 are correct; the Moon is a satellite, not a planet.",,"Statement 2 is wrong — the Moon is a satellite.","Includes the wrong statement 2.","Includes the wrong statement 2."\n' +
  'pair,"Consider the following pairs (River — Tributary):","Ganga|Indus|Krishna","Yamuna|Chenab|Tungabhadra","Only one pair","Only two pairs","Only three pairs","All four pairs",C,Medium,"All three pairs are correctly matched.","Undercount.","Undercount.",,"There are only three pairs listed."\n' +
  'pairselect,"Consider the following pairs (State — Capital):","Kerala|Punjab|Bihar","Thiruvananthapuram|Chandigarh|Jaipur","1 and 2 only","2 and 3 only","1 and 3 only","1, 2 and 3",A,Medium,"Pairs 1 and 2 are correct; Jaipur is in Rajasthan, not Bihar (Patna).",,"Includes the wrong pair 3.","Includes the wrong pair 3.","Includes the wrong pair 3."\n' +
  'image,"https://res.cloudinary.com/demo/image/upload/diagram.png","Identify the labelled part in the diagram:","Nucleus","Mitochondrion","Ribosome","Golgi body",A,Medium,"The labelled central organelle is the nucleus.",,"Mitochondria are rod-shaped, not central.","Ribosomes are much smaller dots.","Golgi is a stack of membranes."\n' +
  'table,"Study the table and answer which product had the highest sales:","Product;Sales|Pens;120|Books;340|Bags;90","Pens","Books","Bags","Cannot be determined",B,Easy,"Books have the highest sales at 340.","Pens are 120.",,"Bags are only 90.","The table gives clear figures."\n' +
  'assertion,"The Earth is closer to the Sun in January.","The Earth\'s orbit around the Sun is elliptical.","Both A and R are true and R is the correct explanation of A","Both A and R are true but R is NOT the correct explanation of A","A is true but R is false","A is false but R is true",A,Medium,"Earth reaches perihelion in early January because its orbit is elliptical — so R correctly explains A.",,"R does explain A here.","R is true, not false.","A is true, not false."';

// Reusable bulk-upload modal. `onUpload(questions)` should return a promise
// (e.g. resolving to { inserted }). Used for both quizzes and test series.
export default function BulkUploadQuestions({ open, onClose, onUpload, title = "Bulk Upload Questions", sections = [] }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [replace, setReplace] = useState(false); // remove existing questions first
  const [section, setSection] = useState(sections[0] || ""); // subject to tag uploaded questions

  if (!open) return null;

  const { rows, errors } = parseQuestionsCsv(text);

  const onFile = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ""));
    reader.readAsText(file);
  };

  const submit = async () => {
    if (!rows.length) { setMsg("Nothing to upload — add at least one valid row."); return; }
    if (replace && !window.confirm("This will permanently DELETE all existing questions here and replace them with the uploaded ones. Continue?")) return;
    setBusy(true);
    setMsg("");
    try {
      const res = await onUpload(rows, { replace, section });
      setMsg(`✓ ${replace ? "Replaced with" : "Uploaded"} ${res?.inserted ?? rows.length} question(s).`);
      setText("");
      setReplace(false);
      setTimeout(onClose, 1000);
    } catch (e) {
      setMsg(e.message || "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-2xl animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Upload className="h-5 w-5" /> {title}</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-4 rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/60">
          <p className="font-semibold">CSV format (one question per line):</p>
          <p className="mt-1 text-slate-500 dark:text-slate-400">Every row ends with the same tail: <code>…, Correct, Difficulty, Explanation, WhyA, WhyB, WhyC, WhyD</code></p>
          <p className="mt-1 text-slate-500 dark:text-slate-400"><b>MCQ:</b> <code>Question, Option A, Option B, Option C, Option D, …tail</code></p>
          <p className="mt-1 text-slate-500 dark:text-slate-400"><b>Matching:</b> <code>matching, Question, ColumnA, ColumnB, Option A–D, …tail</code></p>
          <p className="mt-1 text-slate-500 dark:text-slate-400"><b>Statement:</b> <code>statement, Intro, Statements, Option A–D, …tail</code></p>
          <p className="mt-1 text-slate-500 dark:text-slate-400"><b>Pair (count):</b> <code>pair, Intro, LeftList, RightList, Option A–D, …tail</code></p>
          <p className="mt-1 text-slate-500 dark:text-slate-400"><b>Pair-select (which pairs):</b> <code>pairselect, Intro, LeftList, RightList, Option A–D, …tail</code></p>
          <p className="mt-1 text-slate-500 dark:text-slate-400"><b>Image:</b> <code>image, ImageURL, Question, Option A–D, …tail</code></p>
          <p className="mt-1 text-slate-500 dark:text-slate-400"><b>Table:</b> <code>table, Intro, TableData, Option A–D, …tail</code> — TableData rows split by <code>|</code>, cells by <code>;</code> (first row = header)</p>
          <p className="mt-1 text-slate-500 dark:text-slate-400"><b>Assertion &amp; Reason:</b> <code>assertion, Assertion, Reason, Option A–D, …tail</code></p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-500 dark:text-slate-400">
            <li><b>Correct</b>: A/B/C/D (or 1–4) — the correct answer option.</li>
            <li><b>Explanation</b>: the <b>detailed</b> explanation of the correct answer (shown after answering).</li>
            <li><b>WhyA–WhyD</b> (optional): a <b>brief</b> note for each option explaining why it is wrong — shown when a student picks it. Leave the correct option's cell blank (it's ignored).</li>
            <li><b>Lists</b> (ColumnA/ColumnB, Statements, LeftList/RightList): separate items with a pipe <code>|</code>, e.g. <code>"Newton|Bohr|Curie"</code>.</li>
            <li><b>Matching option</b> is a sequence like <code>1-III, 2-I, 3-IV, 4-II</code>. <b>Statement</b> options are combos like <code>"1 and 2 only"</code>. <b>Pair</b> options are counts like <code>"Only two pairs"</code>.</li>
            <li>Wrap any value containing a comma in "double quotes". Difficulty, Explanation &amp; Why columns are optional.</li>
            <li>Tip: build it in Excel/Google Sheets, then <b>Save/Download as CSV</b> and upload the file below.</li>
          </ul>
          <button
            type="button"
            onClick={() => setText(TEMPLATE)}
            className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline"
          >
            <FileText className="h-3.5 w-3.5" /> Load example
          </button>
        </div>

        {sections.length > 0 && (
          <div className="mb-3 flex items-center gap-2">
            <label className="text-sm font-semibold text-slate-600 dark:text-slate-300">Add to subject:</label>
            <select value={section} onChange={(e) => setSection(e.target.value)} className="input max-w-xs py-1.5 text-sm">
              <option value="">— No subject —</option>
              {sections.map((s, i) => <option key={i} value={s}>{s}</option>)}
            </select>
          </div>
        )}

        <div className="mb-3 flex flex-wrap gap-2">
          <label className="btn-outline cursor-pointer">
            <FileText className="h-4 w-4" /> Choose CSV file
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
          </label>
          {text.trim() && (
            <button type="button" onClick={() => { setText(""); setMsg(""); }} className="btn-outline">
              <X className="h-4 w-4" /> Clear text
            </button>
          )}
        </div>

        <textarea
          rows={9}
          className="input resize-y font-mono text-xs"
          placeholder="Paste your CSV rows here, or use “Choose CSV file” above…"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          {rows.length > 0 && (
            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> {rows.length} valid question(s) ready
            </span>
          )}
          {errors.length > 0 && (
            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertTriangle className="h-4 w-4" /> {errors.length} row(s) will be skipped
            </span>
          )}
        </div>
        {errors.length > 0 && (
          <div className="mt-2 max-h-24 overflow-y-auto rounded-lg bg-amber-50 p-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            {errors.slice(0, 8).map((e, i) => <div key={i}>{e}</div>)}
          </div>
        )}

        <label className={`mt-3 flex items-start gap-2 rounded-xl border p-3 text-sm ${replace ? "border-rose-300 bg-rose-50 dark:border-rose-800 dark:bg-rose-900/20" : "border-slate-200 dark:border-slate-700"}`}>
          <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 h-4 w-4 accent-rose-600" />
          <span>
            <span className="font-semibold text-rose-700 dark:text-rose-300">Remove existing questions first (replace all)</span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">Deletes all current questions here, then uploads these. Leave unchecked to simply add to the existing ones.</span>
          </span>
        </label>

        {msg && <p className="mt-3 text-sm font-medium">{msg}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !rows.length} className={replace ? "btn-primary bg-rose-600 hover:bg-rose-700" : "btn-primary"}>
            {busy ? (replace ? "Replacing…" : "Uploading…") : `${replace ? "Replace with" : "Upload"} ${rows.length || ""} Question(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
