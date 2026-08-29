import { useEffect, useState, useCallback } from "react";
import {
  HardDrive, Trash2, RefreshCw, AlertTriangle, Loader2, CheckCircle2,
  Database, FileStack, Layers, Hash,
} from "lucide-react";
import { storageService } from "../../services";
import { Loading, ErrorState } from "../../components/ui/AsyncState";

const AGE_OPTIONS = [
  { v: 30, l: "1 month" },
  { v: 90, l: "3 months" },
  { v: 180, l: "6 months" },
  { v: 365, l: "1 year" },
];

export default function AdminStorage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [days, setDays] = useState(90);
  const [sel, setSel] = useState({ stripCbtReview: true, cbtAttempts: false, publicAttempts: false, userAttempts: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback((d) => {
    setLoading(true);
    setError("");
    storageService
      .stats(d)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(days); }, [load, days]);

  const toggle = (k) => setSel((s) => ({ ...s, [k]: !s[k] }));

  const runCleanup = async () => {
    const payload = { days, ...sel, stripCbtReview: sel.cbtAttempts ? false : sel.stripCbtReview };
    if (!payload.userAttempts && !payload.publicAttempts && !payload.cbtAttempts && !payload.stripCbtReview) {
      setMsg("Pick at least one thing to clean up below.");
      return;
    }
    const ageLabel = AGE_OPTIONS.find((o) => o.v === days)?.l || `${days} days`;
    if (!window.confirm(`Clean up records older than ${ageLabel}? This cannot be undone.`)) return;
    setBusy(true);
    setMsg("");
    try {
      const r = await storageService.cleanup(payload);
      const parts = [];
      if (r.deletedUserAttempts) parts.push(`${r.deletedUserAttempts} quiz/test attempts`);
      if (r.deletedPublicAttempts) parts.push(`${r.deletedPublicAttempts} shared-link attempts`);
      if (r.deletedCbtAttempts) parts.push(`${r.deletedCbtAttempts} exam attempts`);
      if (r.strippedCbtReview) parts.push(`freed detail from ${r.strippedCbtReview} exam attempts`);
      setMsg(parts.length ? `Done — removed ${parts.join(", ")}. Storage updates below.` : "Nothing matched — there was nothing that old to remove.");
      load(days);
    } catch (e) {
      setMsg(e.message || "Cleanup failed.");
    } finally {
      setBusy(false);
    }
  };

  // ---- formatting helpers ----
  const fmtCap = (mb) => (mb >= 1024 ? `${Math.round((mb / 1024) * 10) / 10} GB` : `${mb} MB`);
  const fmtMB = (mb) => `${Math.round((mb || 0) * 10) / 10} MB`;
  const pctColor = (pct) => (pct >= 90 ? "text-rose-600 dark:text-rose-400" : pct >= 75 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400");

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight">
            <HardDrive className="h-6 w-6 text-brand-600" /> Storage
          </h1>
          <p className="mt-0.5 text-slate-500 dark:text-slate-400">Monitor your database usage and free up space by removing old records.</p>
        </div>
        <button onClick={() => load(days)} className="btn-outline" disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {loading ? (
        <Loading label="Checking storage…" />
      ) : error ? (
        <ErrorState message={error} onRetry={() => load(days)} />
      ) : data ? (
        <>
          {/* ---- Usage overview ---- */}
          {(() => {
            const dataPct = data.limitMB ? Math.min(100, (data.dataMB / data.limitMB) * 100) : 0;
            const idxPct = data.limitMB ? Math.min(100 - dataPct, (data.indexMB / data.limitMB) * 100) : 0;
            const freeMB = Math.max(0, Math.round((data.limitMB - data.totalMB) * 10) / 10);
            return (
              <div className="card overflow-hidden p-0">
                {/* top strip: which DB + live status */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                  <span className="inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:bg-brand-900/30 dark:text-brand-300">
                    <Database className="h-3.5 w-3.5" /> {data.engineLabel || "Database"}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
                    <span className={`h-2 w-2 rounded-full ${data.liveSize ? "animate-pulse bg-emerald-500" : "bg-slate-400"}`} />
                    {data.liveSize ? "Live · updates in real time" : "Live size unavailable for this database"}
                  </span>
                </div>

                <div className="p-5">
                  <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Used</p>
                      <p className="mt-0.5 text-3xl font-extrabold tracking-tight">
                        {data.totalMB} <span className="text-lg font-semibold text-slate-400">MB</span>
                        <span className="ml-2 text-base font-medium text-slate-400">of {fmtCap(data.limitMB)}</span>
                      </p>
                    </div>
                    <p className={`text-3xl font-extrabold tabular-nums ${pctColor(data.usedPct)}`}>{data.usedPct}%</p>
                  </div>

                  {/* segmented bar: data + indexes vs free */}
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                    <div className="h-full bg-emerald-500 transition-all" style={{ width: `${dataPct}%` }} />
                    <div className="h-full bg-indigo-500 transition-all" style={{ width: `${idxPct}%` }} />
                  </div>

                  {/* legend */}
                  <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Content {fmtMB(data.dataMB)}</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> Indexes {fmtMB(data.indexMB)}</span>
                    <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" /> Free {fmtMB(freeMB)}</span>
                  </div>

                  {data.usedPct >= 90 && (
                    <p className="mt-3 flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/20 dark:text-rose-300">
                      <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" /> Storage is almost full. Free up space below (or increase your plan) to avoid problems saving new content.
                    </p>
                  )}

                  {/* stat tiles */}
                  <div className="mt-4 grid grid-cols-3 gap-3">
                    {[
                      { icon: FileStack, label: "Content", value: fmtMB(data.dataMB), tint: "text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20" },
                      { icon: Layers, label: "Indexes", value: fmtMB(data.indexMB), tint: "text-indigo-600 bg-indigo-50 dark:bg-indigo-900/20" },
                      { icon: Hash, label: "Total records", value: (data.objects || 0).toLocaleString(), tint: "text-slate-600 bg-slate-100 dark:bg-slate-800" },
                    ].map((t) => (
                      <div key={t.label} className="rounded-xl border border-slate-100 p-3 text-center dark:border-slate-800">
                        <span className={`mx-auto mb-1.5 inline-flex h-8 w-8 items-center justify-center rounded-lg ${t.tint}`}>
                          <t.icon className="h-4 w-4" />
                        </span>
                        <p className="text-[11px] uppercase tracking-wide text-slate-400">{t.label}</p>
                        <p className="mt-0.5 text-base font-bold tabular-nums">{t.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* ---- Biggest collections ---- */}
          {data.collections?.length > 0 && (() => {
            const rows = data.collections.slice(0, 8).map((c) => ({ ...c, tot: Math.round((c.dataMB + c.indexMB) * 10) / 10 }));
            const max = Math.max(...rows.map((r) => r.tot), 0.1);
            return (
              <div className="card p-5">
                <p className="mb-4 text-sm font-semibold text-slate-600 dark:text-slate-300">What's using the space</p>
                <div className="space-y-3">
                  {rows.map((c) => (
                    <div key={c.name}>
                      <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                        <span className="truncate font-medium text-slate-700 dark:text-slate-200">{c.name}</span>
                        <span className="flex-shrink-0 tabular-nums text-slate-500 dark:text-slate-400">{c.tot} MB · {c.docs.toLocaleString()} records</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-indigo-500" style={{ width: `${Math.max(2, Math.round((c.tot / max) * 100))}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* ---- Cleanup ---- */}
          <div className="card p-5">
            <p className="flex items-center gap-2 text-lg font-bold"><Trash2 className="h-5 w-5 text-rose-600" /> Free up space</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Old records from tests and quizzes people took pile up over time. Remove ones older than:
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">Older than</span>
              <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="input max-w-[10rem] py-1.5 text-sm">
                {AGE_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </div>

            <div className="mt-4 space-y-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm transition hover:border-brand-300 hover:bg-brand-50/40 dark:border-slate-700 dark:hover:border-brand-700 dark:hover:bg-brand-900/10">
                <input type="checkbox" checked={sel.stripCbtReview} disabled={sel.cbtAttempts} onChange={() => toggle("stripCbtReview")} className="mt-0.5 h-4 w-4 accent-brand-600" />
                <span>
                  <b>Trim old exam (CBT) details</b> — keeps each candidate's score &amp; rank but removes the heavy full-paper snapshot. Safest, usually the biggest saving.
                  <span className="mt-0.5 block font-semibold text-brand-600 dark:text-brand-300">{data.cleanup.cbtWithReview.toLocaleString()} exam attempts can be trimmed</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm transition hover:border-brand-300 hover:bg-brand-50/40 dark:border-slate-700 dark:hover:border-brand-700 dark:hover:bg-brand-900/10">
                <input type="checkbox" checked={sel.publicAttempts} onChange={() => toggle("publicAttempts")} className="mt-0.5 h-4 w-4 accent-brand-600" />
                <span>
                  <b>Delete old shared-link results</b> — anonymous results from public share links.
                  <span className="mt-0.5 block font-semibold text-brand-600 dark:text-brand-300">{data.cleanup.publicAttempts.toLocaleString()} records</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm transition hover:border-brand-300 hover:bg-brand-50/40 dark:border-slate-700 dark:hover:border-brand-700 dark:hover:bg-brand-900/10">
                <input type="checkbox" checked={sel.userAttempts} onChange={() => toggle("userAttempts")} className="mt-0.5 h-4 w-4 accent-brand-600" />
                <span>
                  <b>Delete old quiz/test attempts</b> — students' past attempt history (their performance charts use this).
                  <span className="mt-0.5 block font-semibold text-brand-600 dark:text-brand-300">{data.cleanup.userAttempts.toLocaleString()} records</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-rose-200 p-3 text-sm transition hover:bg-rose-50/50 dark:border-rose-900/50 dark:hover:bg-rose-900/10">
                <input type="checkbox" checked={sel.cbtAttempts} onChange={() => toggle("cbtAttempts")} className="mt-0.5 h-4 w-4 accent-rose-600" />
                <span>
                  <b className="text-rose-700 dark:text-rose-300">Delete old exam (CBT) attempts entirely</b> — removes candidates' scores AND details for old exams. Use only if you don't need those rankings.
                  <span className="mt-0.5 block font-semibold text-rose-600 dark:text-rose-400">{data.cleanup.cbtAttempts.toLocaleString()} records</span>
                </span>
              </label>
            </div>

            {msg && <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200"><CheckCircle2 className="h-4 w-4 text-emerald-500" /> {msg}</p>}

            <div className="mt-4 flex justify-end">
              <button onClick={runCleanup} disabled={busy} className="btn-primary bg-rose-600 hover:bg-rose-700 disabled:opacity-50">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Cleaning up…</> : <><Trash2 className="h-4 w-4" /> Clean up now</>}
              </button>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Tip: deleting old records frees space immediately. Your questions and quizzes are never touched by this page — to remove those, use Delete / Find Duplicates in the content pages.
            </p>
          </div>
        </>
      ) : null}
    </div>
  );
}
