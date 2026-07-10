import { useEffect, useState, useCallback } from "react";
import { X, Files, Trash2, RefreshCw, Loader2, CheckCircle2 } from "lucide-react";
import { contentService } from "../../services";
import { Loading, ErrorState } from "../ui/AsyncState";
import MathText from "../ui/MathText";

const CONTEXT_STYLE = {
  Quiz: "bg-brand-100 text-brand-700 dark:bg-brand-900/40 dark:text-brand-300",
  "Test Series": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  "Practice Quiz": "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  "Practice Test": "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  Uncategorized: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

// Scans ALL questions (Quiz / Test Series / Practice) for duplicates by text
// and lets the admin delete the extra copies. Keep one, delete the rest.
export default function DuplicatesModal({ open, onClose }) {
  const [data, setData] = useState(null); // { scanned, groups, extras, duplicates }
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState({}); // id -> true

  const scan = useCallback(() => {
    setLoading(true);
    setError("");
    contentService
      .duplicates()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (open) scan();
  }, [open, scan]);

  if (!open) return null;

  const deleteOne = async (groupIdx, id) => {
    if (!window.confirm("Delete this copy of the question? This cannot be undone.")) return;
    setDeleting((d) => ({ ...d, [id]: true }));
    try {
      await contentService.deleteQuestion(id);
      setData((prev) => {
        if (!prev) return prev;
        const duplicates = prev.duplicates
          .map((g, i) => (i === groupIdx ? { ...g, questions: g.questions.filter((q) => q._id !== id), count: g.count - 1 } : g))
          .filter((g) => g.questions.length > 1); // group is resolved once only one copy remains
        return { ...prev, duplicates, groups: duplicates.length, extras: duplicates.reduce((s, g) => s + (g.count - 1), 0) };
      });
    } catch (e) {
      window.alert(e.message || "Could not delete the question.");
    } finally {
      setDeleting((d) => ({ ...d, [id]: false }));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-3xl animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Files className="h-5 w-5 text-brand-600" /> Duplicate Questions
          </h3>
          <div className="flex items-center gap-2">
            <button type="button" onClick={scan} disabled={loading} className="btn-outline px-3 py-1.5 text-sm">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Rescan
            </button>
            <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
          </div>
        </div>

        {loading && !data ? (
          <Loading label="Scanning all questions…" />
        ) : error ? (
          <ErrorState message={error} onRetry={scan} />
        ) : data ? (
          <>
            <div className="mb-4 flex flex-wrap gap-3 text-sm">
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
                Scanned <b>{data.scanned}</b> questions
              </span>
              <span className="rounded-lg bg-slate-100 px-3 py-1.5 dark:bg-slate-800">
                <b>{data.groups}</b> duplicate group(s)
              </span>
              <span className="rounded-lg bg-rose-100 px-3 py-1.5 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">
                <b>{data.extras}</b> extra copies
              </span>
            </div>

            {data.duplicates.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center text-slate-500 dark:text-slate-400">
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
                <p className="font-semibold">No duplicates found 🎉</p>
                <p className="text-sm">Every question across Quiz, Test Series, and Practice is unique.</p>
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Each group below is the same question appearing more than once. Delete the extra copies — keep the one you want.
                </p>
                {data.duplicates.map((g, gi) => (
                  <div key={gi} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                    <div className="mb-2 flex items-start gap-2">
                      <span className="mt-0.5 flex-shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-bold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                        ×{g.count}
                      </span>
                      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                        <MathText>{g.text}</MathText>
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      {g.questions.map((q) => (
                        <div key={q._id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-800/60">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded px-1.5 py-0.5 font-semibold ${CONTEXT_STYLE[q.context] || CONTEXT_STYLE.Uncategorized}`}>
                              {q.context}
                            </span>
                            <span className="text-slate-600 dark:text-slate-300">{q.location}</span>
                            <span className="uppercase text-slate-400">{q.type}</span>
                            <span className="text-slate-400">{q.difficulty}</span>
                            {q.status === "draft" && <span className="text-amber-500">draft</span>}
                          </div>
                          <button
                            onClick={() => deleteOne(gi, q._id)}
                            disabled={deleting[q._id]}
                            className="flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 dark:hover:bg-rose-900/30"
                          >
                            {deleting[q._id] ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Delete
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} className="btn-outline">Close</button>
        </div>
      </div>
    </div>
  );
}
