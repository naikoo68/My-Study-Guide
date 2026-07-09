import { useEffect, useState } from "react";
import { X, Sparkles, Wand2, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { aiService } from "../../services";

const TYPE_OPTIONS = [
  { id: "mcq", label: "MCQ" },
  { id: "assertion", label: "Assertion & Reason" },
  { id: "statement", label: "Statement-based" },
  { id: "matching", label: "Matching" },
  { id: "pair", label: "Pair (count)" },
  { id: "pairselect", label: "Pair-select" },
  { id: "table", label: "Table-based" },
];

const LETTERS = ["A", "B", "C", "D"];

// Reusable "Generate with AI" modal. Mirrors BulkUploadQuestions:
// `onUpload(questions)` should return a promise (e.g. { inserted }). The AI
// only PREVIEWS questions here — nothing is saved until the admin clicks Insert.
export default function AiGenerate({ open, onClose, onUpload, title = "Generate Questions with AI" }) {
  const [status, setStatus] = useState(null); // { enabled, model }
  const [topic, setTopic] = useState("");
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState("Mixed");
  const [types, setTypes] = useState(["mcq"]);
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState([]);
  const [busy, setBusy] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setMsg("");
    setPreview([]);
    aiService.status().then(setStatus).catch(() => setStatus({ enabled: false }));
  }, [open]);

  if (!open) return null;

  const toggleType = (id) =>
    setTypes((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const generate = async () => {
    if (!topic.trim()) { setMsg("Enter a topic or syllabus to generate from."); return; }
    if (!types.length) { setMsg("Pick at least one question type."); return; }
    setBusy(true);
    setMsg("");
    setPreview([]);
    try {
      const res = await aiService.generate({
        topic: topic.trim(),
        count: Number(count) || 5,
        difficulty: difficulty === "Mixed" ? undefined : difficulty,
        types,
        notes: notes.trim(),
      });
      const qs = res?.questions || [];
      setPreview(qs);
      setMsg(qs.length ? `✓ Generated ${qs.length} question(s). Review below, then Insert.` : "No questions returned — try again.");
    } catch (e) {
      setMsg(e.message || "Generation failed.");
    } finally {
      setBusy(false);
    }
  };

  const insert = async () => {
    if (!preview.length) return;
    setInserting(true);
    setMsg("");
    try {
      const res = await onUpload(preview);
      setMsg(`✓ Inserted ${res?.inserted ?? preview.length} question(s).`);
      setPreview([]);
      setTopic("");
      setNotes("");
      setTimeout(onClose, 1000);
    } catch (e) {
      setMsg(e.message || "Insert failed.");
    } finally {
      setInserting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-2xl animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-brand-600" /> {title}
          </h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {status && !status.enabled ? (
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> AI is not configured</p>
            <p className="mt-1">
              Ask your admin to add <code>AI_API_KEY</code> (and optionally <code>AI_BASE_URL</code>,
              <code> AI_MODEL</code>) to the server environment, then redeploy. The key stays on the
              server and is never exposed to the browser.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              Describe a topic and the AI drafts questions in your app's format. Nothing is saved
              until you review and click <b>Insert</b>.
              {status?.model && <> Model: <code>{status.model}</code>.</>}
            </div>

            <label className="mb-1 block text-sm font-semibold">Topic / syllabus</label>
            <textarea
              rows={2}
              className="input resize-y"
              placeholder={`e.g. "Newton's Laws of Motion for Class 11 Physics" or "Indian Constitution — Fundamental Rights"`}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm font-semibold">Number of questions</label>
                <input
                  type="number" min={1} max={30}
                  className="input"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-semibold">Difficulty</label>
                <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                  <option>Mixed</option>
                  <option>Easy</option>
                  <option>Medium</option>
                  <option>Hard</option>
                </select>
              </div>
            </div>

            <label className="mb-1 mt-3 block text-sm font-semibold">Question types</label>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => toggleType(t.id)}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                    types.includes(t.id)
                      ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"
                      : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label className="mb-1 mt-3 block text-sm font-semibold">Extra instructions (optional)</label>
            <input
              className="input"
              placeholder='e.g. "Focus on numerical problems" or "Keep language simple"'
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />

            <button
              type="button"
              onClick={generate}
              disabled={busy}
              className="btn-primary mt-4 w-full"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Wand2 className="h-4 w-4" /> Generate</>}
            </button>

            {preview.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> {preview.length} question(s) ready to insert
                </p>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                  {preview.map((q, i) => (
                    <div key={i} className="rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800/60">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-brand-100 px-1.5 py-0.5 font-semibold uppercase text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{q.type}</span>
                        <span className="text-slate-400">{q.difficulty}</span>
                        <span className="ml-auto font-semibold text-emerald-600 dark:text-emerald-400">Ans: {LETTERS[q.correct] || "?"}</span>
                      </div>
                      <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{i + 1}. {q.text}</p>
                      <ul className="mt-1 grid grid-cols-2 gap-x-3 text-slate-500 dark:text-slate-400">
                        {(q.options || []).map((o, j) => (
                          <li key={j} className={j === q.correct ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}>
                            {LETTERS[j]}. {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {msg && <p className="mt-3 text-sm font-medium">{msg}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Close</button>
          {status?.enabled && preview.length > 0 && (
            <button type="button" onClick={insert} disabled={inserting} className="btn-primary">
              {inserting ? <><Loader2 className="h-4 w-4 animate-spin" /> Inserting…</> : `Insert ${preview.length} Question(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
