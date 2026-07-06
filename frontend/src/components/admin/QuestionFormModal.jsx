import { useState } from "react";
import { Plus, Trash2, X, Image as ImageIcon } from "lucide-react";

// Roman numerals for Column B labels (I, II, III, IV…)
function toRomanLite(n) {
  const m = [["X", 10], ["IX", 9], ["V", 5], ["IV", 4], ["I", 1]];
  let r = "";
  for (const [s, v] of m) while (n >= v) { r += s; n -= v; }
  return r;
}

export const emptyQuestion = {
  type: "mcq",
  text: "",
  options: ["", "", "", ""],
  optionExplanations: ["", "", "", ""],
  correct: 0,
  columnA: ["", "", "", ""],
  columnB: ["", "", "", ""],
  difficulty: "Easy",
  explanation: "",
  status: "published",
  image: "",
};

function Field({ label, children }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium">{label}</label>
      {children}
    </div>
  );
}

// Reusable Add/Edit question modal supporting simple MCQs and matching MCQs.
// `question` = existing data (edit) or null (add). `onSave(payload)` receives a
// clean payload (the parent attaches context like quiz/testSeries + calls the API).
export default function QuestionFormModal({ question, saving, onClose, onSave }) {
  const data = question || emptyQuestion;
  const [form, setForm] = useState(() => ({
    type: data.type || "mcq",
    text: data.text || "",
    options: data.options && data.options.length ? [...data.options] : ["", "", "", ""],
    optionExplanations: data.optionExplanations && data.optionExplanations.length ? [...data.optionExplanations] : ["", "", "", ""],
    correct: data.correct ?? 0,
    columnA: data.columnA && data.columnA.length ? [...data.columnA] : ["", "", "", ""],
    columnB: data.columnB && data.columnB.length ? [...data.columnB] : ["", "", "", ""],
    difficulty: data.difficulty || "Easy",
    explanation: data.explanation || "",
    status: data.status || "published",
    image: data.image || "",
  }));

  const submit = (e) => {
    e.preventDefault();
    const base = {
      type: form.type || "mcq",
      text: form.text,
      image: form.image,
      difficulty: form.difficulty,
      explanation: form.explanation,
      // Correct option is covered by the main detailed explanation, so its
      // per-option note is always cleared; only the other three carry a brief.
      optionExplanations: (form.optionExplanations || []).map((x, i) => (i === form.correct ? "" : (x || "").trim())),
      status: form.status,
    };
    let payload;
    if (form.type === "matching") {
      payload = {
        ...base,
        columnA: (form.columnA || []).filter((x) => x.trim()),
        columnB: (form.columnB || []).filter((x) => x.trim()),
        options: form.options,
        correct: form.correct,
      };
    } else if (form.type === "statement") {
      payload = {
        ...base,
        columnA: (form.columnA || []).map((x) => (x || "").trim()).filter(Boolean),
        columnB: [],
        options: form.options,
        correct: form.correct,
      };
    } else if (form.type === "pair") {
      // Keep the two sides aligned: drop only rows where BOTH sides are empty.
      const n = Math.max(form.columnA.length, form.columnB.length);
      const rows = [];
      for (let i = 0; i < n; i++) {
        const a = (form.columnA[i] || "").trim();
        const b = (form.columnB[i] || "").trim();
        if (a || b) rows.push([a, b]);
      }
      payload = {
        ...base,
        columnA: rows.map((r) => r[0]),
        columnB: rows.map((r) => r[1]),
        options: form.options,
        correct: form.correct,
      };
    } else {
      payload = { ...base, options: form.options, correct: form.correct };
    }
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <form onSubmit={submit} className="my-8 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">{question ? "Edit" : "Add"} Question</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-4">
          <Field label="Question Type">
            <select
              className="input"
              value={form.type}
              onChange={(e) => {
                const type = e.target.value;
                setForm((f) => {
                  const next = { ...f, type };
                  const optsEmpty = (f.options || []).every((o) => !o || !o.trim());
                  // Seed helpful defaults when switching into a statement/pair type.
                  if (type === "statement") {
                    if (!f.text.trim()) next.text = "Consider the following statements:";
                    if (optsEmpty) next.options = ["1 and 2 only", "2 and 3 only", "1 and 3 only", "1, 2 and 3"];
                  } else if (type === "pair") {
                    if (!f.text.trim()) next.text = "Consider the following pairs:";
                    if (optsEmpty) next.options = ["Only one pair", "Only two pairs", "Only three pairs", "All four pairs"];
                  }
                  return next;
                });
              }}
            >
              <option value="mcq">Multiple Choice (4 options)</option>
              <option value="matching">Matching (left ↔ right)</option>
              <option value="statement">Statement-based (numbered statements)</option>
              <option value="pair">Pair-matching (how many pairs correct)</option>
            </select>
          </Field>

          <Field label={form.type === "statement" || form.type === "pair" ? "Intro / directive line" : "Question Text"}>
            <textarea required rows={2} className="input resize-none" value={form.text} onChange={(e) => setForm({ ...form, text: e.target.value })} placeholder={form.type === "statement" ? "Consider the following statements:" : form.type === "pair" ? "Consider the following pairs (Item — Description):" : "Use $...$ for equations, e.g. Solve $x^2+2x-3=0$"} />
            <p className="mt-1 text-xs text-slate-400">{form.type === "statement" || form.type === "pair" ? "The numbered list you add below appears under this line, followed by the closing question automatically." : "Tip: wrap maths in dollar signs to render equations."}</p>
          </Field>

          <Field label="Image URL (optional)">
            <div className="flex items-center gap-2 rounded-xl border border-slate-300 px-3 dark:border-slate-700">
              <ImageIcon className="h-4 w-4 text-slate-400" />
              <input className="w-full bg-transparent py-2.5 text-sm focus:outline-none" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="https://res.cloudinary.com/..." />
            </div>
          </Field>

          {form.type === "statement" && (
            <Field label="Statements (shown numbered 1, 2, 3…)">
              <div className="space-y-2">
                {form.columnA.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{i + 1}</span>
                    <input className="input" value={item} onChange={(e) => setForm({ ...form, columnA: form.columnA.map((x, xi) => (xi === i ? e.target.value : x)) })} placeholder={`Statement ${i + 1}`} />
                    <button type="button" onClick={() => setForm({ ...form, columnA: form.columnA.filter((_, xi) => xi !== i) })} className="flex-shrink-0 rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-900/30" disabled={form.columnA.length <= 2}><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setForm({ ...form, columnA: [...form.columnA, ""] })} className="btn-outline py-2"><Plus className="h-4 w-4" /> Add statement</button>
              </div>
            </Field>
          )}

          {form.type === "pair" && (
            <Field label="Pairs (shown numbered 1, 2, 3… as Left — Right)">
              <div className="space-y-2">
                {form.columnA.map((left, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{i + 1}</span>
                    <input className="input" value={left} onChange={(e) => setForm((f) => ({ ...f, columnA: f.columnA.map((x, xi) => (xi === i ? e.target.value : x)) }))} placeholder="Left (e.g. Item)" />
                    <span className="flex-shrink-0 text-slate-400">—</span>
                    <input className="input" value={form.columnB[i] || ""} onChange={(e) => setForm((f) => { const cb = [...f.columnB]; while (cb.length < f.columnA.length) cb.push(""); cb[i] = e.target.value; return { ...f, columnB: cb }; })} placeholder="Right (e.g. Description)" />
                    <button type="button" onClick={() => setForm((f) => ({ ...f, columnA: f.columnA.filter((_, xi) => xi !== i), columnB: f.columnB.filter((_, xi) => xi !== i) }))} className="flex-shrink-0 rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-900/30" disabled={form.columnA.length <= 2}><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setForm({ ...form, columnA: [...form.columnA, ""], columnB: [...form.columnB, ""] })} className="btn-outline py-2"><Plus className="h-4 w-4" /> Add pair</button>
              </div>
            </Field>
          )}

          {form.type === "matching" && (
            <>
              <Field label="Column A (items — shown numbered 1, 2, 3…)">
                <div className="space-y-2">
                  {form.columnA.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-brand-100 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{i + 1}</span>
                      <input className="input" value={item} onChange={(e) => setForm({ ...form, columnA: form.columnA.map((x, xi) => xi === i ? e.target.value : x) })} placeholder={`Column A item ${i + 1}`} />
                      <button type="button" onClick={() => setForm({ ...form, columnA: form.columnA.filter((_, xi) => xi !== i) })} className="flex-shrink-0 rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-900/30" disabled={form.columnA.length <= 2}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setForm({ ...form, columnA: [...form.columnA, ""] })} className="btn-outline py-2"><Plus className="h-4 w-4" /> Add to Column A</button>
                </div>
              </Field>
              <Field label="Column B (items — shown as Roman numerals I, II, III…)">
                <div className="space-y-2">
                  {form.columnB.map((item, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-accent-100 text-xs font-bold text-accent-700 dark:bg-accent-900/40 dark:text-accent-300">{toRomanLite(i + 1)}</span>
                      <input className="input" value={item} onChange={(e) => setForm({ ...form, columnB: form.columnB.map((x, xi) => xi === i ? e.target.value : x) })} placeholder={`Column B item ${toRomanLite(i + 1)}`} />
                      <button type="button" onClick={() => setForm({ ...form, columnB: form.columnB.filter((_, xi) => xi !== i) })} className="flex-shrink-0 rounded-lg p-2 text-rose-600 hover:bg-rose-50 disabled:opacity-40 dark:hover:bg-rose-900/30" disabled={form.columnB.length <= 2}><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => setForm({ ...form, columnB: [...form.columnB, ""] })} className="btn-outline py-2"><Plus className="h-4 w-4" /> Add to Column B</button>
                </div>
              </Field>
            </>
          )}

          <Field label={form.type === "matching" ? "Answer options (a–d) — select the correct sequence" : "Options (select the correct one)"}>
            {form.type === "matching" && (
              <p className="mb-2 text-xs text-slate-400">Write each option as a sequence, e.g. <b>1-III, 2-I, 3-IV, 4-II</b>. Tick the correct one.</p>
            )}
            <div className="space-y-2.5">
              {form.options.map((opt, i) => {
                const isCorrect = form.correct === i;
                return (
                  <div key={i} className="rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                      <input type="radio" name="correct" checked={isCorrect} onChange={() => setForm({ ...form, correct: i })} className="h-4 w-4 text-brand-600" />
                      <input required className="input" value={opt} onChange={(e) => { const o = [...form.options]; o[i] = e.target.value; setForm({ ...form, options: o }); }} placeholder={form.type === "matching" ? `Option ${String.fromCharCode(97 + i)}  (e.g. 1-III, 2-I, 3-IV, 4-II)` : `Option ${String.fromCharCode(65 + i)}`} />
                    </div>
                    {isCorrect ? (
                      <p className="mt-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">✓ Correct answer — write its detailed explanation in the "Explanation" box below.</p>
                    ) : (
                      <input
                        className="input mt-1.5 border-dashed py-2 text-xs"
                        value={form.optionExplanations[i] || ""}
                        onChange={(e) => { const o = [...form.optionExplanations]; o[i] = e.target.value; setForm({ ...form, optionExplanations: o }); }}
                        placeholder={`Brief note: why (${String.fromCharCode(65 + i)}) is wrong (optional)`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">The correct option is explained in detail in the main "Explanation" box below. Each of the other three options can have a brief note that appears when a student selects it.</p>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Difficulty">
              <select className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
                <option>Easy</option><option>Medium</option><option>Hard</option>
              </select>
            </Field>
            <Field label="Status">
              <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="published">Published</option><option value="draft">Draft</option>
              </select>
            </Field>
          </div>
          <Field label="Explanation / Solution (detailed — explains the correct answer)"><textarea rows={3} className="input resize-none" value={form.explanation} onChange={(e) => setForm({ ...form, explanation: e.target.value })} placeholder="Explain in detail why the correct option is right…" /></Field>
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary">{saving ? "Saving..." : "Save"}</button>
        </div>
      </form>
    </div>
  );
}
