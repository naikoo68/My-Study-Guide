import { useEffect, useState } from "react";
import { X, Loader2, Copy, CheckCircle2, Trash2 } from "lucide-react";

/**
 * "Find duplicates" for SUBJECTS or TOPICS (distinct from the question-level
 * DuplicatesModal). Scans the existing subjects (under a stream) or topics
 * (under a subject) and groups the ones that are duplicates or overlaps — not
 * just identical names, but synonyms and broader/combined wordings too — so the
 * admin can delete the extras. The AI picks a "keep" per group; every other
 * member is pre-ticked for deletion and the admin can adjust before confirming.
 *
 * Props:
 *  - level: "subject" | "topic"
 *  - parentName: stream name (subjects) or subject name (topics)
 *  - fetchGroups: () => Promise<{ groups: [{ keepId, keepName, duplicates:[{id,name}] }] }>
 *  - onDelete: (ids: string[]) => Promise<void>
 *  - bulkProgress: { done, total } | null   live "Deleted X of Y" counter
 *  - onClose: () => void
 */
export default function SubjectTopicDuplicatesModal({ level, parentName, fetchGroups, onDelete, bulkProgress, onClose }) {
  const noun = level === "topic" ? "topic" : "subject";
  const nounPlural = level === "topic" ? "topics" : "subjects";

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [groups, setGroups] = useState([]); // [{ keepId, keepName, duplicates:[{id,name}] }]
  const [toDelete, setToDelete] = useState(() => new Set()); // ids ticked for deletion

  const run = () => {
    setLoading(true);
    setErr("");
    Promise.resolve(fetchGroups())
      .then((res) => {
        const g = (res?.groups || []).filter((x) => x && x.keepId && Array.isArray(x.duplicates) && x.duplicates.length);
        setGroups(g);
        // Default: every duplicate (the non-kept members) ticked for deletion.
        setToDelete(new Set(g.flatMap((x) => x.duplicates.map((d) => d.id))));
      })
      .catch((e) => setErr(e?.message || `Couldn't scan for duplicate ${nounPlural}.`))
      .finally(() => setLoading(false));
  };

  useEffect(() => { run(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const toggle = (id) =>
    setToDelete((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const totalDupes = groups.reduce((n, g) => n + g.duplicates.length, 0);
  const busy = !!bulkProgress;
  const submit = () => {
    const ids = [...toDelete];
    if (ids.length) onDelete(ids);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Copy className="h-5 w-5 text-brand-600" /> Duplicate {nounPlural}
          </h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500">
          Duplicate &amp; overlapping {nounPlural} under <span className="font-semibold">“{parentName || `this ${noun}`}”</span>. One is kept per group; the rest are ticked to move to the Recycle Bin. Adjust if needed, then delete.
        </p>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" /> Scanning for duplicate {nounPlural}…
          </div>
        ) : err ? (
          <div className="space-y-3 py-6 text-center">
            <p className="text-sm font-medium text-rose-600">{err}</p>
            <button type="button" onClick={run} className="btn-outline mx-auto"><Copy className="h-4 w-4" /> Try again</button>
          </div>
        ) : groups.length === 0 ? (
          <div className="space-y-3 py-8 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="text-sm text-slate-500">No duplicate {nounPlural} found — your list looks clean. 🎉</p>
            <button type="button" onClick={run} className="btn-outline mx-auto"><Copy className="h-4 w-4" /> Scan again</button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold">{groups.length} group{groups.length === 1 ? "" : "s"} · {totalDupes} duplicate{totalDupes === 1 ? "" : "s"}</span>
              {busy ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                  <Loader2 className="h-3 w-3 animate-spin" /> Deleted {bulkProgress.done} of {bulkProgress.total}
                </span>
              ) : toDelete.size > 0 ? (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{toDelete.size} to delete</span>
              ) : null}
            </div>
            <div className="max-h-80 space-y-3 overflow-y-auto py-1">
              {groups.map((g) => (
                <div key={g.keepId} className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
                  <div className="mb-1 flex items-center gap-2 text-sm">
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Keep</span>
                    <span className="font-semibold">{g.keepName}</span>
                  </div>
                  <div className="space-y-0.5">
                    {g.duplicates.map((d) => (
                      <label key={d.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-slate-100 dark:hover:bg-slate-700">
                        <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={toDelete.has(d.id)} onChange={() => toggle(d.id)} />
                        <Trash2 className={`h-3.5 w-3.5 flex-shrink-0 ${toDelete.has(d.id) ? "text-rose-500" : "text-slate-300"}`} />
                        <span className={toDelete.has(d.id) ? "text-slate-400 line-through" : ""}>{d.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Close</button>
          {groups.length > 0 && (
            <button type="button" disabled={busy || toDelete.size === 0} className="btn-primary bg-rose-600 hover:bg-rose-700" onClick={submit}>
              {busy ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Deleting…</>
              ) : (
                <><Trash2 className="h-4 w-4" /> Delete {toDelete.size} duplicate{toDelete.size === 1 ? "" : "s"}</>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
