import { useEffect, useRef, useState } from "react";
import { X, Sparkles, Wand2, CheckCircle2, AlertTriangle, Loader2, Server, KeyRound, ListChecks, Circle, Square, Bookmark, Trash2 } from "lucide-react";
import { aiService } from "../../services";
import { useAuth } from "../../context/AuthContext";
import GraphView from "../ui/GraphView";

const TYPE_OPTIONS = [
  { id: "mcq", label: "MCQ" },
  { id: "assertion", label: "Assertion & Reason" },
  { id: "statement", label: "Statement-based" },
  { id: "matching", label: "Matching" },
  { id: "pair", label: "Pair (count)" },
  { id: "pairselect", label: "Pair-select" },
  { id: "table", label: "Table-based" },
];

const LETTERS = ["A", "B", "C", "D"];
const DIFFS = ["Easy", "Medium", "Hard"];
// Max questions per generation. You can type any count in the grid up to this
// total (they're generated in chunks, so larger batches just take longer).
const MAX_TOTAL = 500;

// Reusable "Generate with AI" modal. Mirrors BulkUploadQuestions:
// `onUpload(questions)` should return a promise (e.g. { inserted }). The AI
// only PREVIEWS questions here — nothing is saved until the admin clicks Insert.
export default function AiGenerate({ open, onClose, onUpload, title = "Generate Questions with AI", sections = [], existingQuestions = [], defaultSection = "", allowNewTarget = false, newLeafLabel = "quiz", currentTargetName = "", defaultTopic = "", defaultSubtopics = "", defaultDest = "current", coverageQuestions = [] }) {
  const { user } = useAuth();
  // Clients granted BOTH sources may pick which one this generation uses.
  const isClient = user?.role === "client" && user?.aiAccess;
  const canChooseSource = isClient && user?.aiAllowInbuilt !== false && user?.aiAllowSelf !== false;
  const [source, setSource] = useState(user?.aiMode === "self" ? "self" : "inbuilt"); // "inbuilt" | "self"
  const [status, setStatus] = useState(null); // { enabled, model, models: [] }
  // Stems already generated/inserted this session — sent so a repeat batch never
  // duplicates earlier questions. Seeded from any existing questions passed in.
  const [avoidStems, setAvoidStems] = useState(() => (existingQuestions || []).map((q) => (typeof q === "string" ? q : q?.text)).filter(Boolean));
  const [model, setModel] = useState("");
  const [section, setSection] = useState(defaultSection || sections[0] || ""); // subject to tag generated questions
  const [topic, setTopic] = useState("");
  const [subtopics, setSubtopics] = useState(""); // optional — specific subtopics to cover in the topic
  const [url, setUrl] = useState(""); // optional source link (web page or YouTube)
  // matrix[typeId] = { Easy, Medium, Hard } counts. Default: 5 medium MCQs.
  const [matrix, setMatrix] = useState({ mcq: { Easy: 0, Medium: 5, Hard: 0 } });
  const [notes, setNotes] = useState("");
  const [preview, setPreview] = useState([]);
  const [busy, setBusy] = useState(false);
  const [stopping, setStopping] = useState(false); // user asked to stop the current generation
  const [autoContinue, setAutoContinue] = useState(false); // keep generating in waves until the full count is reached
  const jobIdRef = useRef(null); // id of the running background job (so Stop can cancel it)
  const stopRef = useRef(false); // set when the user clicks Stop — breaks/short-circuits the poll loop
  const [inserting, setInserting] = useState(false);
  const [msg, setMsg] = useState("");
  const [keyStats, setKeyStats] = useState(null); // live per-key activity this run { label: {requests,ok,limited,error,questions} }
  const [destChoice, setDestChoice] = useState("current"); // "current" | "new" (where the batch is inserted)
  const [newName, setNewName] = useState("");
  const [inferring, setInferring] = useState(false); // detecting the topic from a quiz's existing questions
  const [coverage, setCoverage] = useState(null); // { covered:[], missing:[] } — refreshed after each batch
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [syllabus, setSyllabus] = useState(null); // FIXED checklist for this session so coverage totals stay stable
  // A saved "to-do" list of subtopics for THIS quiz/test, kept in the browser so
  // you can jot down the areas still missing and come back later to generate them
  // one at a time. Persisted per target (falls back to the topic name).
  const [plan, setPlan] = useState([]); // [{ text, done, src }] aggregated from all saved plans
  const [selected, setSelected] = useState(() => new Set()); // ticked subtopics to add to "Subtopics to cover"
  const planKey = `mstg.subtopicPlan:${currentTargetName || defaultTopic || "global"}`;
  // Read EVERY saved subtopic — this quiz/test's own plan PLUS anything saved from
  // the "Missing areas" scans — so you can pick from all of them here. Deduped by
  // text; each item remembers which store it came from (src) for removal.
  const readAllSaved = () => {
    const out = []; const seen = new Set();
    const add = (text, done, src) => {
      const t = String(text || "").trim(); if (!t) return;
      const k = t.toLowerCase(); if (seen.has(k)) return; seen.add(k);
      out.push({ text: t, done: !!done, src });
    };
    try {
      const keys = [];
      for (let i = 0; i < localStorage.length; i++) { const kk = localStorage.key(i); if (kk && (kk.startsWith("mstg.subtopicPlan:") || kk.startsWith("mstg.missingAreas:"))) keys.push(kk); }
      keys.sort((a, b) => (a === planKey ? -1 : b === planKey ? 1 : 0)); // this target's own plan first
      for (const key of keys) {
        const rawV = localStorage.getItem(key); if (!rawV) continue;
        if (key.startsWith("mstg.subtopicPlan:")) {
          const arr = JSON.parse(rawV); if (Array.isArray(arr)) arr.forEach((p) => add(p?.text, p?.done, key));
        } else {
          const obj = JSON.parse(rawV); const prog = obj?.progress || {};
          (obj?.missing || []).forEach((m) => add(m, prog?.[m]?.status === "done", key));
        }
      }
    } catch { /* ignore malformed entries */ }
    return out;
  };

  useEffect(() => {
    if (!open) return;
    setMsg("");
    setPreview([]);
    setCoverage(null);
    setCoverageLoading(false);
    setSyllabus(null);
    setDestChoice(allowNewTarget && defaultDest === "new" ? "new" : "current");
    setNewName("");
    setSection(defaultSection || sections[0] || ""); // re-sync target subject on open
    // Pre-fill the topic/subtopics REMEMBERED on this quiz/test (saved on a
    // previous generation), so reopening it days later shows what it was built
    // from and lets you continue the same syllabus.
    setTopic(defaultTopic || "");
    setSubtopics(defaultSubtopics || "");
    // Seed the "already covered" list from the target's CURRENT questions so a
    // fresh batch continues from the uncovered subtopics instead of repeating
    // what was generated in an earlier session (true batch-to-batch continuation).
    setAvoidStems((existingQuestions || []).map((q) => (typeof q === "string" ? q : q?.text)).filter(Boolean));
    // If this quiz already has questions but NO remembered topic (it was built
    // before topics were saved), infer the topic from the questions so the field
    // isn't blank. Fills only if the user hasn't typed anything.
    const stems = (existingQuestions || []).slice(0, 40);
    if (!(defaultTopic || "").trim() && stems.length) {
      setInferring(true);
      aiService
        .inferTopic({ questions: stems, mode: isClient ? source : undefined })
        .then((r) => { if (r?.topic) setTopic((t) => (t.trim() ? t : r.topic)); })
        .catch(() => {})
        .finally(() => setInferring(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultSection, defaultTopic, defaultSubtopics]);

  // (Re)load status for the chosen source so the model list / active-key count
  // reflect that pool. Clients pass their source; admins always use built-in.
  useEffect(() => {
    if (!open) return;
    aiService
      .status(isClient ? source : undefined)
      .then((s) => {
        setStatus(s);
        setModel(s?.model || (s?.models && s.models[0]) || "");
      })
      .catch(() => setStatus({ enabled: false }));
  }, [open, source, isClient]);

  // Load ALL saved subtopics (this target's plan + every Missing-areas scan) on open.
  useEffect(() => {
    if (!open) return;
    setPlan(readAllSaved());
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  // Effective per-batch cap for THIS account — the admin's global limit or the
  // client's assigned plan (reported by /ai/status). Falls back to the default.
  const maxPerBatch = status?.maxPerBatch || MAX_TOTAL;

  // Update a single cell of the type × difficulty matrix (clamped 0–maxPerBatch).
  const setCell = (type, diff, val) => {
    const n = Math.max(0, Math.min(maxPerBatch, parseInt(val, 10) || 0));
    setMatrix((m) => ({ ...m, [type]: { ...(m[type] || {}), [diff]: n } }));
  };
  const rowTotal = (type) => DIFFS.reduce((s, d) => s + (matrix[type]?.[d] || 0), 0);
  // Flatten the matrix into [{ type, difficulty, count }] entries with count>0.
  const buildPlan = () =>
    TYPE_OPTIONS.flatMap((t) =>
      DIFFS.map((d) => ({ type: t.id, difficulty: d, count: matrix[t.id]?.[d] || 0 })).filter((e) => e.count > 0)
    );
  const total = TYPE_OPTIONS.reduce((s, t) => s + rowTotal(t.id), 0);

  // After a batch, summarise which syllabus subtopics are now covered vs still
  // missing — cumulative across the quiz's existing questions plus everything
  // generated in this session. Best-effort (one small AI call); silent on error.
  const refreshCoverage = async (stems) => {
    const t = topic.trim();
    // Merge the whole topic's existing questions (all its quizzes) with this
    // session's generated ones, so coverage reflects the ENTIRE topic, not just
    // the current quiz.
    const topicStems = (coverageQuestions || []).map((q) => (typeof q === "string" ? q : q?.text)).filter(Boolean);
    const list = Array.from(new Set([...topicStems, ...(stems || []).filter(Boolean)]));
    if (!t || !list.length) { setCoverage(null); return; }
    setCoverageLoading(true);
    try {
      // Pass the fixed checklist (once we have it) so later batches classify the
      // SAME list — covered grows and missing shrinks against a constant total.
      const r = await aiService.coverageGaps({ topic: t, questions: list.slice(0, 300), syllabus: syllabus || undefined, mode: isClient ? source : undefined });
      if (!syllabus && Array.isArray(r?.syllabus) && r.syllabus.length) setSyllabus(r.syllabus);
      setCoverage({ covered: r?.covered || [], missing: r?.missing || [] });
    } catch {
      /* coverage is a nice-to-have — ignore failures */
    } finally {
      setCoverageLoading(false);
    }
  };

  // `append` = "Generate more": keep the current preview and add a fresh batch
  // on the same topic, avoiding everything already generated. With Auto-continue
  // on, the main Generate runs in WAVES — after a wave is cut short (free-tier
  // quota / shortfall) it waits ~60s for the limit to reset and generates the
  // remainder, repeating until the full count is reached or you press Stop.
  const generate = async (append = false, overrideSubtopics = null) => {
    if (!topic.trim() && !url.trim()) { setMsg("Enter a topic/syllabus, or paste a source link (web page or YouTube video)."); return; }
    const plan = buildPlan();
    if (!plan.length) { setMsg("Set at least one question count in the grid below."); return; }
    if (total > maxPerBatch) { setMsg(`Please keep the total to ${maxPerBatch} questions or fewer per batch.`); return; }
    setBusy(true);
    setStopping(false);
    stopRef.current = false;
    jobIdRef.current = null;
    setKeyStats(null);
    if (!append) setPreview([]);

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    // Accumulate the avoid-list LOCALLY across waves — React state updates are
    // async, so relying on avoidStems would let the next wave repeat this wave's
    // questions. We still mirror it into state for later manual "Generate more".
    let avoidLocal = Array.from(new Set([...(avoidStems || [])]));

    // Run ONE wave (start job + poll to completion). Appends its questions to the
    // preview and returns how it ended so the loop can decide to auto-continue.
    const runWave = async (isAppend) => {
      let jobId, requested;
      try {
        ({ jobId, requested } = await aiService.generate({
          topic: topic.trim(),
          // A per-subtopic "Generate" button passes the single subtopic to focus
          // on; otherwise use whatever is typed in the Subtopics box.
          subtopics: (overrideSubtopics != null ? overrideSubtopics : subtopics).trim() || undefined,
          url: url.trim() || undefined,
          plan,
          notes: notes.trim(),
          model: model || undefined,
          avoid: avoidLocal, // don't repeat anything from earlier waves/batches
          mode: isClient ? source : undefined,
        }));
      } catch (e) { setMsg(e.message || "Generation failed."); return { produced: 0, errored: true }; }
      if (!jobId) { setMsg("Could not start generation."); return { produced: 0, errored: true }; }
      jobIdRef.current = jobId;
      let done = false, result = { produced: 0, timedOut: true };
      for (let i = 0; i < 300 && !done; i++) {
        await sleep(2000);
        let s;
        try { s = await aiService.job(jobId); } catch { continue; }
        if (s.keyStats && Object.keys(s.keyStats).length) setKeyStats(s.keyStats);
        if (s.status === "done") {
          const qs = s.questions || [];
          setPreview((prev) => (isAppend ? [...prev, ...qs] : qs));
          const batchStems = qs.map((q) => q.text).filter(Boolean);
          avoidLocal = Array.from(new Set([...avoidLocal, ...batchStems]));
          setAvoidStems(avoidLocal);
          refreshCoverage(avoidLocal);
          result = { produced: qs.length, requested, model: s.model, short: qs.length < requested, quota: s.error === "quota", cancelled: s.error === "cancelled" || stopRef.current };
          done = true;
        } else if (s.status === "error") {
          setMsg(s.error || "Generation failed."); result = { produced: 0, errored: true }; done = true;
        } else {
          setMsg(stopRef.current ? `Stopping… keeping the ${s.count || 0} generated so far` : `Generating… ${s.count || 0} of ${requested} ready`);
        }
      }
      if (!done) setMsg("Still generating — this is taking longer than expected. Please try a smaller batch.");
      return result;
    };

    // Final summary once the loop ends.
    const finalize = (res, producedTotal, target) => {
      if (res?.errored || res?.timedOut) return; // their own message already stands
      const model = res?.model ? ` with ${res.model}` : "";
      if (stopRef.current || res?.cancelled) { setMsg(`⏹ Stopped. Kept ${producedTotal} question(s) so far${model} — review & Insert below, or Generate more.`); return; }
      const short = producedTotal < target;
      if (append && !autoContinue) {
        setMsg(`✓ Added ${producedTotal} more question(s)${model}.` + (short ? " (Some couldn't be generated — click “Generate more” to top up.)" : " No duplicates of the earlier questions. Review & Insert."));
        return;
      }
      let tail;
      if (!short) tail = " Review below, then Insert.";
      else if (res?.quota) tail = autoContinue ? " The free-tier quota kept limiting it — Insert these, then Generate more later for the rest." : " Stopped early — Gemini free-tier quota was reached. Insert these, then generate the rest in a minute.";
      else tail = " (Some couldn't be generated — click “Generate more” to top up.)";
      setMsg(`✓ Generated ${producedTotal} of ${target} question(s)${model}.` + tail);
    };

    try {
      const target = total;
      const autoLoop = autoContinue && !append; // manual "Generate more" stays a single wave
      const MAX_WAVES = 12; // hard cap so it can never loop forever
      const MIN_YIELD = Math.max(3, Math.round(target * 0.03)); // a wave below this = "barely any progress"
      setMsg(append ? `Generating ${total} more from this topic (no duplicates)…` : `Starting generation of ${total} question(s)…`);
      let producedTotal = 0;
      let firstWave = true;
      let wave = 0;
      let lowYield = 0; // consecutive waves that produced almost nothing
      let last;
      while (true) {
        last = await runWave(firstWave ? append : true);
        producedTotal += last.produced || 0;
        firstWave = false;
        wave += 1;
        lowYield = (last.produced || 0) < MIN_YIELD ? lowYield + 1 : 0;
        const reached = producedTotal >= target;
        // The free quota is clearly tapped out if two waves in a row barely
        // produced, or we've hit the wave cap — stop instead of waiting forever.
        const stalled = lowYield >= 2 || wave >= MAX_WAVES;
        const canContinue = autoLoop && !stopRef.current && !reached && (last.produced || 0) > 0 && (last.short || last.quota) && !last.errored && !last.timedOut && !stalled;
        if (!canContinue) {
          if (autoLoop && stalled && !reached && !stopRef.current && !last.errored && !last.timedOut) {
            setMsg(`⏸ Auto-continue stopped at ${producedTotal} of ${target}. Your free-tier quota is limiting output right now — most keys are rate-limited or near their daily cap, so waiting longer won't help today. Insert these ${producedTotal}, then generate the rest later (the daily free quota resets), or add keys from other Google accounts for more quota.`);
          } else {
            finalize(last, producedTotal, target);
          }
          break;
        }
        // Interruptible wait for the per-minute limit to refill.
        for (let k = 60; k > 0 && !stopRef.current; k--) {
          setMsg(`Auto-continue: ${producedTotal} of ${target} so far. Waiting ${k}s for the free-tier limit to reset… (press Stop to keep what you have)`);
          await sleep(1000);
        }
        if (stopRef.current) { finalize(last, producedTotal, target); break; }
      }
    } catch (e) {
      setMsg(e.message || "Generation failed.");
    } finally {
      setBusy(false);
      setStopping(false);
      stopRef.current = false;
      jobIdRef.current = null;
    }
  };

  // ---- Saved subtopics (this target's plan + Missing-areas scans) ----------
  // Save subtopics (typed box or uncovered list) to THIS target's own plan.
  const addToPlan = (items) => {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem(planKey) || "[]"); if (!Array.isArray(arr)) arr = []; } catch { arr = []; }
    const seen = new Set(arr.map((p) => String(p?.text || "").trim().toLowerCase()));
    const adds = (items || []).map((t) => String(t).trim()).filter((t) => t && !seen.has(t.toLowerCase())).map((t) => ({ text: t, done: false }));
    if (adds.length) { try { localStorage.setItem(planKey, JSON.stringify([...arr, ...adds])); } catch { /* storage blocked/full */ } }
    setPlan(readAllSaved());
    setMsg(adds.length ? `Saved ${adds.length} subtopic(s) — tick the ones you want below and click "Add selected".` : "Those subtopics are already saved.");
  };
  // Remove a saved subtopic from its own store. (Only offered for this modal's own
  // plan items; Missing-areas items are managed in that modal to keep it in sync.)
  const removeFromPlan = (item) => {
    try {
      if (item.src?.startsWith("mstg.subtopicPlan:")) {
        const arr = JSON.parse(localStorage.getItem(item.src) || "[]");
        localStorage.setItem(item.src, JSON.stringify((Array.isArray(arr) ? arr : []).filter((p) => String(p?.text || "").trim().toLowerCase() !== item.text.toLowerCase())));
      }
    } catch { /* ignore */ }
    setSelected((s) => { const n = new Set(s); n.delete(item.text.toLowerCase()); return n; });
    setPlan(readAllSaved());
  };
  const toggleSelect = (text) => setSelected((s) => { const n = new Set(s); const k = text.toLowerCase(); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const allSelected = plan.length > 0 && plan.every((p) => selected.has(p.text.toLowerCase()));
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(plan.map((p) => p.text.toLowerCase())));
  // Put the ticked subtopics into the "Subtopics to cover" box (merged, deduped).
  const addSelectedToSubtopics = () => {
    const picks = plan.filter((p) => selected.has(p.text.toLowerCase())).map((p) => p.text);
    if (!picks.length) { setMsg("Tick the subtopics you want first, then click \"Use selected\"."); return; }
    // REPLACE the box with exactly the ticked subtopics — so generation focuses on
    // only these. (Appending kept whatever was already there, which is why picking
    // one still generated across all the subtopics still sitting in the box.)
    setSubtopics(picks.join(", "));
    setMsg(`"Subtopics to cover" now holds only your ${picks.length} selected subtopic(s) — Generate will focus on just these.`);
  };
  // Generate a batch focused on ONE saved subtopic (uses the type/difficulty grid).
  const generateSubtopic = (text) => { setSubtopics(text); generate(false, text); };

  // Stop the current generation. Tells the server to cancel the background job;
  // the poll loop then finalizes with whatever was produced so far, so the
  // partial batch still shows up for review/insert.
  const stop = async () => {
    stopRef.current = true;
    setStopping(true);
    setMsg("Stopping…");
    try {
      if (jobIdRef.current) await aiService.cancelJob(jobIdRef.current);
    } catch {
      /* best-effort — the poll loop still winds down on the next finalize */
    }
  };

  const insert = async () => {
    if (!preview.length) return;
    const makingNew = allowNewTarget && destChoice === "new";
    if (makingNew && !newName.trim()) { setMsg(`Enter a name for the new ${newLeafLabel}.`); return; }
    setInserting(true);
    setMsg("");
    try {
      const opts = { section, topic: topic.trim(), subtopics: subtopics.trim() };
      if (makingNew) opts.newTarget = { name: newName.trim() };
      const res = await onUpload(preview, opts);
      setMsg(`✓ Inserted ${res?.inserted ?? preview.length} question(s)${makingNew ? ` into new ${newLeafLabel} “${newName.trim()}”` : ""}. Generate the next batch, or click Close when you're done.`);
      setPreview([]);
      setNewName("");
      setDestChoice("current");
      // Stay on this screen (keep the topic + settings) so you can immediately
      // generate the next batch — no duplicates. The modal never closes by
      // itself after inserting; use the Close button when you're finished.
    } catch (e) {
      setMsg(e.message || "Insert failed.");
    } finally {
      setInserting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      <div className="my-8 w-full max-w-2xl animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Sparkles className="h-5 w-5 text-brand-600" /> {title}
          </h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {/* Per-generation API source (clients allowed both pools). Kept above the
            "not configured" notice so you can always switch to the other source. */}
        {canChooseSource && (
          <div className="mb-3">
            <label className="mb-1 block text-sm font-semibold">API source for this generation</label>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setSource("inbuilt")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${source === "inbuilt" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300" : "border-slate-200 text-slate-600 hover:border-brand-400 dark:border-slate-700 dark:text-slate-300"}`}>
                <Server className="h-4 w-4" /> Built-in APIs
              </button>
              <button type="button" onClick={() => setSource("self")}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${source === "self" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/20 dark:text-brand-300" : "border-slate-200 text-slate-600 hover:border-brand-400 dark:border-slate-700 dark:text-slate-300"}`}>
                <KeyRound className="h-4 w-4" /> My own APIs
              </button>
            </div>
          </div>
        )}

        {status && !status.enabled ? (
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> AI is not available</p>
            {isClient ? (
              <p className="mt-1">
                {source === "self"
                  ? "You haven't added any API keys yet. Add keys in the AI tab under \u201cMy own APIs\u201d"
                  : "Built-in AI isn't available right now"}
                {canChooseSource ? ", or switch source above." : ". Please contact the administrator."}
              </p>
            ) : (
              <p className="mt-1">
                Ask your admin to add <code>AI_API_KEY</code> (and optionally <code>AI_BASE_URL</code>,
                <code> AI_MODEL</code>) to the server environment, then redeploy. The key stays on the
                server and is never exposed to the browser.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              Describe a topic and the AI drafts questions in your app's format. Nothing is saved
              until you review and click <b>Insert</b>.
              {typeof status?.keys === "number" && (
                <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  {status.keys} API key{status.keys === 1 ? "" : "s"} active.
                </span>
              )}
              {status?.planName && (
                <span className="ml-1 font-semibold text-brand-600 dark:text-brand-300">
                  Plan: {status.planName} · up to {maxPerBatch}/batch{status?.remaining != null ? ` · ${status.remaining} left this window` : ""}.
                </span>
              )}
            </div>

            {status?.models && status.models.length > 1 && (
              <div className="mb-3">
                <label className="mb-1 block text-sm font-semibold">AI model</label>
                <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
                  {status.models.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            )}

            {sections.length > 0 && (
              <div className="mb-3">
                <label className="mb-1 block text-sm font-semibold">Add to subject</label>
                <select className="input" value={section} onChange={(e) => setSection(e.target.value)}>
                  <option value="">— No subject —</option>
                  {sections.map((s, i) => <option key={i} value={s}>{s}</option>)}
                </select>
              </div>
            )}

            {avoidStems.length > 0 && preview.length === 0 && (
              <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-900/20 dark:text-emerald-300">
                This {newLeafLabel} already has <b>{avoidStems.length}</b> question(s). Keep the same topic and click <b>Generate</b> — the next batch <b>continues from the uncovered subtopics</b> and won't repeat what's already here.
              </div>
            )}

            <label className="mb-1 block text-sm font-semibold">
              Topic / syllabus
              {inferring && <span className="ml-2 text-xs font-normal text-slate-400">detecting from existing questions…</span>}
            </label>
            <textarea
              rows={2}
              className="input resize-y"
              placeholder={`e.g. "Newton's Laws of Motion for Class 11 Physics" or "Indian Constitution — Fundamental Rights"`}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
            />

            <label className="mb-1 mt-3 block text-sm font-semibold">
              Subtopics to cover <span className="font-normal text-slate-400">(optional — one per line or comma-separated)</span>
            </label>
            <textarea
              rows={2}
              className="input resize-y"
              placeholder={`e.g. Monsoon mechanism, El Niño & La Niña, Western disturbances, Jet streams, Cyclones, Rainfall distribution, Climatic regions`}
              value={subtopics}
              onChange={(e) => setSubtopics(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">
              List the exact subtopics you want questions spread across. Leave empty and the AI works out the subtopics itself to cover the whole syllabus.
            </p>
            {subtopics.trim() && (
              <button type="button" onClick={() => addToPlan(subtopics.split(/[\n,]+/))} className="btn-outline mt-2 text-xs">
                <Bookmark className="h-3.5 w-3.5" /> Save these subtopics to my plan
              </button>
            )}

            {/* Saved subtopics — from THIS quiz/test's plan AND every "Missing areas"
                scan you saved. Tick the ones you want and add them to "Subtopics to
                cover", or generate any single one on its own. */}
            {plan.length > 0 && (
              <div className="mt-3 rounded-xl border border-brand-200 bg-brand-50/50 p-3 dark:border-brand-900/40 dark:bg-brand-900/10">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Bookmark className="h-4 w-4 text-brand-600" /> Saved subtopics
                    <span className="rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{plan.length}</span>
                  </p>
                  <div className="flex items-center gap-3 text-xs">
                    <button type="button" onClick={toggleSelectAll} className="font-semibold text-brand-600 hover:underline dark:text-brand-300">{allSelected ? "Clear all" : "Select all"}</button>
                    <button type="button" onClick={addSelectedToSubtopics} className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2 py-1 font-semibold text-white transition hover:bg-brand-700"><ListChecks className="h-3.5 w-3.5" /> Use selected ({selected.size})</button>
                  </div>
                </div>
                <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">Tick the subtopics you need and click <b>Use selected</b> — this sets "Subtopics to cover" to <b>only</b> those, so Generate focuses on just them (it replaces whatever is in the box). Or hit <b>Generate</b> on a single row to do that one now. Saved on this device.</p>
                <ul className="max-h-56 space-y-1 overflow-y-auto">
                  {plan.map((p, i) => {
                    const sel = selected.has(p.text.toLowerCase());
                    return (
                      <li key={i} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 text-xs dark:bg-slate-900/50">
                        <input type="checkbox" checked={sel} onChange={() => toggleSelect(p.text)} className="h-4 w-4 flex-shrink-0 accent-brand-600" />
                        <span className={`flex-1 ${p.done ? "text-slate-400 line-through" : "text-slate-700 dark:text-slate-200"}`}>{p.text}{p.done && <span className="ml-1 text-emerald-500">✓</span>}</span>
                        <button type="button" onClick={() => generateSubtopic(p.text)} disabled={busy} className="inline-flex flex-shrink-0 items-center gap-1 rounded-md bg-brand-600 px-2 py-1 font-semibold text-white transition hover:bg-brand-700 disabled:opacity-50">
                          <Wand2 className="h-3 w-3" /> Generate
                        </button>
                        {p.src && p.src.startsWith("mstg.subtopicPlan:") && (
                          <button type="button" onClick={() => removeFromPlan(p)} title="Remove from plan" className="flex-shrink-0 text-slate-400 hover:text-rose-600"><Trash2 className="h-3.5 w-3.5" /></button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <label className="mb-1 mt-3 block text-sm font-semibold">
              Source link <span className="font-normal text-slate-400">(optional — web page or YouTube video)</span>
            </label>
            <input
              type="url"
              className="input"
              placeholder="https://…  (article URL, or a YouTube link — its transcript is read automatically)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">
              Paste a web page or a <b>YouTube video</b> link and the AI bases the questions on its content/transcript
              (the video must have captions). Leave empty to generate purely from the topic above.
            </p>

            {/* How many of each type × difficulty. Total = sum of all cells. */}
            <div className="mt-3 flex items-center justify-between">
              <label className="block text-sm font-semibold">Questions by type &amp; difficulty</label>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${total > maxPerBatch ? "bg-rose-100 text-rose-600 dark:bg-rose-900/30" : "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"}`}>
                Total: {total}
              </span>
            </div>
            <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[380px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                    <th className="px-3 py-2 text-left font-semibold">Type</th>
                    {DIFFS.map((d) => (
                      <th key={d} className="px-2 py-2 text-center font-semibold">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TYPE_OPTIONS.map((t) => (
                    <tr key={t.id} className={`border-b border-slate-100 last:border-0 dark:border-slate-800 ${rowTotal(t.id) > 0 ? "bg-brand-50/40 dark:bg-brand-900/10" : ""}`}>
                      <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200">{t.label}</td>
                      {DIFFS.map((d) => (
                        <td key={d} className="px-2 py-1.5 text-center">
                          <input
                            type="number"
                            min={0}
                            max={maxPerBatch}
                            value={matrix[t.id]?.[d] || 0}
                            onChange={(e) => setCell(t.id, d, e.target.value)}
                            className="w-14 rounded-lg border border-slate-200 bg-white px-2 py-1 text-center text-sm dark:border-slate-700 dark:bg-slate-900"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Total summary below the grid */}
            <div className={`mt-2 flex items-center justify-between rounded-xl border px-4 py-2.5 ${total > maxPerBatch ? "border-rose-300 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-900/20" : "border-brand-200 bg-brand-50 dark:border-brand-900/40 dark:bg-brand-900/20"}`}>
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Total questions</span>
              <span className={`text-lg font-extrabold tabular-nums ${total > maxPerBatch ? "text-rose-600 dark:text-rose-400" : "text-brand-600 dark:text-brand-300"}`}>
                {total} <span className="text-xs font-medium text-slate-400">/ {maxPerBatch}</span>
              </span>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Set a count in any cell — e.g. 3 Easy MCQs + 2 Medium Matching. Leave cells at 0 to skip.
              Up to {maxPerBatch} per batch (generated in the background in smaller groups). After a batch, use <b>Generate more</b> to add another set with no repeats.
            </p>

            <label className="mb-1 mt-3 block text-sm font-semibold">Instructions (optional — followed strictly)</label>
            <textarea
              rows={2}
              className="input resize-y"
              placeholder='e.g. "Questions in Hindi", "Focus on numerical problems", "Only NCERT Class 10 syllabus", "Keep language simple"'
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">
              Leave empty to use defaults. Anything you write here is treated as a top-priority instruction the AI must follow for every question.
            </p>

            <label className="mt-4 flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={autoContinue} onChange={(e) => setAutoContinue(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0 accent-brand-600" />
              <span><b>Auto-continue</b> until the full count is generated. When the free-tier limit stops a wave, it waits ~60s and keeps going (no duplicates) until it reaches {total || "the"} question(s) — press <b>Stop</b> to end early. Best for big batches.</span>
            </label>

            <button
              type="button"
              onClick={() => generate(false)}
              disabled={busy}
              className="btn-primary mt-2 w-full"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Wand2 className="h-4 w-4" /> Generate</>}
            </button>

            {busy && (
              <button
                type="button"
                onClick={stop}
                disabled={stopping}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-900/50 dark:text-rose-400 dark:hover:bg-rose-900/20"
                title="Stop generating — keeps the questions already produced so you can insert them"
              >
                {stopping ? <><Loader2 className="h-4 w-4 animate-spin" /> Stopping…</> : <><Square className="h-4 w-4" /> Stop generating</>}
              </button>
            )}

            {preview.length > 0 && (
              <button
                type="button"
                onClick={() => generate(true)}
                disabled={busy}
                className="btn-outline mt-2 w-full"
                title="Generate another batch on the same topic — the AI avoids every question already generated above"
              >
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating more…</> : <><Sparkles className="h-4 w-4" /> Generate more from this topic (no duplicates)</>}
              </button>
            )}

            {preview.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" /> {preview.length} question(s) ready to insert
                </p>
                <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-2 dark:border-slate-700">
                  {preview.map((q, i) => (
                    <div key={i} className="rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800/60">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-brand-100 px-1.5 py-0.5 font-semibold uppercase text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{q.type}</span>
                        <span className="text-slate-400">{q.difficulty}</span>
                        <span className="ml-auto font-semibold text-emerald-600 dark:text-emerald-400">Ans: {LETTERS[q.correct] || "?"}</span>
                      </div>
                      <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{i + 1}. {q.text}</p>
                      <GraphView q={q} />
                      <ul className="mt-1 grid grid-cols-2 gap-x-3 text-slate-500 dark:text-slate-400">
                        {(q.options || []).map((o, j) => (
                          <li key={j} className={j === q.correct ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}>
                            {LETTERS[j]}. {o}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Covered vs still-uncovered subtopics, refreshed after each batch. */}
            {(coverage || coverageLoading) && (
              <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <ListChecks className="h-4 w-4 text-brand-600" /> Syllabus coverage so far
                  {coverageLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                </p>
                {coverage && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Covered ({coverage.covered.length})</p>
                        {coverage.covered.length ? (
                          <ul className="max-h-44 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-300">
                            {coverage.covered.map((c, i) => (
                              <li key={i} className="flex gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />{c}</li>
                            ))}
                          </ul>
                        ) : <p className="text-xs text-slate-400">—</p>}
                      </div>
                      <div>
                        <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">Not yet covered ({coverage.missing.length})</p>
                        {coverage.missing.length ? (
                          <ul className="max-h-44 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-300">
                            {coverage.missing.map((c, i) => (
                              <li key={i} className="flex gap-1.5"><Circle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />{c}</li>
                            ))}
                          </ul>
                        ) : <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">All covered 🎉</p>}
                      </div>
                    </div>
                    {coverage.missing.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" onClick={() => setSubtopics(coverage.missing.join(", "))} className="btn-outline text-xs">
                          <Sparkles className="h-3.5 w-3.5" /> Put uncovered ones in Subtopics → generate them next
                        </button>
                        <button type="button" onClick={() => addToPlan(coverage.missing)} className="btn-outline text-xs">
                          <Bookmark className="h-3.5 w-3.5" /> Save uncovered to my plan
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Where to save this batch: the current quiz/test, or a brand-new one. */}
            {allowNewTarget && preview.length > 0 && (
              <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="mb-2 text-sm font-semibold">Where should these {preview.length} question(s) go?</p>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="aidest" checked={destChoice === "current"} onChange={() => setDestChoice("current")} />
                  <span>Current {newLeafLabel}{currentTargetName ? <> — <b>{currentTargetName}</b></> : <span className="text-slate-400"> (the one selected)</span>}</span>
                </label>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="aidest" checked={destChoice === "new"} onChange={() => setDestChoice("new")} />
                  <span className="flex-shrink-0">New {newLeafLabel}:</span>
                  <input
                    type="text"
                    value={newName}
                    onFocus={() => setDestChoice("new")}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder={`New ${newLeafLabel} name`}
                    className="input !py-1"
                  />
                </label>
                <p className="mt-1 text-xs text-slate-400">
                  Choose <b>New {newLeafLabel}</b> to auto-create it (under the same parent) and put this batch there — then click <b>Generate</b> again for the next batch.
                </p>
              </div>
            )}
          </>
        )}

        {msg && <p className="mt-3 text-sm font-medium">{msg}</p>}

        {/* Live per-key activity for this run — see every key working in real time. */}
        {keyStats && Object.keys(keyStats).length > 0 && (
          <div className="mt-3 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
              Keys working this run ({Object.keys(keyStats).length}) · {Object.values(keyStats).reduce((a, s) => a + (s.requests || 0), 0)} requests · {Object.values(keyStats).reduce((a, s) => a + (s.questions || 0), 0)} questions
            </p>
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {Object.entries(keyStats).sort((a, b) => (b[1].requests || 0) - (a[1].requests || 0)).map(([label, s]) => (
                <div key={label} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium text-slate-700 dark:text-slate-200">{label}</span>
                  <span className="flex flex-shrink-0 items-center gap-2 whitespace-nowrap">
                    <span className="text-slate-500 dark:text-slate-400">{s.requests || 0} req</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{s.questions || 0} Q</span>
                    {s.limited > 0 && <span className="text-amber-600 dark:text-amber-400">{s.limited} limited</span>}
                    {s.error > 0 && <span className="text-rose-600 dark:text-rose-400">{s.error} err</span>}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Close</button>
          {status?.enabled && preview.length > 0 && (
            <button type="button" onClick={insert} disabled={inserting} className="btn-primary">
              {inserting ? <><Loader2 className="h-4 w-4 animate-spin" /> Inserting…</> : `Insert ${preview.length} Question(s)`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
