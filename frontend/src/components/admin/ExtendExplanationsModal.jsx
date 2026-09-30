import { useEffect, useState, useRef } from "react";
import { X, Wand2, Loader2, CheckCircle2, AlertTriangle, Server, KeyRound } from "lucide-react";
import { aiService } from "../../services";
import { useAuth } from "../../context/AuthContext";
import { waitFromStatus, useSecondsLeft, bulkWaitText } from "./bulkWait";
import BatchModePicker from "./BatchModePicker";
import { loadBatchMode } from "./batchMode";

// Which question types the bulk action can be limited to. "all" = every type.
const Q_TYPE_OPTIONS = [
  { value: "all", label: "All question types" },
  { value: "mcq", label: "Only MCQ" },
  { value: "matching", label: "Only Matching" },
  { value: "statement", label: "Only Statement" },
  { value: "pair", label: "Only Pair" },
  { value: "pairselect", label: "Only Pair-select" },
  { value: "assertion", label: "Only Assertion" },
  { value: "table", label: "Only Table" },
  { value: "diagram", label: "Only Diagram" },
  { value: "not_updated", label: "Only Not Updated" },
];

/**
 * ExtendExplanationsModal — AI-rewrites the explanation + per-option notes of
 * EVERY question in one quiz or test, in place (nothing is added or removed;
 * only the explanations get richer). Runs as a background job with progress.
 *
 * Props:
 *  - open: boolean
 *  - target: { quiz } | { testSeries }  — the id set to extend
 *  - title: string  — the quiz/test name (shown in the header)
 *  - onClose()
 *  - onDone()  — called after a successful run so the parent can reload questions
 */
export default function ExtendExplanationsModal({ open, target, title, onClose, onDone, questionIds }) {
  const { user } = useAuth();
  // When the admin ticked specific questions, the run is limited to just those
  // (the type filter is hidden — the selection already IS the filter).
  const scoped = Array.isArray(questionIds) && questionIds.length > 0;
  const isClient = user?.role === "client" && user?.aiAccess;
  const canChooseSource = isClient && user?.aiAllowInbuilt !== false && user?.aiAllowSelf !== false;
  const [srcMode, setSrcMode] = useState(user?.aiMode === "self" ? "self" : "inbuilt");
  const [status, setStatus] = useState(null);
  const [model, setModel] = useState("");
  const [notes, setNotes] = useState("");
  const [fixOptions, setFixOptions] = useState(false); // also rewrite off-category / wrong options
  const [extendQuestion, setExtendQuestion] = useState(false); // also make the question stem longer/more detailed
  const [shuffleOptions, setShuffleOptions] = useState(false); // also reorder options (answer position changes, stays correct)
  const [qType, setQType] = useState("all"); // limit to one question type, or "all"
  const [batchMode, setBatchMode] = useState(loadBatchMode); // questions per AI request (see BatchModePicker)
  const [perRequest, setPerRequest] = useState(null);
  const [limitDetail, setLimitDetail] = useState(""); // provider's last rate-limit message
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total, remainingRun }
  const [remainingQuestionIds, setRemainingQuestionIds] = useState(null); // exact unfinished ids after a partial run
  const [msg, setMsg] = useState("");
  // While the job runs: { done, total, wait } → a status line that ticks every second.
  const [live, setLive] = useState(null);
  const secondsLeft = useSecondsLeft(live?.wait?.until || 0);
  const [keyStats, setKeyStats] = useState(null); // live per-key activity this run { label: {requests,ok,limited,error,questions} }
  const jobRef = useRef(null);      // current background job id (for Cancel)
  const cancelRef = useRef(false);  // set true when the user cancels → stops polling
  const wakeRef = useRef(null);     // ends the current poll wait early (Cancel → check now)

  useEffect(() => {
    if (!open) return;
    setMsg("");
    setProgress(null);
    setRemainingQuestionIds(null);
    setKeyStats(null);
    setBusy(false);
    setNotes("");
    setFixOptions(false);
    setExtendQuestion(false);
    setShuffleOptions(false);
    setQType("all");
  }, [open]);

  // Background page-scroll lock is handled globally by <ModalScrollLock/> (it
  // detects this modal's `fixed inset-0 … bg-black/50` backdrop), so every modal
  // on the site gets the behaviour without wiring it in one-by-one.

  useEffect(() => {
    if (!open) return;
    aiService
      .status(isClient ? srcMode : undefined)
      .then((s) => { setStatus(s); setModel(s?.model || (s?.models && s.models[0]) || ""); })
      .catch(() => setStatus({ enabled: false }));
  }, [open, srcMode, isClient]);

  if (!open) return null;

  // Cancel: the server aborts the job's AI requests and finishes it at once
  // (keeping every question already saved); then poll RIGHT AWAY (wake the
  // 2-second wait) so the result shows immediately.
  const cancel = async () => {
    cancelRef.current = true;
    setLive(null);
    setMsg("Cancelling…");
    try { if (jobRef.current) await aiService.cancelJob(jobRef.current); } catch { /* ignore */ }
    wakeRef.current?.();
  };

  const run = async () => {
    const runWasResume = Array.isArray(remainingQuestionIds) && remainingQuestionIds.length > 0;
    const idsToRun = runWasResume ? remainingQuestionIds : (scoped ? questionIds : undefined);
    setBusy(true);
    setMsg(runWasResume ? `Starting ${remainingQuestionIds.length} remaining question(s)…` : "Starting…");
    setProgress(null);
    setKeyStats(null);
    cancelRef.current = false;
    try {
      const { jobId, requested } = await aiService.extendExplanations({
        ...target,
        model: model || undefined,
        notes: notes.trim() || undefined,
        mode: isClient ? srcMode : undefined,
        fixOptions: fixOptions || undefined,
        extendQuestion: extendQuestion || undefined,
        shuffleOptions: shuffleOptions || undefined,
        batchMode,
        // On a partial run, submit the exact unfinished ids returned by the job.
        // Otherwise a selection overrides the type filter.
        type: (!runWasResume && !scoped && qType !== "all") ? qType : undefined,
        questionIds: idsToRun,
      });
      if (!jobId) throw new Error("Could not start.");
      jobRef.current = jobId;
      setProgress({ done: 0, total: requested, remainingRun: runWasResume });
      const sleep = (ms) => new Promise((r) => { const t = setTimeout(r, ms); wakeRef.current = () => { clearTimeout(t); r(); }; });
      let done = false;
      let lastCount = 0;
      for (let i = 0; i < 400 && !done; i++) {
        await sleep(cancelRef.current ? 300 : 2000);
        let s;
        try { s = await aiService.job(jobId); } catch { continue; }
        if (s.keyStats && Object.keys(s.keyStats).length) setKeyStats(s.keyStats);
        if (s.perRequest) setPerRequest(s.perRequest);
        setLimitDetail(s.lastLimitDetail || "");
        const total = s.requested || requested;
        const doneCount = s.count ?? lastCount;
        lastCount = doneCount;
        const returnedRemainingIds = Array.isArray(s.remainingQuestionIds) ? s.remainingQuestionIds : null;
        const remainingCount = returnedRemainingIds?.length ?? Math.max(0, total - doneCount);

        if (s.status !== "pending") setLive(null);
        if (s.status === "done") {
          if (returnedRemainingIds) setRemainingQuestionIds(returnedRemainingIds);
          setProgress({ done: doneCount, total, remainingRun: runWasResume });
          if (cancelRef.current || s.cancelled) {
            setMsg(`✓ Cancelled — kept ${doneCount} updated question(s)${remainingCount ? `; ${remainingCount} remaining.` : "."}`);
          } else if (remainingCount > 0) {
            const reason = s.error === "quota"
              ? "The available API keys are still rate/quota limited. Add another key or try later."
              : "Some explanations could not be generated.";
            setMsg(`✓ Updated explanations for ${doneCount} of ${total} ${runWasResume ? "remaining " : ""}question(s) — ${remainingCount} remaining. ${reason}`);
          } else {
            setMsg(`✓ Updated explanations for all ${doneCount} ${runWasResume ? "remaining " : ""}question(s).`);
          }
          done = true;
          onDone?.();
        } else if (s.status === "error") {
          if (returnedRemainingIds) setRemainingQuestionIds(returnedRemainingIds);
          setProgress({ done: doneCount, total, remainingRun: runWasResume });
          setMsg(cancelRef.current || s.cancelled
            ? `✓ Cancelled — kept ${doneCount} updated question(s)${remainingCount ? `; ${remainingCount} remaining.` : "."}`
            : `${s.error || "Failed."}${remainingCount ? ` ${remainingCount} question(s) remain.` : ""}`);
          done = true;
          if (doneCount > 0) onDone?.();
        } else {
          setProgress({ done: doneCount, total, remainingRun: runWasResume });
          if (cancelRef.current) {
            setLive(null);
            setMsg(`Cancelling… keeping ${doneCount} question(s) already updated.`);
          } else {
            setMsg("");
            setLive({ verb: `Updating ${runWasResume ? "remaining " : ""}explanations`, done: doneCount, total, wait: waitFromStatus(s) });
          }
        }
      }
      if (!done) { setLive(null); setMsg("Still working — this is taking longer than expected. It keeps running in the background; reopen later."); }
    } catch (e) {
      setLive(null);
      setMsg(e.message || "Failed.");
    } finally {
      jobRef.current = null;
      setBusy(false);
    }
  };

  const remainingCount = remainingQuestionIds?.length || 0;
  const pct = progress && progress.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-black/50 p-0 sm:p-4" onClick={busy ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="min-h-full w-full max-w-none animate-scale-in card m-0 rounded-none p-4 sm:rounded-2xl sm:p-6">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Wand2 className="h-5 w-5 text-brand-600" /> Extend Explanations</h3>
          <button onClick={onClose} disabled={busy}><X className="h-5 w-5" /></button>
        </div>
        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{title}</p>

        {canChooseSource && (
          <div className="mb-3">
            <label className="mb-1 block text-sm font-semibold">API source</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSrcMode("inbuilt")} disabled={busy}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${srcMode === "inbuilt" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300" : "border-slate-200 text-slate-600 hover:border-brand-400 dark:border-slate-700 dark:text-slate-300"}`}>
                <Server className="h-4 w-4" /> Built-in APIs
              </button>
              <button type="button" onClick={() => setSrcMode("self")} disabled={busy}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${srcMode === "self" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300" : "border-slate-200 text-slate-600 hover:border-brand-400 dark:border-slate-700 dark:text-slate-300"}`}>
                <KeyRound className="h-4 w-4" /> My own APIs
              </button>
            </div>
          </div>
        )}

        {status && !status.enabled ? (
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> AI is not available</p>
            <p className="mt-1">{isClient ? "Add an API key in the AI tab, or ask your administrator." : "Add an API key in Admin → AI Keys to enable this."}</p>
          </div>
        ) : (
          <>
            {status?.enabled && (
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                Using <b>{status.keys ?? 0}</b> API key{status.keys === 1 ? "" : "s"}
                {status.model ? <> · <span className="font-mono">{status.model}</span></> : null}.
                {" "}More keys spread the load, so bulk jobs hit rate-limit pauses less often.
              </p>
            )}
            {remainingCount > 0 ? (
              <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs font-medium text-brand-700 dark:border-brand-900/50 dark:bg-brand-900/20 dark:text-brand-300">
                <b>{remainingCount} question{remainingCount === 1 ? "" : "s"} remain.</b> The next run will extend only these unfinished questions; explanations already completed in this session will not run again.
              </div>
            ) : scoped ? (
              <div className="mb-3 rounded-xl border border-brand-200 bg-brand-50 p-3 text-xs font-medium text-brand-700 dark:border-brand-900/50 dark:bg-brand-900/20 dark:text-brand-300">
                Applying to the <b>{questionIds.length} selected question{questionIds.length === 1 ? "" : "s"}</b> only. The questions, options and correct answers are <b>not</b> changed — only the explanations get richer.
              </div>
            ) : (
              <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                This rewrites the explanation and per-option notes for <b>every question</b> in this{" "}
                {target?.testSeries ? "test" : "quiz"}, making them detailed and complete. The questions,
                options and correct answers are <b>not</b> changed.
              </div>
            )}

            {!scoped && remainingCount === 0 && (
              <div className="mb-3">
                <label className="mb-1 block text-sm font-semibold">Apply to</label>
                <select className="input" value={qType} onChange={(e) => setQType(e.target.value)} disabled={busy}>
                  {Q_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Choose a single question type to update only those (e.g. only Matching or only Pair), or leave on "All question types".</p>
              </div>
            )}

            {status?.models && status.models.length > 1 && (
              <div className="mb-3">
                <label className="mb-1 block text-sm font-semibold">AI model</label>
                <select className="input" value={model} onChange={(e) => setModel(e.target.value)} disabled={busy}>
                  {status.models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}

            <label className="mb-1 block text-sm font-semibold">Instructions (optional — followed strictly)</label>
            <textarea
              rows={2}
              className="input resize-y"
              placeholder='e.g. "Explain in simple language", "Add the Hindi term in brackets", "Include the formula and a worked example"'
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={busy}
            />

            <label className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={fixOptions} onChange={(e) => setFixOptions(e.target.checked)} disabled={busy} />
              <span>Also fix <b>off-category / wrong options</b> — replace any option that isn't the same type as the answer (e.g. a bird among tree names) with a closely-related one. The question &amp; correct answer stay the same.</span>
            </label>

            <label className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={extendQuestion} onChange={(e) => setExtendQuestion(e.target.checked)} disabled={busy} />
              <span>Also <b>extend the question length</b> — only questions that genuinely need it (a bare/terse stem) are rewritten into a clearer question (kept to <b>at most 3 lines</b>); already-clear ones like "full form of…" or "SI unit of…" are left unchanged. The <b>meaning</b>, options and correct answer stay the same.</span>
            </label>

            <label className="mt-3 flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={shuffleOptions} onChange={(e) => setShuffleOptions(e.target.checked)} disabled={busy} />
              <span>Also <b>reshuffle the options</b> — move each answer to a new position so it isn't always in the same place. The <b>same</b> option stays correct (assertion questions are left as-is).</span>
            </label>

            <BatchModePicker value={batchMode} onChange={setBatchMode} disabled={busy} keys={status?.keys || 0}
              total={remainingQuestionIds?.length || questionIds?.length || progress?.total || 0} />

            {progress && (
              <div className="mt-4">
                <div className="mb-1 flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
                  <span>{progress.done} / {progress.total} {progress.remainingRun ? "remaining questions updated" : "updated"}</span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} />
                </div>
              </div>
            )}

            <button type="button" onClick={run} disabled={busy} className="btn-primary mt-4 w-full">
              {busy ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> {progress?.remainingRun ? `Extending ${progress.total} remaining…` : "Extending…"}</>
              ) : remainingCount > 0 ? (
                <><Wand2 className="h-4 w-4" /> Extend remaining {remainingCount} explanation{remainingCount === 1 ? "" : "s"}</>
              ) : (
                <><Wand2 className="h-4 w-4" /> Extend all explanations</>
              )}
            </button>
            {busy && (
              <button type="button" onClick={cancel} className="btn-outline mt-2 w-full text-rose-600">
                <X className="h-4 w-4" /> Cancel (keep what's done)
              </button>
            )}
          </>
        )}

        {live && busy && !msg && (
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{bulkWaitText({ ...live, secondsLeft })}</p>
        )}
        {msg && (
          <p className="mt-3 inline-flex items-center gap-1 text-sm font-medium">
            {msg.startsWith("✓") && <CheckCircle2 className="h-4 w-4 text-emerald-600" />} {msg}
          </p>
        )}

        {/* Live per-key activity — see every key working at once, in real time. */}
        {keyStats && Object.keys(keyStats).length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Keys working this run ({Object.keys(keyStats).length}) · {Object.values(keyStats).reduce((a, s) => a + (s.requests || 0), 0)} requests · {Object.values(keyStats).reduce((a, s) => a + (s.questions || 0), 0)} updated{perRequest ? ` · ${perRequest} per request` : ""}
            </p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {Object.entries(keyStats).sort((a, b) => (b[1].requests || 0) - (a[1].requests || 0)).map(([label, s]) => (
                <div key={label} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-slate-700 dark:text-slate-200">{label}</span>
                  <span className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap">
                    <span className="text-slate-500 dark:text-slate-400">{s.requests || 0} req</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{s.questions || 0} done</span>
                    {s.limited > 0 && <span className="text-amber-600 dark:text-amber-400">{s.limited} limited</span>}
                    {s.error > 0 && <span className="text-rose-600 dark:text-rose-400">{s.error} err</span>}
                  </span>
                </div>
              ))}
            </div>
            {limitDetail && (
              <p className="mt-2 break-words text-[11px] text-amber-700 dark:text-amber-400">
                <b>Last rate-limit message from the AI provider:</b> {limitDetail}
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button type="button" onClick={onClose} disabled={busy} className="btn-outline">Close</button>
        </div>
      </div>
    </div>
  );
}
