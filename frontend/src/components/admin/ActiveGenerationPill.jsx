import { useEffect, useRef, useState } from "react";
import { Loader2, CheckCircle2, Sparkles, Square, X, PictureInPicture2 } from "lucide-react";
import { aiService } from "../../services";
import { getActiveGenJob, patchActiveGenJob, clearActiveGenJob } from "../../lib/activeGenJob";
import { isPipSupported, startProgressPip, updateProgressPip, closeProgressPip } from "../../lib/pipProgress";
import { notifyDone } from "../../lib/webNotify";
import NotifyWhenDoneButton from "./NotifyWhenDoneButton";

// Merge freshly-finished questions into the AiGenerate checkpoint (keyed by
// ckKey) so reopening the generator on the original target restores them for
// review/insert. The generator's own resume-on-open effect reads this key.
function saveQuestionsToCheckpoint(ckKey, questions) {
  if (!ckKey || !questions?.length) return;
  try {
    const cur = JSON.parse(localStorage.getItem(ckKey) || "{}");
    const seen = new Set();
    const merged = [];
    for (const q of [...(cur.preview || []), ...questions]) {
      const k = String(q?.text || "").trim().toLowerCase();
      if (!k || seen.has(k)) continue;
      seen.add(k);
      merged.push(q);
    }
    localStorage.setItem(ckKey, JSON.stringify({ ...cur, preview: merged, updatedAt: Date.now() }));
  } catch {
    /* storage full / blocked */
  }
}

/**
 * ActiveGenerationPill — a floating progress pill that survives a full page
 * reload. It re-attaches (via the global activeGenJob pointer) to a background
 * generation job started earlier and keeps polling it, so switching apps or
 * minimizing the browser on mobile no longer loses sight of a run in progress.
 *
 * Rendered by AiModalProvider ONLY while the full generator modal is closed, so
 * it never double-polls alongside the open generator (which manages its own
 * minimized pill).
 *
 * Props:
 *  - onOpen({ targetName, label, dest }) — reopen the full generator to insert.
 */
export default function ActiveGenerationPill({ onOpen }) {
  const [job, setJob] = useState(() => getActiveGenJob());
  const [status, setStatus] = useState(job?.status || "running");
  const [count, setCount] = useState(job?.count || 0);
  const [requested, setRequested] = useState(job?.requested || 0);
  const [stopping, setStopping] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [pipOn, setPipOn] = useState(false);
  const timerRef = useRef(null);
  const pipSupported = isPipSupported();

  // Re-read the pointer on mount and whenever the tab regains focus (returning
  // from another app / reopening the browser), so the pill reappears after a
  // reload or a background tab restore.
  useEffect(() => {
    const refresh = () => {
      const j = getActiveGenJob();
      if (j) {
        setJob(j);
        setStatus((prev) => (prev === "done" ? prev : j.status || "running"));
        setCount((prev) => Math.max(prev, j.count || 0));
        setRequested((prev) => prev || j.requested || 0);
        setDismissed(false);
      }
    };
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  // Poll the background job until it finishes (or expires on the server).
  useEffect(() => {
    if (!job?.jobId || dismissed || status === "done" || status === "error") return;
    let cancelled = false;
    let misses = 0;
    const tick = async () => {
      let s;
      try {
        s = await aiService.job(job.jobId);
      } catch {
        // 404 / network → the job may have expired on the server. After a couple
        // of misses, assume it finished (any completed questions are already in
        // the checkpoint) and flip the pill to "ready".
        if (++misses >= 2) {
          if (!cancelled) {
            setStatus("done");
            patchActiveGenJob({ status: "done" });
          }
          return;
        }
        timerRef.current = setTimeout(tick, 3000);
        return;
      }
      misses = 0;
      if (cancelled) return;
      if (typeof s.count === "number") {
        setCount(s.count);
        patchActiveGenJob({ count: s.count });
      }
      if (typeof s.requested === "number" && s.requested) setRequested(s.requested);
      if (s.status === "done") {
        setStatus("done");
        patchActiveGenJob({ status: "done", count: s.count ?? count });
        if (Array.isArray(s.questions)) saveQuestionsToCheckpoint(job.ckKey, s.questions);
        // SW-aware notification so it also fires on installed iOS/iPadOS apps.
        notifyDone("Questions ready", `${s.questions?.length ?? s.count ?? ""} question(s) generated — open to insert.`);
        return; // stop polling
      }
      if (s.status === "error") {
        setStatus("error");
        patchActiveGenJob({ status: "done" });
        return;
      }
      timerRef.current = setTimeout(tick, 3000);
    };
    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [job?.jobId, dismissed, status]); // eslint-disable-line react-hooks/exhaustive-deps

  // Push live progress into the PiP window whenever it's open.
  useEffect(() => {
    if (!pipOn) return;
    updateProgressPip({ count, requested, done: status === "done", label: job?.label });
  }, [pipOn, count, requested, status, job?.label]);

  // Tear down the PiP window if this pill unmounts (e.g. the generator opens).
  useEffect(() => () => { closeProgressPip(); }, []);

  if (!job?.jobId || dismissed) return null;

  const done = status === "done";
  const errored = status === "error";
  const remaining = Math.max(0, (requested || 0) - (count || 0));
  const hasLabel = job.label && job.label !== "AI generation";

  const stop = async () => {
    setStopping(true);
    try {
      await aiService.cancelJob(job.jobId);
    } catch {
      /* best-effort — the server finalizes the job with whatever it produced */
    }
    setStatus("done");
    patchActiveGenJob({ status: "done" });
    setStopping(false);
  };

  const open = () => {
    // Reopen the full generator. The provider rebuilds the target key so the
    // generator's checkpoint restores the generated questions, and a recovery
    // uploader (from the saved destination) so Insert still lands in the right
    // quiz after a reload. The generator then owns the pointer (clears on insert).
    onOpen?.({ targetName: job.targetName || "", label: hasLabel ? job.label : "", dest: job.dest || null });
    setDismissed(true);
  };

  const dismiss = () => {
    clearActiveGenJob();
    closeProgressPip();
    setDismissed(true);
  };

  // Pop the progress out into a floating Picture-in-Picture window that stays on
  // top of other apps / the home screen (so you can watch it while you're away
  // from the browser). Must run from this tap — PiP needs a user gesture.
  const togglePip = async () => {
    if (pipOn) {
      await closeProgressPip();
      setPipOn(false);
      return;
    }
    try {
      await startProgressPip(
        { count, requested, done, label: hasLabel ? job.label : "" },
        { onStop: stop, onOpen: open, onClose: () => setPipOn(false) }
      );
      setPipOn(true);
    } catch {
      setPipOn(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 max-w-[calc(100vw-2rem)] animate-scale-in rounded-2xl border border-slate-200 bg-white p-3 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      <button
        onClick={dismiss}
        title="Dismiss"
        className="absolute right-1.5 top-1.5 rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start gap-2.5">
        <div
          className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
            done
              ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-brand-100 text-brand-600 dark:bg-brand-900/40 dark:text-brand-300"
          }`}
        >
          {done ? <CheckCircle2 className="h-4 w-4" /> : errored ? <Sparkles className="h-4 w-4" /> : <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
        <div className="min-w-0 flex-1 pr-4">
          <p className="text-sm font-semibold">{done ? "Questions ready" : errored ? "Generation stopped" : "Generating…"}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-500 dark:text-slate-400">
            {done
              ? `${count || ""} question(s) ready — open to insert.`
              : errored
                ? "Open the generator to review what was kept."
                : `${count} of ${requested || "?"} ready${requested ? ` (${remaining} to go)` : ""}${hasLabel ? ` · ${job.label}` : ""}`}
          </p>
        </div>
      </div>
      <div className="mt-2.5 flex gap-2">
        <button onClick={open} className="btn-primary flex-1 py-1 text-xs">
          {done ? "Open to insert" : "Open"}
        </button>
        {pipSupported ? (
          <button
            onClick={togglePip}
            title={pipOn ? "Close the floating window" : "Pop out — keep this visible on top of other apps"}
            className={`btn-outline py-1 text-xs ${pipOn ? "!text-brand-600 dark:!text-brand-300" : ""}`}
          >
            <PictureInPicture2 className="h-3.5 w-3.5" /> {pipOn ? "Close" : "Pop out"}
          </button>
        ) : (
          // No PiP here (e.g. iPhone/iPad) — offer a completion notification instead.
          <NotifyWhenDoneButton />
        )}
        {!done && !errored && (
          <button onClick={stop} disabled={stopping} className="btn-outline py-1 text-xs !text-rose-600 disabled:opacity-50 dark:!text-rose-400">
            <Square className="h-3.5 w-3.5" /> Stop
          </button>
        )}
      </div>
    </div>
  );
}
