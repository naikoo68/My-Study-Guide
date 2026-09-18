// Admin tool: add or update the FLASHCARD DETAILS (Key Points + Quick Recall,
// and Explanation) for each question in a quiz. Frontend-only: loads the quiz's
// questions and saves edits via contentService.updateQuestion.
import { useEffect, useState } from "react";
import { X, Loader2, Save, CheckCircle2, Search } from "lucide-react";
import { contentService } from "../../services";
import { stemPreview } from "../../lib/questionCompleteness";

const toRow = (q) => ({
  _id: q._id,
  type: q.type || "mcq",
  text: q.text || "",
  keyPointsText: (Array.isArray(q.keyPoints) ? q.keyPoints : []).join("\n"),
  quickRecall: q.quickRecall || "",
  explanation: q.explanation || "",
  saving: false, saved: false, err: "",
});

export default function FlashcardDetailsModal({ title, loadQuestions, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true); setError("");
    Promise.resolve(loadQuestions())
      .then((qs) => setRows((Array.isArray(qs) ? qs : (qs?.items || [])).map(toRow)))
      .catch((e) => setError(e.message || "Failed to load questions."))
      .finally(() => setLoading(false));
  }, [loadQuestions]);

  const setField = (id, field, val) =>
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, [field]: val, saved: false, err: "" } : r)));

  const save = async (row) => {
    setRows((rs) => rs.map((r) => (r._id === row._id ? { ...r, saving: true, err: "" } : r)));
    try {
      const keyPoints = row.keyPointsText.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 8);
      await contentService.updateQuestion(row._id, {
        keyPoints,
        quickRecall: row.quickRecall.trim(),
        explanation: row.explanation,
      });
      setRows((rs) => rs.map((r) => (r._id === row._id ? { ...r, saving: false, saved: true } : r)));
    } catch (e) {
      setRows((rs) => rs.map((r) => (r._id === row._id ? { ...r, saving: false, err: e.message || "Save failed" } : r)));
    }
  };

  const q = search.trim().toLowerCase();
  const shown = q ? rows.filter((r) => r.text.toLowerCase().includes(q)) : rows;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-8 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            🎴 Flashcard details
            {title && <span className="text-sm font-normal text-slate-400">— {title}</span>}
          </h3>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Add or update each question's <b>Key Points</b> (one per line), <b>Quick Recall</b> hook, and <b>Explanation</b>. These show on the flashcard answer side.</p>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading questions…</div>
        ) : error ? (
          <p className="py-6 text-sm font-medium text-rose-600">{error}</p>
        ) : (
          <>
            {rows.length > 6 && (
              <div className="mb-3 flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-slate-700">
                <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter questions…" className="w-full bg-transparent text-sm outline-none" />
              </div>
            )}
            <div className="max-h-[64vh] space-y-3 overflow-y-auto pr-1">
              {shown.map((r, i) => (
                <div key={r._id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="mb-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                    <span className="mr-1.5 text-slate-400">{i + 1}.</span>{stemPreview(r, 120)}
                    <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-600 dark:bg-slate-700 dark:text-slate-300">{r.type}</span>
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-amber-600">Key Points (one per line)</label>
                      <textarea className="input min-h-[80px] text-sm" value={r.keyPointsText} onChange={(e) => setField(r._id, "keyPointsText", e.target.value)} placeholder="First key point&#10;Second key point" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-indigo-600">Quick Recall (one-line hook)</label>
                        <input className="input text-sm" value={r.quickRecall} onChange={(e) => setField(r._id, "quickRecall", e.target.value)} placeholder="e.g. Malaria = female Anopheles" />
                      </div>
                      <div className="flex-1">
                        <label className="mb-1 block text-xs font-semibold text-sky-600">Explanation</label>
                        <textarea className="input min-h-[44px] text-sm" value={r.explanation} onChange={(e) => setField(r._id, "explanation", e.target.value)} />
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <button onClick={() => save(r)} disabled={r.saving} className="btn-primary !py-1 !text-xs">
                      {r.saving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Save className="h-3.5 w-3.5" /> Save</>}
                    </button>
                    {r.saved && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Saved</span>}
                    {r.err && <span className="text-xs font-medium text-rose-600">{r.err}</span>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
