import { useEffect, useMemo, useState } from "react";
import { X, Loader2, Link2, Search } from "lucide-react";
import { practiceService } from "../../services";

// "Add existing subject" for My Quiz — MANUALLY reuse a subject that already
// lives under another Exam. It lists My-Quiz subjects NOT already in this exam,
// ticks some, and LINKS them here (no duplicate — topics/quizzes stay shared).
// Opening a linked subject shows the same shared content.
export default function PracticeLinkExistingSubjectModal({ examId, examName, existingIds = [], onClose, onLinked }) {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [all, setAll] = useState([]);
  const [picked, setPicked] = useState(() => new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(null); // { done, total }

  const here = useMemo(() => new Set((existingIds || []).map((x) => String(x))), [existingIds]);
  const eid = String(examId || "");

  useEffect(() => {
    setLoading(true);
    setErr("");
    practiceService
      .allSubjects()
      .then((list) => {
        // Only My-Quiz subjects (they have an exam + topics) that aren't already
        // under this exam (as home or already linked) and aren't in the current list.
        const avail = (list || []).filter((s) => {
          if (s.kind !== "quiz" || !s.exam) return false;
          if (here.has(String(s._id))) return false;
          if (String(s.exam) === eid) return false;
          if ((s.exams || []).map(String).includes(eid)) return false;
          return true;
        });
        setAll(avail);
      })
      .catch((e) => setErr(e?.message || "Couldn't load subjects."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const q = query.trim().toLowerCase();
  const shown = q ? all.filter((s) => (s.name || "").toLowerCase().includes(q)) : all;
  const allShownPicked = shown.length > 0 && shown.every((s) => picked.has(s._id));

  const toggle = (id) =>
    setPicked((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const toggleAllShown = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allShownPicked) shown.forEach((s) => next.delete(s._id));
      else shown.forEach((s) => next.add(s._id));
      return next;
    });

  const submit = async () => {
    const ids = all.filter((s) => picked.has(s._id)).map((s) => s._id);
    if (!ids.length) return;
    setBusy({ done: 0, total: ids.length });
    setErr("");
    try {
      let done = 0;
      for (const id of ids) {
        await practiceService.linkSubjectToExam(id, examId);
        setBusy({ done: ++done, total: ids.length });
      }
      onLinked?.();
    } catch (e) {
      setErr(e?.message || "Couldn't add the selected subjects.");
      setBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Link2 className="h-5 w-5 text-brand-600" /> Add existing subject</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Reuse a subject that already exists under another exam by adding it to <span className="font-semibold">{examName || "this exam"}</span>. It won't be duplicated — its topics &amp; quizzes stay shared.
        </p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" /> Loading subjects…</div>
        ) : err && !busy ? (
          <div className="py-6 text-center text-sm font-medium text-rose-600">{err}</div>
        ) : all.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No other My-Quiz subjects to add — everything is already under this exam.</p>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{all.length} subject{all.length === 1 ? "" : "s"} available</span>
              {busy ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"><Loader2 className="h-3 w-3 animate-spin" /> Added {busy.done} of {busy.total}</span>
              ) : picked.size > 0 ? (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{picked.size} selected</span>
              ) : null}
            </div>
            <div className="relative mb-2">
              <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><Search className="h-4 w-4" /></div>
              <input className="input pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search subjects…" />
            </div>
            <label className="mb-1 flex cursor-pointer items-center gap-2 border-b border-slate-100 pb-2 text-sm font-medium dark:border-slate-700">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={allShownPicked} onChange={toggleAllShown} />
              Select all{query ? " matching" : ""} ({shown.length})
            </label>
            <div className="max-h-72 space-y-0.5 overflow-y-auto py-1">
              {shown.map((s) => (
                <label key={s._id} className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-100 dark:hover:bg-slate-700">
                  <input type="checkbox" className="mt-1 h-4 w-4 flex-shrink-0 rounded border-slate-300" checked={picked.has(s._id)} onChange={() => toggle(s._id)} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{s.name}</span>
                    <span className="block text-xs text-slate-400">{s.stream ? `from ${s.stream}` : ""}{s.description ? ` · ${s.description}` : ""}</span>
                  </span>
                </label>
              ))}
              {shown.length === 0 && <p className="py-2 text-sm text-slate-400">No subjects match “{query}”.</p>}
            </div>
            {err && busy && <p className="mt-2 text-xs font-medium text-rose-600">{err}</p>}
          </>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Close</button>
          {all.length > 0 && (
            <button type="button" disabled={!!busy || picked.size === 0} className="btn-primary" onClick={submit}>
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Adding {busy.done} of {busy.total}…</> : `Add ${picked.size} subject${picked.size === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
