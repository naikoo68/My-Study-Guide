// "Video queue" — this account's long videos (made one at a time; other
// accounts render in their own queue, side by side). Shows which one is being
// made right now (and from which schedule), what is waiting behind it in
// order, and lets the admin stop any of them (nothing is posted).
import { useEffect, useState } from "react";
import { Film, Loader2, Square, Clock, AlertTriangle, CheckCircle2 } from "lucide-react";
import { youtubeService } from "../../services";

const mmss = (sec) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}` : `${m}:${String(r).padStart(2, "0")}`;
};
const KIND = { preview: "Preview", publish: "Publishing a preview" };

// Ask before stopping; for a schedule's video, offer to pause the schedule too
// (otherwise it simply makes this part again at its next time).
export function StopVideoButton({ job, onStopped, compact = false }) {
  const [asking, setAsking] = useState(false);
  const [pause, setPause] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  if (!job?.id) return null;
  if (!job.canStop) {
    return job.stopBlocked ? <span className="text-[11px] text-slate-400" title={job.stopBlocked}>Can't stop — uploading</span> : null;
  }
  const stop = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await youtubeService.stopLongVideo(job.id, { pauseSchedule: pause });
      setAsking(false);
      setMsg({ ok: true, text: r?.paused ? "Stopped, and its schedule is paused." : "Stopped — nothing was posted." });
      onStopped?.();
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); }
  };
  if (!asking) {
    return (
      <span className="inline-flex flex-col items-end gap-0.5">
        <button type="button" onClick={() => { setAsking(true); setMsg(null); }}
          className={`inline-flex items-center gap-1 rounded-lg border border-rose-200 font-semibold text-rose-600 hover:bg-rose-50 dark:border-rose-900/60 dark:hover:bg-rose-950/30 ${compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"}`}>
          <Square className="h-3 w-3 fill-current" /> Stop
        </button>
        {msg && <span className={`text-[11px] ${msg.ok ? "text-emerald-600" : "text-rose-600"}`}>{msg.text}</span>}
      </span>
    );
  }
  return (
    <div className="mt-2 w-full rounded-lg border border-rose-200 bg-rose-50/70 p-2 text-xs dark:border-rose-900/60 dark:bg-rose-950/20">
      <p className="font-semibold text-rose-700 dark:text-rose-300">
        {job.status === "running" ? "Stop making this video?" : "Remove this video from the queue?"} Nothing will be posted.
      </p>
      {job.scheduleId && (
        <label className="mt-1.5 flex items-start gap-1.5 text-slate-600 dark:text-slate-300">
          <input type="checkbox" className="mt-0.5 h-3.5 w-3.5 accent-rose-600" checked={pause} onChange={(e) => setPause(e.target.checked)} />
          <span>Also <b>pause its schedule</b>. If you leave it on, the schedule makes this same part again at its next time.</span>
        </label>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={stop} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-2.5 py-1 font-semibold text-white hover:bg-rose-700 disabled:opacity-60">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3 w-3 fill-current" />} {job.status === "running" ? "Stop video" : "Remove from queue"}
        </button>
        <button type="button" onClick={() => setAsking(false)} disabled={busy} className="rounded-lg px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">Keep it</button>
      </div>
      {msg && !msg.ok && <p className="mt-1 text-rose-600">{msg.text}</p>}
    </div>
  );
}

export default function VideoQueuePanel({ queue, scheduleTitle = {}, onChange, alwaysShow = false }) {
  const [now, setNow] = useState(() => Date.now());
  const running = queue.find((j) => j.status === "running");
  useEffect(() => {
    if (!running) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [running]);
  if (!queue.length && !alwaysShow) return null;
  const waiting = queue.filter((j) => j.status !== "running");

  return (
    <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-900/50 dark:bg-amber-950/10">
      <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
        <Film className="h-4 w-4 text-amber-600" /> Video queue
        <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
          {queue.length ? `${running ? "1 being made" : "starting"}${waiting.length ? ` · ${waiting.length} waiting` : ""} — this account's videos are made one at a time; other accounts have their own queue` : "nothing is being made"}
        </span>
      </p>
      <ol className="mt-2 space-y-2">
        {queue.map((j) => {
          const isRun = j.status === "running";
          const pct = Math.max(0, Math.min(100, Number(j.percent) || 0));
          const from = j.scheduleId ? (scheduleTitle[j.scheduleId] || "a schedule") : j.auto ? "a schedule (automatic)" : KIND[j.kind] ? "" : "Make & post video";
          const since = isRun ? j.startedAt || j.createdAt : j.createdAt;
          return (
            <li key={j.id || `other-${j.position}`} className={`rounded-lg border bg-white p-2 dark:bg-slate-900 ${isRun ? "border-amber-300 dark:border-amber-800" : "border-slate-200 dark:border-slate-700"}`}>
              <div className="flex flex-wrap items-start gap-2">
                <span className={`mt-0.5 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${isRun ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-200"}`}>
                  {isRun ? "Now" : `#${j.position + 1}`}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {j.title || j.label || "Untitled video"}
                    {KIND[j.kind] && <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800">{KIND[j.kind]}</span>}
                  </p>
                  {j.mine !== false && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {from && <>From: <b>{from}</b> · </>}
                      {j.questions ? `${j.questions} questions${j.range ? ` (${j.range})` : ""} · ` : ""}
                      <Clock className="mb-0.5 inline h-3 w-3" /> {isRun ? "making for" : "waiting for"} {mmss((now - (since || now)) / 1000)}
                    </p>
                  )}
                </div>
                {j.mine !== false && <StopVideoButton job={j} onStopped={onChange} compact />}
              </div>
              {isRun && (
                <div className="mt-1.5">
                  <div className="flex items-center justify-between text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> {j.stageLabel}</span>
                    <span className="tabular-nums">{pct}%</span>
                  </div>
                  <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-amber-100 dark:bg-amber-900/40">
                    <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${Math.max(2, pct)}%` }} />
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {!queue.length && <p className="mt-1 flex items-center gap-1 text-xs text-slate-500"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Nothing is being made right now.</p>}
      {queue.some((j) => j.mine === false) && (
        <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-400"><AlertTriangle className="h-3 w-3" /> “Another account's video” belongs to a different institute — only they can stop it.</p>
      )}
    </div>
  );
}
