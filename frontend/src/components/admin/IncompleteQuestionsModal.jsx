// Admin tool: scan a quiz's questions and list the INCOMPLETE ones (missing
// text/options/correct answer + type-specific parts) so they can be fixed.
// Frontend-only: fetches the quiz's questions and runs the shared validator.
// Each incomplete question is shown IN FULL (the same QuestionView used across
// the site) with a select checkbox and a Delete action, plus a "Select all" +
// "Delete selected" toolbar for cleaning up several at once.
import { useEffect, useState } from "react";
import { X, Loader2, AlertTriangle, CheckCircle2, RefreshCw, Trash2, Pencil, Wand2 } from "lucide-react";
import { questionIssues } from "../../lib/questionCompleteness";
import QuestionView from "./QuestionView";
import ExtendExplanationsModal from "./ExtendExplanationsModal";
import RegenerateAllModal from "./RegenerateAllModal";

// `aiTarget` ({ quiz } | { testSeries }) enables the Extend Explanations /
// Regenerate buttons, which run the shared AI modals scoped to the incomplete
// questions the admin has ticked (or ALL the listed incomplete ones when none
// are ticked) — never the whole quiz. On finish we re-scan so fixed questions
// drop off the list.
export default function IncompleteQuestionsModal({ title, loadQuestions, onClose, onEdit, deleteQuestion, onChange, aiTarget }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [items, setItems] = useState([]); // [{ q, issues }]
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState(() => new Set()); // selected question ids
  const [deletingIds, setDeletingIds] = useState(() => new Set()); // per-item delete in progress
  const [bulkBusy, setBulkBusy] = useState(false);
  const [delErr, setDelErr] = useState("");
  const [aiModal, setAiModal] = useState(null); // "extend" | "regen" | null
  const [aiIds, setAiIds] = useState([]); // question ids the AI run is scoped to (captured on open)

  const scan = () => {
    setLoading(true); setError(""); setDelErr(""); setSelected(new Set());
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

  const allIds = items.map((x) => x.q._id);
  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));
  const toggle = (id) => setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setSelected(() => (allSelected ? new Set() : new Set(allIds)));

  // Drop the given ids from the visible list, the selection and the total after
  // a successful delete — so the modal reflects reality without a full re-scan.
  const removeLocally = (ids) => {
    const gone = new Set(ids.map(String));
    setItems((its) => its.filter((x) => !gone.has(String(x.q._id))));
    setSelected((s) => { const n = new Set(s); for (const id of ids) n.delete(id); return n; });
    setTotal((t) => Math.max(0, t - ids.length));
  };

  const deleteOne = async (id) => {
    if (!deleteQuestion) return;
    if (!window.confirm("Delete this question? This cannot be undone.")) return;
    setDelErr(""); setDeletingIds((d) => new Set(d).add(id));
    try {
      await deleteQuestion(id);
      removeLocally([id]);
      onChange?.();
    } catch (e) {
      setDelErr(e.message || "Delete failed.");
    } finally {
      setDeletingIds((d) => { const n = new Set(d); n.delete(id); return n; });
    }
  };

  const deleteSelected = async () => {
    if (!deleteQuestion || bulkBusy || selected.size === 0) return;
    const ids = allIds.filter((id) => selected.has(id));
    if (!window.confirm(`Delete ${ids.length} selected question(s)? This cannot be undone.`)) return;
    setBulkBusy(true); setDelErr("");
    const done = [];
    try {
      for (const id of ids) {
        try { await deleteQuestion(id); done.push(id); }
        catch (e) { setDelErr(e.message || "Some deletions failed."); }
      }
    } finally {
      if (done.length) { removeLocally(done); onChange?.(); }
      setBulkBusy(false);
    }
  };

  // Open the Extend / Regenerate modal scoped to the ticked questions, or to
  // ALL the listed incomplete ones when none are ticked.
  const openAi = (which) => {
    const ids = selected.size ? allIds.filter((id) => selected.has(id)) : allIds;
    if (!ids.length) return;
    setAiIds(ids);
    setAiModal(which);
  };
  const aiScopeCount = selected.size || items.length;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4">
      <div className="mt-10 w-full max-w-4xl rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
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
            {/* Summary + bulk actions toolbar */}
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                <b className="text-amber-600">{items.length}</b> of {total} question(s) are incomplete:
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                  Select all
                </label>
                {aiTarget && (
                  <>
                    <button
                      onClick={() => openAi("extend")}
                      title="AI: extend the explanations of the selected (or all listed) incomplete questions"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 dark:border-brand-900/50 dark:text-brand-300 dark:hover:bg-brand-900/30"
                    >
                      <Wand2 className="h-3.5 w-3.5" /> Extend Explanations{aiScopeCount ? ` (${aiScopeCount})` : ""}
                    </button>
                    <button
                      onClick={() => openAi("regen")}
                      title="AI: regenerate the selected (or all listed) incomplete questions' options/answer/explanation"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-600 transition hover:bg-violet-50 dark:border-violet-900/50 dark:text-violet-300 dark:hover:bg-violet-900/30"
                    >
                      <RefreshCw className="h-3.5 w-3.5" /> Regenerate{aiScopeCount ? ` (${aiScopeCount})` : ""}
                    </button>
                  </>
                )}
                {deleteQuestion && (
                  <button
                    onClick={deleteSelected}
                    disabled={selected.size === 0 || bulkBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-900/30"
                  >
                    {bulkBusy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting…</> : <><Trash2 className="h-3.5 w-3.5" /> Delete selected{selected.size ? ` (${selected.size})` : ""}</>}
                  </button>
                )}
              </div>
            </div>
            {aiTarget && (
              <p className="mb-2 text-xs text-slate-400">
                Tip: tick specific questions to run AI on just those; with none ticked, Extend/Regenerate apply to all {items.length} listed incomplete question(s).
              </p>
            )}
            {delErr && <p className="mb-2 text-sm font-medium text-rose-600">{delErr}</p>}

            <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
              {items.map(({ q, issues }) => {
                const isDeleting = deletingIds.has(q._id);
                return (
                  <div key={q._id} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-900/10">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={selected.has(q._id)}
                        onChange={() => toggle(q._id)}
                        className="mt-1.5 h-4 w-4 flex-shrink-0 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        aria-label="Select question"
                      />
                      <div className="min-w-0 flex-1">
                        {/* Why it's flagged + per-question actions */}
                        <div className="mb-2 flex flex-wrap items-center gap-1.5">
                          {issues.map((iss, i) => (
                            <span key={i} className="rounded bg-rose-100 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{iss}</span>
                          ))}
                          <span className="flex-1" />
                          {onEdit && (
                            <button onClick={() => onEdit(q)} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800">
                              <Pencil className="h-3.5 w-3.5" /> Fix
                            </button>
                          )}
                          {deleteQuestion && (
                            <button onClick={() => deleteOne(q._id)} disabled={isDeleting} className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-300 dark:hover:bg-rose-900/30">
                              {isDeleting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Deleting…</> : <><Trash2 className="h-3.5 w-3.5" /> Delete</>}
                            </button>
                          )}
                        </div>
                        {/* The full question (text, options, correct answer, explanation). */}
                        <QuestionView q={q} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Shared AI modals, scoped to the ticked/all-incomplete question ids.
          On finish, re-scan so questions that got fixed drop off the list. */}
      {aiTarget && (
        <>
          <ExtendExplanationsModal
            open={aiModal === "extend"}
            target={aiTarget}
            questionIds={aiIds}
            title={title}
            onClose={() => setAiModal(null)}
            onDone={() => { onChange?.(); scan(); }}
          />
          <RegenerateAllModal
            open={aiModal === "regen"}
            target={aiTarget}
            questionIds={aiIds}
            title={title}
            onClose={() => setAiModal(null)}
            onDone={() => { onChange?.(); scan(); }}
          />
        </>
      )}
    </div>
  );
}
