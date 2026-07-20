import { useCallback, useEffect, useState } from "react";
import {
  MonitorCheck, Users, Eye, ExternalLink, Copy, Check, RefreshCw, Trophy, Clock,
  Loader2, X, Plus, Search, CalendarClock, Ban, FileStack, Mail, Medal,
} from "lucide-react";
import { cbtService } from "../../services";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

// Public exam URL (hash-router friendly): students sign in with name+email here.
const examUrl = (token) => `${window.location.origin}${window.location.pathname}#/cbt/exam/${token}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleString() : "—");
const fmtTime = (s) => {
  const n = Number(s) || 0;
  return `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
};
const isExpired = (d) => d && new Date(d).getTime() < Date.now();

// Rank badge colour (gold / silver / bronze for the top three).
const rankStyle = (r) =>
  r === 1 ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
    : r === 2 ? "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
    : r === 3 ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300"
    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400";

export default function AdminCbt() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState("");
  const [busy, setBusy] = useState("");
  const [pullOpen, setPullOpen] = useState(false);
  const [board, setBoard] = useState(null); // { row, data, loading }

  const load = useCallback(() => {
    setLoading(true);
    setError("");
    cbtService
      .exams()
      .then((r) => setRows(Array.isArray(r) ? r : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  const copy = async (token) => {
    try {
      await navigator.clipboard.writeText(examUrl(token));
      setCopied(token);
      setTimeout(() => setCopied(""), 2000);
    } catch {
      window.prompt("Copy this exam link:", examUrl(token));
    }
  };

  const closeExam = async (r) => {
    if (!window.confirm(`Close the exam “${r.name}”?\nThe link will stop working immediately. Candidate results & rankings are kept.`)) return;
    setBusy(r._id);
    try {
      await cbtService.unpublish(r._id);
      setRows((list) => list.filter((x) => x._id !== r._id));
    } catch (e) {
      alert(e.message || "Could not close the exam.");
    } finally {
      setBusy("");
    }
  };

  const openBoard = (row) => {
    setBoard({ row, data: null, loading: true });
    cbtService
      .leaderboard(row._id)
      .then((data) => setBoard({ row, data, loading: false }))
      .catch((e) => setBoard({ row, data: { error: e.message, rows: [] }, loading: false }));
  };

  const totalCandidates = rows.reduce((s, r) => s + (r.candidates || 0), 0);
  const totalAttempts = rows.reduce((s, r) => s + (r.attempts || 0), 0);
  const totalOpens = rows.reduce((s, r) => s + (r.opens || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold">
            <MonitorCheck className="h-6 w-6 text-brand-600" /> Online Exams (CBT)
          </h1>
          <p className="text-slate-500 dark:text-slate-400">
            Publish a test from “My Tests” as an online exam. Students sign in with just their name &amp; email, take it,
            and get their result (answers, explanations &amp; rank) emailed automatically.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} disabled={loading} className="btn-outline">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
          <button onClick={() => setPullOpen(true)} className="btn-primary">
            <Plus className="h-4 w-4" /> Pull test
          </button>
        </div>
      </div>

      {/* Summary */}
      {!loading && !error && rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="card p-4"><p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{rows.length}</p><p className="text-xs text-slate-500">Live exams</p></div>
          <div className="card p-4"><p className="text-2xl font-bold text-brand-600 dark:text-brand-400">{totalOpens}</p><p className="text-xs text-slate-500">Total opens</p></div>
          <div className="card p-4"><p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{totalCandidates}</p><p className="text-xs text-slate-500">Candidates</p></div>
          <div className="card p-4"><p className="text-2xl font-bold text-accent-600 dark:text-accent-400">{totalAttempts}</p><p className="text-xs text-slate-500">Total attempts</p></div>
        </div>
      )}

      {loading ? (
        <Loading label="Loading online exams..." />
      ) : error ? (
        <ErrorState message={error} onRetry={load} />
      ) : rows.length === 0 ? (
        <EmptyState message='No online exams yet. Tap "Pull test" to publish one of your My Tests as a CBT exam.' />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const expired = isExpired(r.cbtExpiresAt);
            return (
              <div key={r._id} className="card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-bold">{r.name}</p>
                      {expired ? (
                        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-xs font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">Closed</span>
                      ) : (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Live</span>
                      )}
                    </div>
                    {r.context && <p className="mt-0.5 text-xs text-slate-400">{r.context}</p>}
                    <p className="mt-0.5 text-xs text-slate-400">
                      {r.questionCount} questions · {r.duration} min · {r.marks} marks
                      {r.cbtExpiresAt && ` · closes ${fmtDate(r.cbtExpiresAt)}`}
                      {r.lastAttemptAt && ` · last attempt ${fmtDate(r.lastAttemptAt)}`}
                    </p>
                  </div>

                  <div className="flex flex-shrink-0 items-center gap-4">
                    <div className="text-center">
                      <p className="flex items-center gap-1 text-2xl font-extrabold text-brand-600 dark:text-brand-400"><Eye className="h-5 w-5" /> {r.opens ?? 0}</p>
                      <p className="text-[11px] text-slate-500">opened</p>
                    </div>
                    <div className="text-center">
                      <p className="flex items-center gap-1 text-2xl font-extrabold text-emerald-600 dark:text-emerald-400"><Users className="h-5 w-5" /> {r.candidates}</p>
                      <p className="text-[11px] text-slate-500">candidates</p>
                    </div>
                    {r.avgPercentage != null && (
                      <div className="text-center">
                        <p className="text-2xl font-extrabold text-brand-600 dark:text-brand-400">{r.avgPercentage}%</p>
                        <p className="text-[11px] text-slate-500">avg score</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <a href={examUrl(r.cbtToken)} target="_blank" rel="noreferrer" className="btn-primary py-1.5 text-xs">
                    <ExternalLink className="h-3.5 w-3.5" /> Open exam
                  </a>
                  <button onClick={() => copy(r.cbtToken)} className="btn-outline py-1.5 text-xs">
                    {copied === r.cbtToken ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy link</>}
                  </button>
                  <button onClick={() => openBoard(r)} disabled={!r.candidates} className="btn-outline py-1.5 text-xs disabled:opacity-50">
                    <Trophy className="h-3.5 w-3.5" /> Rankings ({r.candidates})
                  </button>
                  <button onClick={() => closeExam(r)} disabled={busy === r._id} className="btn-outline py-1.5 text-xs text-rose-600 disabled:opacity-50" title="Close this exam (link stops working)">
                    {busy === r._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />} Close
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pullOpen && <PullTestModal onClose={() => setPullOpen(false)} onPublished={() => { setPullOpen(false); load(); }} />}

      {board && <LeaderboardModal board={board} onClose={() => setBoard(null)} />}
    </div>
  );
}

/* ---------------- Pull-test modal: publish a My Test as a CBT exam ---------------- */
function PullTestModal({ onClose, onPublished }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [publishing, setPublishing] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  useEffect(() => {
    setLoading(true);
    cbtService
      .candidates()
      .then((r) => setItems(Array.isArray(r) ? r : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const publish = async (item) => {
    setPublishing(item._id);
    try {
      await cbtService.publish(item._id, expiresAt ? new Date(expiresAt).toISOString() : undefined);
      onPublished();
    } catch (e) {
      alert(e.message || "Could not publish this test.");
      setPublishing("");
    }
  };

  const filtered = items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="my-10 w-full max-w-2xl animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold"><FileStack className="h-5 w-5 text-brand-600" /> Pull a test into an online exam</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
            <Search className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search My Tests…" className="w-full bg-transparent py-2 text-sm outline-none" />
          </div>
        </div>
        <label className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <CalendarClock className="h-4 w-4" /> Auto-close (optional):
          <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="rounded-lg border border-slate-200 px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800" />
          {expiresAt && <button onClick={() => setExpiresAt("")} className="text-xs text-rose-500">clear</button>}
        </label>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : error ? (
          <ErrorState message={error} />
        ) : filtered.length === 0 ? (
          <EmptyState message="No My Tests found. Create a My Test (with questions) first." />
        ) : (
          <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {filtered.map((i) => (
              <div key={i._id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{i.name}</p>
                  <p className="text-xs text-slate-400">
                    {i.context && `${i.context} · `}{i.questionCount} questions · {i.duration} min
                  </p>
                </div>
                {i.cbtEnabled ? (
                  <span className="flex-shrink-0 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Already live</span>
                ) : (
                  <button onClick={() => publish(i)} disabled={publishing === i._id || !i.questionCount} className="btn-primary flex-shrink-0 py-1.5 text-xs disabled:opacity-50" title={!i.questionCount ? "Add questions first" : "Publish as an online exam"}>
                    {publishing === i._id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MonitorCheck className="h-3.5 w-3.5" />} Publish
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Leaderboard modal: all candidates ranked ---------------- */
function LeaderboardModal({ board, onClose }) {
  const rows = board.data?.rows || [];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="my-10 w-full max-w-3xl animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Trophy className="h-5 w-5 text-amber-500" /> Rankings — {board.row.name}</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        {board.loading ? (
          <div className="flex items-center justify-center py-10 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : board.data?.error ? (
          <ErrorState message={board.data.error} />
        ) : rows.length === 0 ? (
          <EmptyState message="No candidates have completed this exam yet." />
        ) : (
          <>
            <p className="mb-3 text-sm text-slate-500">
              {board.data.candidates} candidate{board.data.candidates === 1 ? "" : "s"} · {board.data.totalAttempts} attempt{board.data.totalAttempts === 1 ? "" : "s"} (best attempt per student shown)
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[620px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60">
                    <th className="px-3 py-2 text-left font-semibold">Rank</th>
                    <th className="px-3 py-2 text-left font-semibold">Name</th>
                    <th className="px-3 py-2 text-left font-semibold">Email</th>
                    <th className="px-3 py-2 text-left font-semibold">Score</th>
                    <th className="px-3 py-2 text-left font-semibold">%</th>
                    <th className="px-3 py-2 text-left font-semibold">Correct</th>
                    <th className="px-3 py-2 text-left font-semibold">Time</th>
                    <th className="px-3 py-2 text-left font-semibold">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.email + a.rank} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="px-3 py-2">
                        <span className={`inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-full px-2 text-xs font-bold ${rankStyle(a.rank)}`}>
                          {a.rank <= 3 && <Medal className="h-3 w-3" />}{a.rank}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-semibold">{a.name}</td>
                      <td className="px-3 py-2 text-slate-500"><span className="inline-flex items-center gap-1"><Mail className="h-3 w-3 text-slate-400" />{a.email}</span></td>
                      <td className="px-3 py-2 font-semibold">{a.score}{a.maxScore != null ? ` / ${a.maxScore}` : ""}</td>
                      <td className="px-3 py-2">{a.percentage}%</td>
                      <td className="px-3 py-2">{a.correct}/{a.totalQ}</td>
                      <td className="px-3 py-2 tabular-nums"><Clock className="mr-1 inline h-3 w-3 text-slate-400" />{fmtTime(a.timeTaken)}</td>
                      <td className="px-3 py-2 text-slate-500">{fmtDate(a.at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
