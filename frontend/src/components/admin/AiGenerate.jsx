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
const DIFFS = ["Easy", "Medium", "Hard"];

// Reusable "Generate with AI" modal. Mirrors BulkUploadQuestions:
// `onUpload(questions)` should return a promise (e.g. { inserted }). The AI
// only PREVIEWS questions here — nothing is saved until the admin clicks Insert.
export default function AiGenerate({ open, onClose, onUpload, title = "Generate Questions with AI" }) {
  const [status, setStatus] = useState(null); // { enabled, model, models: [] }
  const [model, setModel] = useState("");
  const [topic, setTopic] = useState("");
  // matrix[typeId] = { Easy, Medium, Hard } counts. Default: 5 medium MCQs.
  const [matrix, setMatrix] = useState({ mcq: { Easy: 0, Medium: 5, Hard: 0 } });
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState([]);
  const [busy, setBusy] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setMsg("");
    setPreview([]);
    aiService
      .status()
      .then((s) => {
        setStatus(s);
        setModel(s?.model || (s?.models && s.models[0]) || "");
      })
      .catch(() => setStatus({ enabled: false }));
  }, [open]);

  if (!open) return null;

  // Update a single cell of the type × difficulty matrix (clamped 0–30).
  const setCell = (type, diff, val) => {
    const n = Math.max(0, Math.min(30, parseInt(val, 10) || 0));
    setMatrix((m) => ({ ...m, [type]: { ...(m[type] || {}), [diff]: n } }));
  };
  const rowTotal = (type) => DIFFS.reduce((s, d) => s + (matrix[type]?.[d] || 0), 0);
  // Flatten the matrix into [{ type, difficulty, count }] entries with count>0.
  const buildPlan = () =>
    TYPE_OPTIONS.flatMap((t) =>
      DIFFS.map((d) => ({ type: t.id, difficulty: d, count: matrix[t.id]?.[d] || 0 })).filter((e) => e.count > 0)
    );
  const total = TYPE_OPTIONS.reduce((s, t) => s + rowTotal(t.id), 0);

  const generate = async () => {
    if (!topic.trim()) { setMsg("Enter a topic or syllabus to generate from."); return; }
    const plan = buildPlan();
    if (!plan.length) { setMsg("Set at least one question count in the grid below."); return; }
    if (total > 100) { setMsg("Please keep the total to 100 questions or fewer per batch."); return; }
    setBusy(true);
    setPreview([]);
    setMsg(`Starting generation of ${total} question(s)…`);
    try {
      const { jobId, requested } = await aiService.generate({
        topic: topic.trim(),
        plan,
        notes: notes.trim(),
        model: model || undefined,
      });
      if (!jobId) throw new Error("Could not start generation.");

      // Poll the background job for progress until it finishes.
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let done = false;
      for (let i = 0; i < 150 && !done; i++) {
        await sleep(2000);
        let s;
        try {
          s = await aiService.job(jobId);
        } catch {
          continue; // transient poll hiccup — keep waiting
        }
        if (s.status === "done") {
          const qs = s.questions || [];
          setPreview(qs);
          setMsg(`✓ Generated ${qs.length} of ${requested} question(s)${s.model ? ` with ${s.model}` : ""}. Review below, then Insert.`);
          done = true;
        } else if (s.status === "error") {
          setMsg(s.error || "Generation failed.");
          done = true;
        } else {
          setMsg(`Generating… ${s.count || 0} of ${requested} ready`);
        }
      }
      if (!done) setMsg("Still generating — this is taking longer than expected. Please try a smaller batch.");
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
            </div>

            {status?.models && status.models.length > 1 && (
              <div className="mb-3">
                <label className="mb-1 block text-sm font-semibold">AI model</label>
                <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
                  {status.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            <label className="mb-1 block text-sm font-semibold">Topic / syllabus</label>
            <textarea
              rows={2}
              className="input resize-y"
              placeholder={`e.g. "Newton's Laws of Motion for Class 11 Physics" or "Indian Constitution — Fundamental Rights"`}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />

            {/* How many of each type × difficulty. Total = sum of all cells. */}
            <div className="mt-3 flex items-center justify-between">
              <label className="block text-sm font-semibold">Questions by type &amp; difficulty</label>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${total > 100 ? "bg-rose-100 text-rose-600 dark:bg-rose-900/30" : "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"}`}>
                Total: {total}
              </span>
            </div>
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[380px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    {DIFFS.map((d) => (
                      <th key={d} className="px-2 py-2 text-center font-semibold">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TYPE_OPTIONS.map((t) => (
                    <tr key={t.id} className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${rowTotal(t.id) > 0 ? "bg-brand-50/40 dark:bg-brand-900/10" : ""}`}>
                      <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200">{t.label}</td>
                      {DIFFS.map((d) => (
                        <td key={d} className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={matrix[t.id]?.[d] || 0}
                            onChange={(e) => setCell(t.id, d, e.target.value)}
                            className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-sm dark:border-slate-700 dark:bg-slate-900"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Total summary below the grid */}
            <div className={`mt-2 flex items-center justify-between rounded-xl border px-4 py-2.5 ${total > 100 ? "border-rose-300 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-900/20" : "border-brand-200 bg-brand-50 dark:border-brand-900/40 dark:bg-brand-900/20"}`}>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Total questions</span>
              <span className={`text-lg font-extrabold tabular-nums ${total > 100 ? "text-rose-600 dark:text-rose-400" : "text-brand-600 dark:text-brand-300"}`}>
                {total} <span className="text-xs font-medium text-slate-400">/ 100</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Set a count in any cell — e.g. 3 Easy MCQs + 2 Medium Matching. Leave cells at 0 to skip.
              Up to 100 per batch (generated in the background in smaller groups).
            </p>

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
