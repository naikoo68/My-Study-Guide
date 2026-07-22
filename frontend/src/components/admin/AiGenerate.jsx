import { useEffect, useState } from "react";
import { X, Sparkles, Wand2, CheckCircle2, AlertTriangle, Loader2, Server, KeyRound, ListChecks, Circle } from "lucide-react";
import { aiService } from "../../services";
import { useAuth } from "../../context/AuthContext";

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
export default function AiGenerate({ open, onClose, onUpload, title = "Generate Questions with AI", sections = [], existingQuestions = [], defaultSection = "", allowNewTarget = false, newLeafLabel = "quiz", currentTargetName = "", defaultTopic = "", defaultSubtopics = "", defaultDest = "current" }) {
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
  const [inserting, setInserting] = useState(false);
  const [msg, setMsg] = useState("");
  const [destChoice, setDestChoice] = useState("current"); // "current" | "new" (where the batch is inserted)
  const [newName, setNewName] = useState("");
  const [inferring, setInferring] = useState(false); // detecting the topic from a quiz's existing questions
  const [coverage, setCoverage] = useState(null); // { covered:[], missing:[] } — refreshed after each batch
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [syllabus, setSyllabus] = useState(null); // FIXED checklist for this session so coverage totals stay stable

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
    const list = (stems || []).filter(Boolean);
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
  // on the same topic, avoiding everything already generated (via avoidStems).
  const generate = async (append = false) => {
    if (!topic.trim() && !url.trim()) { setMsg("Enter a topic/syllabus, or paste a source link (web page or YouTube video)."); return; }
    const plan = buildPlan();
    if (!plan.length) { setMsg("Set at least one question count in the grid below."); return; }
    if (total > maxPerBatch) { setMsg(`Please keep the total to ${maxPerBatch} questions or fewer per batch.`); return; }
    setBusy(true);
    if (!append) setPreview([]);
    setMsg(append ? `Generating ${total} more from this topic (no duplicates)…` : `Starting generation of ${total} question(s)…`);
    try {
      const { jobId, requested } = await aiService.generate({
        topic: topic.trim(),
        subtopics: subtopics.trim() || undefined, // optional — specific subtopics to spread questions across
        url: url.trim() || undefined, // optional web page / YouTube link → its text/transcript
        plan,
        notes: notes.trim(),
        model: model || undefined,
        avoid: avoidStems, // don't repeat anything from earlier batches
        mode: isClient ? source : undefined, // which key pool to use for this run
      });
      if (!jobId) throw new Error("Could not start generation.");

      // Poll the background job for progress until it finishes.
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let done = false;
      for (let i = 0; i < 300 && !done; i++) {
        await sleep(2000);
        let s;
        try {
          s = await aiService.job(jobId);
        } catch {
          continue; // transient poll hiccup — keep waiting
        }
        if (s.status === "done") {
          const qs = s.questions || [];
          // Append when "Generate more", otherwise replace the preview.
          setPreview((prev) => (append ? [...prev, ...qs] : qs));
          // Remember these stems so the NEXT batch avoids repeating them.
          const batchStems = qs.map((q) => q.text).filter(Boolean);
          setAvoidStems((prev) => Array.from(new Set([...prev, ...batchStems])));
          // Refresh the covered/uncovered summary using everything so far.
          refreshCoverage(Array.from(new Set([...avoidStems, ...batchStems])));
          const short = qs.length < requested;
          const quota = s.error === "quota";
          setMsg(
            (append
              ? `✓ Added ${qs.length} more question(s)${s.model ? ` with ${s.model}` : ""}.`
              : `✓ Generated ${qs.length} of ${requested} question(s)${s.model ? ` with ${s.model}` : ""}.`) +
              (short && quota
                ? " Stopped early — Gemini free-tier quota was reached. Insert these, then generate the rest in a minute."
                : short
                ? " (Some couldn't be generated — click “Generate more” to top up.)"
                : append
                ? " No duplicates of the earlier questions. Review & Insert."
                : " Review below, then Insert.")
          );
          done = true;
        } else if (s.status === "error") {
          setMsg(s.error || "Generation failed.");
          done = true;
        } else {
          setMsg(`Generating… ${s.count || 0} of ${requested} ready`);
        }
      }
      if (!done) setMsg("Still generating — this is taking longer than expected. Please try a smaller batch.");
    } catch (e) {
      setMsg(e.message || "Generation failed.");
    } finally {
      setBusy(false);
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

            <button
              type="button"
              onClick={() => generate(false)}
              disabled={busy}
              className="btn-primary mt-4 w-full"
            >
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Wand2 className="h-4 w-4" /> Generate</>}
            </button>

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
                      <button type="button" onClick={() => setSubtopics(coverage.missing.join(", "))} className="btn-outline mt-3 text-xs">
                        <Sparkles className="h-3.5 w-3.5" /> Put uncovered ones in Subtopics → generate them next
                      </button>
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
