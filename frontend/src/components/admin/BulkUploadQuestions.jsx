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
const splitList = (s) => String(s || "").split("|").map((x) => x.trim()).filter(Boolean);

// Turns pasted CSV text into question objects + a list of skipped-row errors.
// Supports two row shapes:
//   MCQ (default):  Question, OptionA, OptionB, OptionC, OptionD, Correct, Difficulty, Explanation
//   Matching:       matching, Question, ColumnA, ColumnB, OptionA, OptionB, OptionC, OptionD, Correct, Difficulty, Explanation
// For matching, ColumnA / ColumnB are pipe-separated lists, e.g. "Newton|Bohr|Curie".
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
      const [, qtext, colA, colB, a, b, c, d, correct, difficulty, explanation] = cells;
      const columnA = splitList(colA);
      const columnB = splitList(colB);
      if (!qtext || columnA.length < 2 || columnB.length < 2 || !a || !b || !c || !d) {
        errors.push(`Row ${idx + 1}: matching needs a question, ColumnA & ColumnB (2+ items each, pipe-separated) and 4 options`);
        return;
      }
      rows.push({
        type: "matching",
        text: qtext,
        columnA,
        columnB,
        options: [a, b, c, d],
        correct: correctIndex(correct),
        difficulty: asDifficulty(difficulty),
        explanation: explanation || "",
        status: "published",
      });
      return;
    }

    // ---- MCQ row (optionally prefixed with "mcq") ----
    const cols = first === "mcq" ? cells.slice(1) : cells;
    if (cols.length < 5) { errors.push(`Row ${idx + 1}: needs a question + 4 options`); return; }
    const [qtext, a, b, c, d, correct, difficulty, explanation] = cols;
    if (!qtext || !a || !b || !c || !d) { errors.push(`Row ${idx + 1}: empty question or option`); return; }
    rows.push({
      type: "mcq",
      text: qtext,
      options: [a, b, c, d],
      correct: correctIndex(correct),
      difficulty: asDifficulty(difficulty),
      explanation: explanation || "",
      status: "published",
    });
  });
  return { rows, errors };
}

const TEMPLATE =
  "Question,Option A,Option B,Option C,Option D,Correct,Difficulty,Explanation\n" +
  '"What is 2+2?",3,4,5,6,B,Easy,"2+2 equals 4"\n' +
  '"Speed of light (m/s)?","3x10^8","1x10^6","3x10^6","9x10^8",A,Medium,\n' +
  'matching,"Match the scientist to the discovery","Newton|Einstein|Bohr|Curie","Relativity|Gravity|Atom model|Radioactivity","1-II, 2-I, 3-III, 4-IV","1-I, 2-II, 3-III, 4-IV","1-III, 2-IV, 3-I, 4-II","1-IV, 2-III, 3-II, 4-I",A,Medium,"Newton-Gravity, Einstein-Relativity, Bohr-Atom, Curie-Radioactivity"';

// Reusable bulk-upload modal. `onUpload(questions)` should return a promise
// (e.g. resolving to { inserted }). Used for both quizzes and test series.
export default function BulkUploadQuestions({ open, onClose, onUpload, title = "Bulk Upload Questions" }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

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
    setBusy(true);
    setMsg("");
    try {
      const res = await onUpload(rows);
      setMsg(`✓ Uploaded ${res?.inserted ?? rows.length} question(s).`);
      setText("");
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
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            <b>MCQ:</b> <code>Question, Option A, Option B, Option C, Option D, Correct, Difficulty, Explanation</code>
          </p>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            <b>Matching:</b> start the line with <code>matching</code>, then <code>Question, ColumnA, ColumnB, Option A, Option B, Option C, Option D, Correct, Difficulty, Explanation</code>
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-500 dark:text-slate-400">
            <li><b>Correct</b>: A/B/C/D (or 1–4) — the correct answer option.</li>
            <li><b>Matching ColumnA / ColumnB</b>: separate items with a pipe <code>|</code>, e.g. <code>"Newton|Bohr|Curie"</code>. Column A shows as 1,2,3… and Column B as I,II,III…</li>
            <li>Each matching <b>option</b> is a sequence like <code>1-III, 2-I, 3-IV, 4-II</code>.</li>
            <li><b>Difficulty</b> &amp; <b>Explanation</b> are optional. Wrap any value containing a comma in "double quotes".</li>
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

        <div className="mb-3">
          <label className="btn-outline cursor-pointer">
            <FileText className="h-4 w-4" /> Choose CSV file
            <input type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
          </label>
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

        {msg && <p className="mt-3 text-sm font-medium">{msg}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button type="button" onClick={submit} disabled={busy || !rows.length} className="btn-primary">
            {busy ? "Uploading…" : `Upload ${rows.length || ""} Question(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}
