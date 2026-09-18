// Admin tool: scan a quiz's questions and list the INCOMPLETE ones (missing
// text/options/correct answer + type-specific parts) so they can be fixed.
// Frontend-only: fetches the quiz's questions and runs the shared validator.
import { useEffect, useState } from "react";
import { X, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { questionIssues, stemPreview } from "../../lib/questionCompleteness";

export default function IncompleteQuestionsModal({ title, loadQuestions, onClose, onEdit }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]); // [{ q, issues }]
  const [total, setTotal] = useState(0);

  const scan = () => {
    setLoading(true); setError("");
    Promise.resolve(loadQuestions())
      .then((qs) => {
        const list = Array.isArray(qs) ? qs : (qs?.items || []);
        setTotal(list.length);
        setItems(list.map((q) => ({ q, issues: questionIssues(q) })).filter((x) => x.issues.length));
      })
      .catch((e) => setError(e.message || "Failed to load questions."))
      .finally(() => setLoading(false));
  };
  useEffect(scan, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-10 w-full max-w-3xl rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <AlertTriangle className="h-5 w-5 text-amber-500" /> Incomplete questions
            {title && <span className="text-sm font-normal text-slate-400">— {title}</span>}
          </h3>
          <div className="flex items-center gap-1">
            <button onClick={scan} title="Re-scan" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><RefreshCw className="h-4 w-4" /></button>
            <button onClick={onClose} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-5 w-5" /></button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Scanning…</div>
        ) : error ? (
          <p className="py-6 text-sm font-medium text-rose-600">{error}</p>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="font-semibold text-emerald-700 dark:text-emerald-300">All {total} question(s) look complete 🎉</p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              <b className="text-amber-600">{items.length}</b> of {total} question(s) are incomplete:
            </p>
            <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
              {items.map(({ q, issues }) => (
                <div key={q._id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{stemPreview(q)}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600 dark:bg-slate-700 dark:text-slate-300">{q.type || "mcq"}</span>
                        {issues.map((iss, i) => (
                          <span key={i} className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{iss}</span>
                        ))}
                      </div>
                    </div>
                    {onEdit && (
                      <button onClick={() => onEdit(q)} className="btn-outline flex-shrink-0 !py-1 !text-xs">Fix</button>
                    )}
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
