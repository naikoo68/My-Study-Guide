import { useEffect, useMemo, useRef, useState } from "react";
import { X, Building2, Send, CheckCircle2, Loader2, Search } from "lucide-react";
import { tenantService, instituteShareService } from "../../services";

// Super-admin: COPY a content node into one or more institutes. The copy
// appears automatically in each institute's account (no accept step) as their
// own editable content.
//
// Props (pass ONE of these):
//  - area:    "my-quiz" | "my-test" | "public-quiz" | "public-test"
//  - target:  { id, name }        — a single Stream (or Exam for public-test)
//  - targets: [ { id, name }, … ] — bulk "Share selected"
//  - onClose()
const AREA_LABEL = {
  "my-quiz": "My Quiz stream",
  "my-test": "My Test stream",
  "public-quiz": "Public Quizzes stream",
  "public-test": "Public Test Series exam",
};
const AREA_PLURAL = {
  "my-quiz": "My Quiz streams",
  "my-test": "My Test streams",
  "public-quiz": "Public Quizzes streams",
  "public-test": "Public Test Series exams",
};

export default function ShareToInstitutesModal({ area, target, targets, onClose }) {
  // Normalise single + bulk into one list so both share one code path.
  const sources = (Array.isArray(targets) && targets.length) ? targets : (target ? [target] : []);
  const bulk = sources.length > 1;
  const [institutes, setInstitutes] = useState(null); // null = loading
  const [loadError, setLoadError] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(() => new Set()); // tenant ids
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(null); // { targetsTotal, targetsDone, itemsCopied, questionsCopied }
  const [done, setDone] = useState(null); // final job result
  const pollRef = useRef(null);

  useEffect(() => {
    let alive = true;
    tenantService
      .list()
      .then((res) => {
        if (!alive) return;
        // Exclude the default/platform tenant — it's the SOURCE, not a target.
        const list = (res?.tenants || []).filter((t) => !t.isDefault && t.status !== "suspended");
        setInstitutes(list);
      })
      .catch((e) => alive && setLoadError(e.message || "Could not load institutes."));
    return () => {
      alive = false;
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q || !institutes) return institutes || [];
    return institutes.filter((t) => `${t.name} ${t.slug} ${t.ownerEmail || ""}`.toLowerCase().includes(q));
  }, [institutes, search]);

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const chosenCount = all ? (institutes?.length || 0) : selected.size;

  const startPolling = (jobId) => {
    pollRef.current = setInterval(async () => {
      try {
        const j = await instituteShareService.job(jobId);
        setProgress({ targetsTotal: j.targetsTotal, targetsDone: j.targetsDone, itemsCopied: j.itemsCopied, questionsCopied: j.questionsCopied });
        if (j.status === "done" || j.status === "error") {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setBusy(false);
          if (j.status === "error") setError(j.error || "Sharing failed.");
          else setDone(j);
        }
      } catch {
        // transient poll error — keep trying until the job cleans up
      }
    }, 1200);
  };

  const submit = async () => {
    if (!all && selected.size === 0) { setError("Choose at least one institute, or turn on Share to all."); return; }
    setBusy(true);
    setError("");
    try {
      const res = await instituteShareService.share({
        area,
        ids: sources.map((s) => s.id),
        ...(all ? { all: true } : { tenantIds: [...selected] }),
      });
      setProgress({ targetsTotal: res.targets, targetsDone: 0, itemsCopied: 0, questionsCopied: 0 });
      startPolling(res.jobId);
    } catch (e) {
      setBusy(false);
      setError(e.message || "Could not start sharing.");
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onMouseDown={busy ? undefined : onClose}>
      <div onMouseDown={(e) => e.stopPropagation()} className="my-12 w-full max-w-lg animate-scale-in card p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Building2 className="h-5 w-5 text-brand-600" /> Share to institutes</h3>
          {!busy && <button onClick={onClose}><X className="h-5 w-5" /></button>}
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          {bulk
            ? <>Copying <b className="text-slate-700 dark:text-slate-200">{sources.length} {AREA_PLURAL[area] || "items"}</b>.</>
            : <>Copying {AREA_LABEL[area] || "content"}: <b className="text-slate-700 dark:text-slate-200">{sources[0]?.name}</b>.</>}
          {" "}Each chosen institute gets their own editable copy — it appears in their account automatically.
        </p>

        {done ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300">
            <CheckCircle2 className="mr-1 inline h-4 w-4" />
            Shared to <b>{done.results?.filter((r) => !r.error).length || done.targetsDone}</b> institute(s): copied <b>{done.itemsCopied}</b> quiz/test item(s) and <b>{done.questionsCopied}</b> question(s).
            {done.results?.some((r) => r.error) ? (
              <p className="mt-2 text-rose-600 dark:text-rose-300">
                Some failed: {done.results.filter((r) => r.error).map((r) => r.name).join(", ")}.
              </p>
            ) : null}
            <div className="mt-3 text-right"><button onClick={onClose} className="btn-outline py-1.5 text-xs">Done</button></div>
          </div>
        ) : busy ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-700 dark:bg-slate-800/60">
            <p className="flex items-center gap-2 font-medium"><Loader2 className="h-4 w-4 animate-spin text-brand-600" /> Sharing…</p>
            {progress && (
              <>
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-brand-500 transition-all"
                    style={{ width: `${progress.targetsTotal ? Math.round((progress.targetsDone / progress.targetsTotal) * 100) : 0}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {progress.targetsDone} / {progress.targetsTotal} institute(s) · {progress.itemsCopied} item(s) · {progress.questionsCopied} question(s) copied
                </p>
              </>
            )}
            <p className="mt-2 text-xs text-slate-400">You can keep this open — a large library across many institutes can take a little while.</p>
          </div>
        ) : (
          <>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
              <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} className="h-4 w-4" />
              <span className="text-sm font-medium">Share to ALL institutes {institutes ? `(${institutes.length})` : ""}</span>
            </label>

            {!all && (
              <>
                <div className="relative mt-3">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input className="input pl-9" placeholder="Search institutes…" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <div className="mt-3 max-h-64 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  {loadError ? (
                    <p className="p-3 text-sm text-rose-600">{loadError}</p>
                  ) : institutes === null ? (
                    <p className="p-3 text-sm text-slate-400"><Loader2 className="mr-1 inline h-4 w-4 animate-spin" /> Loading institutes…</p>
                  ) : filtered.length === 0 ? (
                    <p className="p-3 text-sm text-slate-400">No institutes found.</p>
                  ) : (
                    filtered.map((t) => (
                      <label key={t.id} className="flex cursor-pointer items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60">
                        <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} className="h-4 w-4" />
                        <span className="text-sm">
                          <b className="font-medium">{t.name}</b>
                          {t.slug ? <span className="text-slate-400"> · {t.slug}</span> : null}
                          {t.status && t.status !== "active" ? <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-700">{t.status}</span> : null}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </>
            )}

            {error && <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</p>}

            <div className="mt-5 flex items-center justify-between">
              <span className="text-xs text-slate-400">{chosenCount} institute(s) selected</span>
              <div className="flex gap-2">
                <button onClick={onClose} className="btn-outline">Cancel</button>
                <button onClick={submit} disabled={chosenCount === 0} className="btn-primary">
                  <Send className="h-4 w-4" /> Share
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
