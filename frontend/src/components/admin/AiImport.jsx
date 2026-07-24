import { useEffect, useState } from "react";
import { X, Globe, Download, CheckCircle2, AlertTriangle, Loader2, Server, KeyRound, FileText, Upload, Files, ScanText, Maximize2, Minimize2, Plus, Sparkles, ListChecks, Circle } from "lucide-react";
import { aiService, documentService } from "../../services";
import { useAuth } from "../../context/AuthContext";

const LETTERS = ["A", "B", "C", "D"];
const BATCH = 50; // group the extracted questions into batches of this size for insertion
// Max questions per "Generate from source" run (generated in chunks; large
// batches just take longer). Matches the AI Generator.
const MAX_TOTAL = 500;

// Question types the "Generate from source" mode can produce.
const Q_TYPES = [
  { id: "mcq", label: "MCQ" },
  { id: "matching", label: "Matching" },
  { id: "statement", label: "Statements" },
  { id: "pair", label: "Pairs" },
  { id: "pairselect", label: "Pair select" },
  { id: "assertion", label: "Assertion & Reason" },
  { id: "table", label: "Table" },
];
const DIFFS = ["Easy", "Medium", "Hard"];

// Import questions from a saved document, a PDF (text or OCR), a web page, or
// pasted text. The AI extracts the questions present (it doesn't invent them);
// review, then insert — all at once or batch by batch.
export default function AiImport({ open, onClose, onUpload, title = "Import Questions (PDF, Web or Text)", sections = [], documents = false, defaultSection = "", allowNewTarget = false, newLeafLabel = "quiz", currentTargetName = "" }) {
  const { user } = useAuth();
  const isClient = user?.role === "client" && user?.aiAccess;
  const canChooseSource = isClient && user?.aiAllowInbuilt !== false && user?.aiAllowSelf !== false;
  const [source, setSource] = useState(user?.aiMode === "self" ? "self" : "inbuilt"); // "inbuilt" | "self"
  const [task, setTask] = useState("extract"); // "extract" (pull existing) | "generate" (make new from source)
  // generate: type × difficulty count matrix (same as the AI Generator).
  // matrix[typeId] = { Easy, Medium, Hard }. Default: 5 medium MCQs.
  const [matrix, setMatrix] = useState({ mcq: { Easy: 0, Medium: 5, Hard: 0 } });
  const [notes, setNotes] = useState(""); // optional strong instructions (both tabs)
  // Stems already generated this session — sent so a "Generate more" batch never
  // repeats earlier questions (Generate-new mode, mirrors the AI Generator).
  const [avoidStems, setAvoidStems] = useState([]);
  // Optional topic/syllabus name for the "Generate from source" tab — enables
  // the covered / not-covered analysis (areas covered) after each batch.
  const [genTopic, setGenTopic] = useState("");
  const [coverage, setCoverage] = useState(null); // { covered:[], missing:[] }
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [syllabus, setSyllabus] = useState(null); // FIXED checklist so totals stay stable across batches
  const [destChoice, setDestChoice] = useState("current"); // "current" | "new" — where a batch is inserted
  const [newName, setNewName] = useState("");
  const [status, setStatus] = useState(null);
  const [model, setModel] = useState("");
  const [section, setSection] = useState(defaultSection || sections[0] || "");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [textFull, setTextFull] = useState(false); // full-screen editor for the source text
  const [preview, setPreview] = useState([]);
  const [detected, setDetected] = useState(0); // how many questions the source appears to contain
  const [busy, setBusy] = useState(false);
  const [busyMore, setBusyMore] = useState(false); // "Extract remaining" pass in progress
  const [inserting, setInserting] = useState(false);
  const [insertingIdx, setInsertingIdx] = useState(-1);
  const [msg, setMsg] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null);
  const [pdfFile, setPdfFile] = useState(null);
  const [scanned, setScanned] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [docList, setDocList] = useState([]);
  const [docId, setDocId] = useState("");

  useEffect(() => {
    if (!open) return;
    setMsg("");
    setPreview([]);
    setDetected(0);
    setBusyMore(false);
    setDocId("");
    setPdfFile(null);
    setScanned(false);
    setAvoidStems([]);
    setGenTopic("");
    setCoverage(null);
    setCoverageLoading(false);
    setSyllabus(null);
    setDestChoice("current");
    setNewName("");
    setSection(defaultSection || sections[0] || ""); // re-sync target subject on open
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultSection]);

  useEffect(() => {
    if (!open || !documents) return;
    documentService.list().then(setDocList).catch(() => setDocList([]));
  }, [open, documents]);

  useEffect(() => {
    if (!open) return;
    aiService
      .status(isClient ? source : undefined)
      .then((s) => { setStatus(s); setModel(s?.model || (s?.models && s.models[0]) || ""); })
      .catch(() => setStatus({ enabled: false }));
  }, [open, source, isClient]);

  if (!open) return null;

  // Read an uploaded file. PDFs use pdf.js (with an OCR fallback for scans);
  // Word/PowerPoint/Excel/CSV/text use lib/docs. The extracted text is appended
  // to the source box so you can then Extract or Generate from it.
  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const name = file.name.toLowerCase();
    const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
    const nextLabel = task === "generate" ? "Generate Questions" : "Extract Questions";
    setPdfBusy(true);
    setPdfProgress(null);
    setScanned(false);
    setMsg(`Reading “${file.name}”…`);
    try {
      if (isPdf) {
        setPdfFile(file); // enables the OCR button for scanned PDFs
        const { extractPdfText, looksScanned } = await import("../../lib/pdf");
        let total = 0;
        const extracted = await extractPdfText(file, (page, t) => { total = t; setPdfProgress({ page, total: t }); });
        if (!extracted || looksScanned(extracted)) {
          setScanned(true);
          setMsg(`“${file.name}” looks like a SCANNED PDF — the pages are images, so only ${extracted ? "a header/stamp" : "no text"} could be read. Use “Read scanned PDF with OCR” below.`);
          return;
        }
        const combined = text.trim() ? `${text.trim()}\n\n${extracted}` : extracted;
        setText(combined);
        setMsg(`✓ Read ${total || "?"} page(s) from “${file.name}” — now click “${nextLabel}”.`);
      } else {
        setPdfFile(null); // OCR only applies to PDFs
        const { extractDocText } = await import("../../lib/docs");
        const extracted = (await extractDocText(file)).trim();
        if (!extracted) {
          setMsg(`Couldn't read any text from “${file.name}”. If it's a scanned/image file, save it as PDF and use OCR.`);
          return;
        }
        const combined = text.trim() ? `${text.trim()}\n\n${extracted}` : extracted;
        setText(combined);
        setMsg(`✓ Read “${file.name}” (${extracted.length.toLocaleString()} characters) — now click “${nextLabel}”.`);
      }
    } catch (err) {
      setMsg(`Couldn't read “${file.name}”: ${err.message}`);
    } finally {
      setPdfBusy(false);
    }
  };

  const runOcr = async () => {
    if (!pdfFile) return;
    setOcrBusy(true);
    setOcrProgress(null);
    setMsg(`Running OCR on “${pdfFile.name}”… this can take a while (downloads the OCR engine on first use).`);
    try {
      const { ocrPdfText } = await import("../../lib/pdf");
      let total = 0;
      const ocrText = await ocrPdfText(pdfFile, (page, t) => { total = t; setOcrProgress({ page, total: t }); });
      if (!ocrText) { setMsg("OCR couldn't read any text from this PDF."); return; }
      setText(ocrText);
      setScanned(false);
      setMsg(`✓ OCR read ${total} page(s) — review the text, then click “Extract Questions”. OCR isn't perfect.`);
    } catch (e) {
      setMsg(`OCR failed: ${e.message}`);
    } finally {
      setOcrBusy(false);
    }
  };

  const pickDoc = async (id) => {
    setDocId(id);
    if (!id) return;
    setMsg("Loading document…");
    try {
      const doc = await documentService.get(id);
      // Documents saved from the Word editor are HTML — strip tags to plain text
      // (block tags → line breaks, list items → bullets) before extracting.
      const raw = String(doc?.content || "");
      let body = raw;
      if (/<\/?[a-z][\s\S]*>/i.test(raw)) {
        const prepped = raw
          .replace(/<\s*br\s*\/?>/gi, "\n")
          .replace(/<li[^>]*>/gi, "\u2022 ")
          .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|pre)>/gi, "\n");
        const el = document.createElement("div");
        el.innerHTML = prepped;
        body = (el.textContent || "").replace(/\n{3,}/g, "\n\n").trim();
      } else {
        body = raw.trim();
      }
      if (!body) { setMsg("That document has no text to use."); return; }
      const combined = text.trim() ? `${text.trim()}\n\n${body}` : body;
      setText(combined);
      setMsg(`✓ Loaded “${doc.title}” — now click “Extract Questions”.`);
    } catch (e) {
      setMsg(e.message || "Couldn't load that document.");
    }
  };

  // De-dup key for merging a second pass — prefer the source question number
  // (stable across re-runs), else a normalised stem. Mirrors the backend.
  const dedupKey = (q) =>
    q?.n != null
      ? `n:${q.n}`
      : String(q?.text || "").toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 200);

  // Run extraction. `append` = a "get the missed ones" pass: we send the
  // questions we already have so the AI skips them and returns ONLY the missing
  // ones, which are then merged into the preview (no duplicates).
  const runExtract = async (append = false) => {
    if (!url.trim() && !text.trim()) {
      setMsg("Add a PDF / document / URL, or paste the questions text.");
      return;
    }
    if (append) setBusyMore(true);
    else { setBusy(true); setPreview([]); setDetected(0); }
    setMsg(append ? "Looking for the questions that were missed…" : "Reading the source and extracting questions…");
    try {
      const { jobId, questionsDetected } = await aiService.extract({
        url: url.trim() || undefined,
        content: text.trim() || undefined,
        model: model || undefined,
        mode: isClient ? source : undefined,
        have: append ? preview : undefined,
        notes: notes.trim() || undefined,
      });
      if (!jobId) throw new Error("Could not start the import.");
      if (questionsDetected) setDetected(questionsDetected);
      if (questionsDetected && !append) setMsg(`Found ~${questionsDetected} question(s) — extracting…`);

      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let done = false;
      for (let i = 0; i < 240 && !done; i++) {
        await sleep(2000);
        let s;
        try { s = await aiService.job(jobId); } catch { continue; }
        if (s.status === "done") {
          const qs = s.questions || [];
          if (append) {
            // Merge the newly-found (previously missed) questions, skipping dupes.
            const have = new Set(preview.map(dedupKey));
            const added = qs.filter((q) => !have.has(dedupKey(q)));
            const merged = [...preview, ...added];
            setPreview(merged);
            setMsg(
              added.length
                ? `✓ Found ${added.length} more question(s) — now ${merged.length}${questionsDetected ? ` of ~${questionsDetected}` : ""}. Review, then insert.`
                : "No additional questions found — the rest may not be in the source (try OCR or paste the missing part)."
            );
          } else {
            setPreview(qs);
            setMsg(
              qs.length
                ? `✓ Extracted ${qs.length}${questionsDetected ? ` of ~${questionsDetected} detected` : ""} question(s)${s.error === "quota" ? " (stopped early — quota reached; insert these, then run again)" : ""}. Review below, then insert.`
                : "No questions found — try pasting the text, or use OCR for scanned PDFs."
            );
          }
          done = true;
        } else if (s.status === "error") {
          setMsg(s.error || "Import failed.");
          done = true;
        } else {
          setMsg(`Extracting… ${s.count || 0} question(s) so far (section ${s.chunksDone || 0}/${s.chunksTotal || "?"})`);
        }
      }
      if (!done) setMsg("Still working — the source is large. Try importing fewer questions at a time.");
    } catch (e) {
      setMsg(e.message || "Import failed.");
    } finally {
      if (append) setBusyMore(false);
      else setBusy(false);
    }
  };

  // Effective per-batch cap for THIS account (admin global limit or client plan).
  const maxPerBatch = status?.maxPerBatch || MAX_TOTAL;

  // ---- Generate: type × difficulty matrix (mirrors the AI Generator) ----
  const setCell = (type, diff, val) => {
    const n = Math.max(0, Math.min(maxPerBatch, parseInt(val, 10) || 0));
    setMatrix((m) => ({ ...m, [type]: { ...(m[type] || {}), [diff]: n } }));
  };
  const rowTotal = (type) => DIFFS.reduce((s, d) => s + (matrix[type]?.[d] || 0), 0);
  // Flatten the matrix into [{ type, difficulty, count }] entries with count>0.
  const buildPlan = () =>
    Q_TYPES.flatMap((t) =>
      DIFFS.map((d) => ({ type: t.id, difficulty: d, count: matrix[t.id]?.[d] || 0 })).filter((e) => e.count > 0)
    );
  const genTotal = Q_TYPES.reduce((s, t) => s + rowTotal(t.id), 0);

  // After a batch, summarise which areas of the topic are now covered vs still
  // missing. Only runs when a Topic/syllabus name is provided (coverage needs a
  // topic to build its checklist). Best-effort — silent on error.
  const refreshCoverage = async (stems) => {
    const t = genTopic.trim();
    const list = (stems || []).filter(Boolean);
    if (!t || !list.length) { setCoverage(null); return; }
    setCoverageLoading(true);
    try {
      const r = await aiService.coverageGaps({ topic: t, questions: list.slice(0, 300), syllabus: syllabus || undefined, mode: isClient ? source : undefined });
      if (!syllabus && Array.isArray(r?.syllabus) && r.syllabus.length) setSyllabus(r.syllabus);
      setCoverage({ covered: r?.covered || [], missing: r?.missing || [] });
    } catch {
      /* coverage is a nice-to-have — ignore failures */
    } finally {
      setCoverageLoading(false);
    }
  };

  // GENERATE mode: make NEW questions FROM the link/paragraph, using the exact
  // per-type × per-difficulty counts. Uses the same background job + polling.
  // `append` = "Generate more": keep the current preview and add a fresh batch
  // from the same source, avoiding everything already generated (via avoidStems).
  const runGenerate = async (append = false) => {
    if (!url.trim() && !text.trim()) {
      setMsg("Add a link or paste a paragraph to generate questions from.");
      return;
    }
    const plan = buildPlan();
    if (!plan.length) { setMsg("Set at least one question count in the grid below."); return; }
    if (genTotal > maxPerBatch) { setMsg(`Please keep the total to ${maxPerBatch} questions or fewer per run.`); return; }
    setBusy(true);
    if (!append) { setPreview([]); setDetected(0); }
    setMsg(append ? `Generating ${genTotal} more from your source (no duplicates)…` : `Generating ${genTotal} question(s) from your source…`);
    try {
      const { jobId, requested } = await aiService.generate({
        source: text.trim() || undefined,
        url: url.trim() || undefined,
        topic: genTopic.trim() || undefined, // optional — enables coverage analysis
        plan,
        notes: notes.trim() || undefined,
        model: model || undefined,
        avoid: avoidStems, // don't repeat anything from earlier batches
        mode: isClient ? source : undefined,
      });
      if (!jobId) throw new Error("Could not start generation.");
      if (requested && !append) setDetected(requested);
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let done = false;
      for (let i = 0; i < 240 && !done; i++) {
        await sleep(2000);
        let s;
        try { s = await aiService.job(jobId); } catch { continue; }
        if (s.status === "done") {
          const qs = s.questions || [];
          setPreview((prev) => (append ? [...prev, ...qs] : qs));
          // Remember these stems so the NEXT batch avoids repeating them.
          const batchStems = qs.map((q) => q.text).filter(Boolean);
          setAvoidStems((prev) => Array.from(new Set([...prev, ...batchStems])));
          // Refresh the covered / not-covered summary (only if a topic is set).
          refreshCoverage(Array.from(new Set([...avoidStems, ...batchStems])));
          setMsg(qs.length
            ? (append
                ? `✓ Added ${qs.length} more question(s) — no duplicates of the earlier ones. Review, then insert.`
                : `✓ Generated ${qs.length}${requested ? ` of ${requested}` : ""} question(s). Review below, then insert.`)
            : "No questions were generated — try a longer source, a higher count, or different types.");
          done = true;
        } else if (s.status === "error") {
          setMsg(s.error || "Generation failed.");
          done = true;
        } else {
          setMsg(`Generating… ${s.count || 0} question(s) so far`);
        }
      }
      if (!done) setMsg("Still working — try a smaller count.");
    } catch (e) {
      setMsg(e.message || "Generation failed.");
    } finally {
      setBusy(false);
    }
  };

  // Build the onUpload options. When "New {leaf}" is chosen we send newTarget so
  // the parent auto-creates it; after the first insert we flip back to "current"
  // so the remaining batches go into that just-created quiz/test.
  const makingNew = allowNewTarget && destChoice === "new";
  const buildOpts = () => (makingNew ? { section, newTarget: { name: newName.trim() } } : { section });
  const afterNewInsert = () => { if (makingNew) { setDestChoice("current"); setNewName(""); } };

  // Insert one batch of the extracted preview (removes them so they aren't
  // inserted twice), or use "Insert all".
  const insertBatch = async (items, idx) => {
    if (!items.length || insertingIdx !== -1 || inserting) return;
    if (makingNew && !newName.trim()) { setMsg(`Enter a name for the new ${newLeafLabel}.`); return; }
    setInsertingIdx(idx);
    setMsg("");
    try {
      const res = await onUpload(items, buildOpts());
      setPreview((prev) => prev.filter((q) => !items.includes(q)));
      setMsg(`✓ Inserted ${res?.inserted ?? items.length} question(s) from this batch${makingNew ? ` into new ${newLeafLabel} “${newName.trim()}”` : ""}.`);
      afterNewInsert();
    } catch (e) {
      setMsg(e.message || "Insert failed.");
    } finally {
      setInsertingIdx(-1);
    }
  };

  const insert = async () => {
    if (!preview.length) return;
    if (makingNew && !newName.trim()) { setMsg(`Enter a name for the new ${newLeafLabel}.`); return; }
    setInserting(true);
    setMsg("");
    try {
      const res = await onUpload(preview, buildOpts());
      setMsg(`✓ Inserted ${res?.inserted ?? preview.length} question(s)${makingNew ? ` into new ${newLeafLabel} “${newName.trim()}”` : ""}. Generate/extract the next batch, or click Close when you're done.`);
      setPreview([]);
      afterNewInsert();
      // Stay on this screen (keep the source + settings) so you can immediately
      // do the next batch. The modal never closes by itself after inserting;
      // use the Close button when you're finished.
    } catch (e) {
      setMsg(e.message || "Insert failed.");
    } finally {
      setInserting(false);
    }
  };

  const QuestionCard = ({ q, n }) => (
    <div className="rounded-lg bg-slate-50 p-2 text-xs dark:bg-slate-800/60">
      <div className="flex items-center gap-2">
        <span className="rounded bg-brand-100 px-1.5 py-0.5 font-semibold uppercase text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">{q.type}</span>
        <span className="text-slate-400">{q.difficulty}</span>
        <span className="ml-auto font-semibold text-emerald-600 dark:text-emerald-400">Ans: {LETTERS[q.correct] || "?"}</span>
      </div>
      <p className="mt-1 font-medium text-slate-700 dark:text-slate-200">{n}. {q.text}</p>
      <ul className="mt-1 grid grid-cols-2 gap-x-3 text-slate-500 dark:text-slate-400">
        {(q.options || []).map((o, j) => (
          <li key={j} className={j === q.correct ? "font-semibold text-emerald-600 dark:text-emerald-400" : ""}>{LETTERS[j]}. {o}</li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
      {textFull && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white p-4 dark:bg-slate-900">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-lg font-bold"><FileText className="h-5 w-5 text-brand-600" /> Extracted or pasted text</h3>
            <button type="button" onClick={() => setTextFull(false)} className="btn-outline !py-1 !text-xs">
              <Minimize2 className="h-3.5 w-3.5" /> Exit full screen
            </button>
          </div>
          <textarea
            className="input min-h-0 flex-1 resize-none font-mono text-sm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste or edit the questions text here…"
          />
          <p className="mt-1 text-xs text-slate-400">{text.trim().length.toLocaleString()} characters</p>
        </div>
      )}
      <div className="my-8 w-full max-w-2xl animate-scale-in card p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold"><Globe className="h-5 w-5 text-brand-600" /> {title}</h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {canChooseSource && (
          <div className="mb-3">
            <label className="mb-1 block text-sm font-semibold">API source for this import</label>
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
              <p className="mt-1">Add <code>AI_API_KEY</code> to the server environment to enable importing.</p>
            )}
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              {documents ? <><b>Pick a saved document</b>, upload a <b>file</b> (PDF, Word, PPT, Excel, CSV, text), </> : <>Upload a <b>file</b> (PDF, Word, PPT, Excel, CSV, text), </>}
              paste a page link, <b>or</b> paste the questions text, then <b>Extract Questions</b>. Review the results and insert them.
              {typeof status?.keys === "number" && (
                <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400"> {status.keys} API key{status.keys === 1 ? "" : "s"} active.</span>
              )}
              {status?.planName && (
                <span className="ml-1 font-semibold text-brand-600 dark:text-brand-300">
                  Plan: {status.planName} · up to {maxPerBatch}/batch{status?.remaining != null ? ` · ${status.remaining} left this window` : ""}.
                </span>
              )}
            </div>

            {/* Choose what to do with the link / paragraph. */}
            <div className="mb-3">
              <div className="inline-flex w-full overflow-hidden rounded-xl border border-slate-200 text-sm font-semibold dark:border-slate-700">
                <button type="button" onClick={() => setTask("extract")} className={`flex flex-1 items-center justify-center gap-2 px-3 py-2 ${task === "extract" ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>
                  <ScanText className="h-4 w-4" /> Extract existing
                </button>
                <button type="button" onClick={() => setTask("generate")} className={`flex flex-1 items-center justify-center gap-2 px-3 py-2 ${task === "generate" ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>
                  <Sparkles className="h-4 w-4" /> Generate new
                </button>
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {task === "extract"
                  ? "Pulls the questions already present in the link/paragraph."
                  : "Creates NEW questions from the link/paragraph — you choose how many and which types."}
              </p>
            </div>

            {status?.models && status.models.length > 1 && (
              <div className="mb-3">
                <label className="mb-1 block text-sm font-semibold">AI model</label>
                <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
                  {status.models.map((m) => <option key={m} value={m}>{m}</option>)}
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

            {documents && (
              <div className="mb-3">
                <label className="mb-1 flex items-center gap-1 text-sm font-semibold"><Files className="h-4 w-4 text-brand-600" /> Use a saved document</label>
                {docList.length ? (
                  <select className="input" value={docId} onChange={(e) => pickDoc(e.target.value)}>
                    <option value="">— Pick a document —</option>
                    {docList.map((d) => <option key={d._id} value={d._id}>{d.title}{d.pages ? ` (${d.pages}p)` : ""}</option>)}
                  </select>
                ) : (
                  <p className="text-xs text-slate-400">No saved documents yet — add some in Admin → Documents.</p>
                )}
                <div className="my-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /> or <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
                </div>
              </div>
            )}

            <label className="mb-1 block text-sm font-semibold">Upload a document</label>
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm transition ${pdfBusy ? "border-brand-400 text-brand-600" : "border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:text-slate-400"}`}>
              <input
                type="file"
                accept=".pdf,.docx,.pptx,.xlsx,.csv,.tsv,.txt,.md,.markdown,.json,.rtf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/plain,text/csv"
                className="hidden"
                onChange={onFile}
                disabled={pdfBusy}
              />
              {pdfBusy ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Reading{pdfProgress ? ` — page ${pdfProgress.page}/${pdfProgress.total}` : "…"}</>
              ) : (
                <><Upload className="h-4 w-4" /> Choose a file <span className="text-slate-400">— PDF, Word, PPT, Excel, CSV, text</span></>
              )}
            </label>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
              <FileText className="h-3.5 w-3.5" /> PDF, Word (.docx), PowerPoint (.pptx), Excel (.xlsx), CSV & text read instantly. Scanned/image PDFs need OCR below.
            </p>

            {pdfFile && (
              <button type="button" onClick={runOcr} disabled={ocrBusy || pdfBusy}
                className={`mt-2 w-full ${scanned ? "btn-primary" : "btn-outline"}`}>
                {ocrBusy
                  ? <><Loader2 className="h-4 w-4 animate-spin" /> OCR… page {ocrProgress?.page || 0}/{ocrProgress?.total || "?"}</>
                  : <><ScanText className="h-4 w-4" /> Read scanned PDF with OCR (slower)</>}
              </button>
            )}

            <div className="my-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /> or <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>

            <label className="mb-1 block text-sm font-semibold">Page or YouTube link (optional)</label>
            <input className="input" placeholder="https://example.com/quiz-page  or  https://youtu.be/… (transcript read automatically)" value={url} onChange={(e) => setUrl(e.target.value)} />
            <p className="mt-1 text-xs text-slate-400">Paste a web page or a YouTube video link (must have captions) — its text/transcript is read automatically.</p>

            <div className="mb-1 mt-3 flex items-center justify-between gap-2">
              <label className="block text-sm font-semibold">{task === "generate" ? "Paragraph / source text" : "Extracted or pasted text"}</label>
              <button type="button" onClick={() => setTextFull(true)} className="btn-outline !py-1 !text-xs">
                <Maximize2 className="h-3.5 w-3.5" /> Full screen
              </button>
            </div>
            <textarea
              rows={8}
              className="input resize-y font-mono text-xs"
              placeholder={"PDF/document text appears here — or paste questions directly, e.g.\n1. What is the powerhouse of the cell?\nA) Nucleus  B) Mitochondria  C) Ribosome  D) Golgi\nAns: B"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {text.trim() && (
              <p className="mt-1 text-xs text-slate-400">{text.trim().length.toLocaleString()} characters ready.</p>
            )}

            {/* Strong optional instructions — followed exactly for both modes. */}
            <label className="mb-1 mt-3 block text-sm font-semibold">Instructions (optional — followed strictly)</label>
            <textarea
              rows={2}
              className="input resize-y"
              placeholder={task === "generate"
                ? 'e.g. "Only about the French Revolution", "Questions in Hindi", "Focus on dates & numbers", "Keep language simple"'
                : 'e.g. "Only keep General Knowledge questions", "Translate questions to English", "Fix obvious OCR typos"'}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
            <p className="mt-1 text-xs text-slate-400">
              Leave empty to use defaults. Anything you write here is treated as a top-priority instruction the AI must follow.
            </p>

            {task === "generate" && (
              <div className="mt-3">
                {/* Optional topic name → enables the covered / not-covered analysis. */}
                <label className="mb-1 block text-sm font-semibold">Topic / syllabus name <span className="font-normal text-slate-400">(optional — shows areas covered)</span></label>
                <input
                  type="text"
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                  placeholder='e.g. "Indian Economy", "French Revolution" — enables coverage tracking'
                  className="input mb-3"
                />

                {/* How many of each type × difficulty. Total = sum of all cells. */}
                <div className="flex items-center justify-between">
                  <label className="block text-sm font-semibold">Questions by type &amp; difficulty</label>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${genTotal > maxPerBatch ? "bg-rose-100 text-rose-600 dark:bg-rose-900/30" : "bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300"}`}>
                    Total: {genTotal}
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
                      {Q_TYPES.map((t) => (
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
                <div className={`mt-2 flex items-center justify-between rounded-xl border px-4 py-2.5 ${genTotal > maxPerBatch ? "border-rose-300 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-900/20" : "border-brand-200 bg-brand-50 dark:border-brand-900/40 dark:bg-brand-900/20"}`}>
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Total questions</span>
                  <span className={`text-lg font-extrabold tabular-nums ${genTotal > maxPerBatch ? "text-rose-600 dark:text-rose-400" : "text-brand-600 dark:text-brand-300"}`}>
                    {genTotal} <span className="text-xs font-medium text-slate-400">/ {maxPerBatch}</span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">
                  Set a count in any cell — e.g. 3 Easy MCQs + 2 Medium Matching. Leave cells at 0 to skip. Up to {maxPerBatch} per run.
                </p>
              </div>
            )}

            <button type="button" onClick={() => (task === "generate" ? runGenerate(false) : runExtract(false))} disabled={busy || busyMore} className="btn-primary mt-4 w-full">
              {busy
                ? <><Loader2 className="h-4 w-4 animate-spin" /> {task === "generate" ? "Generating…" : "Extracting…"}</>
                : task === "generate"
                  ? <><Sparkles className="h-4 w-4" /> Generate Questions</>
                  : <><Download className="h-4 w-4" /> Extract Questions</>}
            </button>

            {/* Generate-new mode: add another batch from the same source, with no
                repeats of what's already in the preview (mirrors the AI Generator). */}
            {task === "generate" && preview.length > 0 && (
              <button
                type="button"
                onClick={() => runGenerate(true)}
                disabled={busy || busyMore}
                className="btn-outline mt-2 w-full"
                title="Generate another batch from the same source — the AI avoids every question already generated above"
              >
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating more…</> : <><Sparkles className="h-4 w-4" /> Generate more from this source (no duplicates)</>}
              </button>
            )}

            {/* Covered vs still-uncovered areas of the topic (only when a Topic
                name is set on the Generate tab), refreshed after each batch. */}
            {task === "generate" && (coverage || coverageLoading) && (
              <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
                  <ListChecks className="h-4 w-4 text-brand-600" /> Areas covered so far
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
                      <button type="button" onClick={() => setNotes((n) => `${n ? n + " " : ""}Focus on these uncovered areas: ${coverage.missing.join(", ")}.`)} className="btn-outline mt-3 text-xs">
                        <Sparkles className="h-3.5 w-3.5" /> Add uncovered areas to instructions → generate them next
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
                  <input type="radio" name="importdest" checked={destChoice === "current"} onChange={() => setDestChoice("current")} />
                  <span>Current {newLeafLabel}{currentTargetName ? <> — <b>{currentTargetName}</b></> : <span className="text-slate-400"> (the one selected)</span>}</span>
                </label>
                <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
                  <input type="radio" name="importdest" checked={destChoice === "new"} onChange={() => setDestChoice("new")} />
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
                  Choose <b>New {newLeafLabel}</b> to auto-create it (under the same parent) and put this batch there — then generate/extract the next batch for the current one.
                </p>
              </div>
            )}

            {preview.length > 0 && (
              <div className="mt-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4" /> {preview.length}{detected ? ` of ~${detected}` : ""} question(s) ready — insert each batch below, or all at once.
                  </p>
                  {task === "extract" && (url.trim() || text.trim()) && (
                    <button type="button" onClick={() => runExtract(true)} disabled={busy || busyMore || inserting || insertingIdx !== -1}
                      className="btn-outline !py-1 !text-xs"
                      title="Re-scan the same source and add only the questions that were missed (no duplicates)">
                      {busyMore
                        ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Finding missed…</>
                        : <><Plus className="h-3.5 w-3.5" /> {detected && detected > preview.length ? `Extract remaining ${detected - preview.length}` : "Extract missed questions"}</>}
                    </button>
                  )}
                </div>
                {Array.from({ length: Math.ceil(preview.length / BATCH) }).map((_, bi) => {
                  const start = bi * BATCH;
                  const items = preview.slice(start, start + BATCH);
                  return (
                    <div key={bi} className="rounded-xl border border-slate-200 dark:border-slate-700">
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                        <span className="text-sm font-semibold">Batch {bi + 1} <span className="font-normal text-slate-400">· {items.length} question(s)</span></span>
                        <button type="button" onClick={() => insertBatch(items, bi)} disabled={insertingIdx !== -1 || inserting} className="btn-primary !py-1 !text-xs">
                          {insertingIdx === bi ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Inserting…</> : <>Insert these {items.length}</>}
                        </button>
                      </div>
                      <div className="max-h-56 space-y-2 overflow-y-auto p-2">
                        {items.map((q, j) => <QuestionCard key={j} q={q} n={start + j + 1} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {msg && <p className="mt-3 text-sm font-medium">{msg}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Close</button>
          {status?.enabled && preview.length > 0 && (
            <button type="button" onClick={insert} disabled={inserting || insertingIdx !== -1} className="btn-primary">
              {inserting ? <><Loader2 className="h-4 w-4 animate-spin" /> Inserting…</> : `Insert all ${preview.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
