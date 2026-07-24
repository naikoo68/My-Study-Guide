import { useEffect, useRef, useState } from "react";
import {
  X, Upload, FileText, Sparkles, Loader2, CheckCircle2, AlertTriangle, Plus, Trash2,
  ListChecks, Circle, Layers,
} from "lucide-react";
import { aiService } from "../../services";
import { useAuth } from "../../context/AuthContext";

// PDF → Topics: upload a PDF (or paste text), auto-detect its units/chapters,
// create one topic per unit under the chosen subject, generate questions spread
// across those units, then insert them (auto-creating a quiz under each topic).
//
// `adapter` (from AdminAiStudio) knows how to create a topic + a quiz for the
// chosen destination (My Quiz practice OR Content quiz):
//   adapter.createTopic(sel, name)              -> topicId
//   adapter.createQuizAndContext(sel, topicId, name) -> bulkQuestions context
//   adapter.bulk(questions, context)            -> { inserted }
// `sel` is the current Stream/Subject selection; `subjectName` is for display.
const DIFFS = ["Easy", "Medium", "Hard"];

export default function AiPdfTopics({ open, onClose, adapter, sel, subjectName = "", label = "quiz" }) {
  const { user } = useAuth();
  const isClient = user?.role === "client" && user?.aiAccess;
  const canChooseSource = isClient && user?.aiAllowInbuilt !== false && user?.aiAllowSelf !== false;
  const [apiSource, setApiSource] = useState(user?.aiMode === "self" ? "self" : "inbuilt");
  const fileRef = useRef(null);

  const [status, setStatus] = useState(null);
  const [text, setText] = useState("");          // extracted / pasted source text
  const [pdfName, setPdfName] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null);

  const [units, setUnits] = useState([]);         // detected units (editable)
  const [detecting, setDetecting] = useState(false);
  const [perTopic, setPerTopic] = useState(20);   // questions per unit
  const [difficulty, setDifficulty] = useState("Medium");

  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState([]);     // [{ unit, questions:[], status, count }]
  const [coverage, setCoverage] = useState(null); // { covered:[], missing:[] }
  const [inserting, setInserting] = useState(false);
  const [msg, setMsg] = useState("");

  const maxPerBatch = status?.maxPerBatch || 50;

  useEffect(() => {
    if (!open) return;
    setText(""); setPdfName(""); setUnits([]); setResults([]); setCoverage(null); setMsg("");
    setPerTopic(20); setDifficulty("Medium"); setGenerating(false); setInserting(false);
    aiService.status(isClient ? apiSource : undefined).then(setStatus).catch(() => setStatus(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ---- Read an uploaded PDF (or Word/PPT/etc) into the source text ----
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfName(file.name); setPdfBusy(true); setMsg(""); setPdfProgress(null);
    try {
      const name = file.name.toLowerCase();
      const isPdf = file.type === "application/pdf" || name.endsWith(".pdf");
      if (isPdf) {
        const { extractPdfText } = await import("../../lib/pdf");
        const extracted = await extractPdfText(file, (page, total) => setPdfProgress({ page, total }));
        setText((extracted || "").trim());
      } else {
        const { extractDocText } = await import("../../lib/docs");
        const extracted = await extractDocText(file);
        setText((extracted || "").trim());
      }
    } catch (err) {
      setMsg(err.message || "Could not read that file. Paste the text instead.");
    } finally {
      setPdfBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ---- Detect units/chapters from the source ----
  const detectUnits = async () => {
    if (!text.trim()) { setMsg("Upload a PDF or paste some text first."); return; }
    setDetecting(true); setMsg(""); setUnits([]);
    try {
      const r = await aiService.outlineUnits({ source: text.trim(), mode: isClient ? apiSource : undefined });
      const list = Array.isArray(r?.units) ? r.units : [];
      if (!list.length) { setMsg("No clear units were detected. Add them manually below, or paste more text."); }
      setUnits(list.map((name) => ({ name })));
    } catch (err) {
      setMsg(err.message || "Could not detect units.");
    } finally {
      setDetecting(false);
    }
  };

  const setUnitName = (i, v) => setUnits((u) => u.map((x, k) => (k === i ? { ...x, name: v } : x)));
  const addUnit = () => setUnits((u) => [...u, { name: "" }]);
  const removeUnit = (i) => setUnits((u) => u.filter((_, k) => k !== i));

  // ---- Generate questions for every unit (sequentially, from the PDF) ----
  const pollJob = async (jobId) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 240; i++) {
      await sleep(2000);
      let s;
      try { s = await aiService.job(jobId); } catch { continue; }
      if (s.status === "done") return s.questions || [];
      if (s.status === "error") throw new Error(s.error || "Generation failed.");
    }
    throw new Error("Generation timed out.");
  };

  const generateAll = async () => {
    const clean = units.map((u) => u.name.trim()).filter(Boolean);
    if (!clean.length) { setMsg("Add at least one unit/topic."); return; }
    if (!text.trim()) { setMsg("Upload a PDF or paste text first."); return; }
    const count = Math.max(1, Math.min(maxPerBatch, parseInt(perTopic, 10) || 20));
    setGenerating(true); setMsg(""); setCoverage(null);
    const out = clean.map((unit) => ({ unit, questions: [], status: "pending", count: 0 }));
    setResults(out.slice());
    try {
      for (let i = 0; i < clean.length; i++) {
        const unit = clean[i];
        out[i].status = "working"; setResults(out.slice());
        setMsg(`Generating ${count} questions for “${unit}” (${i + 1}/${clean.length})…`);
        try {
          const { jobId } = await aiService.generate({
            source: text.trim(),
            topic: unit, // focus this batch on the unit
            notes: `Write the questions ONLY about "${unit}" as covered in the source material.`,
            plan: [{ type: "mcq", difficulty, count }],
            mode: isClient ? apiSource : undefined,
          });
          if (!jobId) throw new Error("Could not start generation.");
          const qs = await pollJob(jobId);
          out[i].questions = qs; out[i].count = qs.length; out[i].status = "done";
        } catch (err) {
          out[i].status = "error"; out[i].error = err.message || "Failed";
        }
        setResults(out.slice());
      }
      const total = out.reduce((s, r) => s + r.count, 0);
      setMsg(`✓ Generated ${total} question(s) across ${clean.length} topic(s). Review below, then Insert.`);
      // Overall coverage against the PDF (areas covered vs not).
      refreshCoverage(out.flatMap((r) => r.questions.map((q) => q.text)).filter(Boolean));
    } catch (err) {
      setMsg(err.message || "Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const refreshCoverage = async (stems) => {
    if (!stems.length) { setCoverage(null); return; }
    try {
      const r = await aiService.coverageGaps({ source: text.trim(), questions: stems.slice(0, 300), mode: isClient ? apiSource : undefined });
      setCoverage({ covered: r?.covered || [], missing: r?.missing || [] });
    } catch { /* best-effort */ }
  };

  // ---- Insert: create a topic (+ quiz) per unit and save its questions ----
  const insertAll = async () => {
    const ready = results.filter((r) => r.questions.length);
    if (!ready.length) { setMsg("Nothing to insert yet — generate first."); return; }
    setInserting(true); setMsg("");
    let topics = 0, inserted = 0;
    try {
      for (const r of ready) {
        const topicId = await adapter.createTopic(sel, r.unit);
        if (!topicId) throw new Error(`Could not create topic “${r.unit}”.`);
        const context = await adapter.createQuizAndContext(sel, topicId, r.unit);
        const res = await adapter.bulk(r.questions, context);
        inserted += res?.inserted ?? r.questions.length;
        topics += 1;
        r.status = "inserted"; setResults((x) => x.slice());
      }
      setMsg(`✓ Created ${topics} topic(s) and inserted ${inserted} question(s). Open Content/My Practice to see them.`);
    } catch (err) {
      setMsg(err.message || "Insert failed.");
    } finally {
      setInserting(false);
    }
  };

  if (!open) return null;

  const totalToGenerate = units.filter((u) => u.name.trim()).length * Math.max(1, Math.min(maxPerBatch, parseInt(perTopic, 10) || 20));
  const generatedTotal = results.reduce((s, r) => s + r.count, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={inserting || generating ? undefined : onClose}>
      <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-2xl animate-scale-in card p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <Layers className="h-5 w-5 text-brand-600" /> PDF → Topics {subjectName ? <span className="text-slate-400">· {subjectName}</span> : null}
          </h3>
          <button type="button" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
          Upload a PDF — the AI detects its units/chapters, creates a topic for each under this subject, generates
          questions per topic, and inserts them into a new quiz under every topic.
        </p>

        {canChooseSource && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setApiSource("inbuilt")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${apiSource === "inbuilt" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/20" : "border-slate-200 text-slate-600 dark:border-slate-700"}`}>Built-in APIs</button>
            <button type="button" onClick={() => setApiSource("self")} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${apiSource === "self" ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-900/20" : "border-slate-200 text-slate-600 dark:border-slate-700"}`}>My own APIs</button>
          </div>
        )}

        {/* Step 1 — source */}
        <label className="mb-1 block text-sm font-semibold">1. Upload PDF / document</label>
        <div className="flex flex-wrap items-center gap-3">
          <label className={`btn-outline cursor-pointer text-sm ${pdfBusy ? "pointer-events-none opacity-60" : ""}`}>
            {pdfBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading…</> : <><Upload className="h-4 w-4" /> Choose file</>}
            <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.csv,.txt" className="hidden" onChange={handleFile} disabled={pdfBusy} />
          </label>
          {pdfName && <span className="inline-flex items-center gap-1 text-sm text-slate-500"><FileText className="h-4 w-4" /> {pdfName}</span>}
          {pdfProgress && <span className="text-xs text-slate-400">page {pdfProgress.page}/{pdfProgress.total}</span>}
        </div>
        <textarea
          className="input mt-2 resize-y font-mono text-xs"
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="…or paste the source text here"
        />
        {text.trim() && <p className="mt-1 text-xs text-slate-400">{text.trim().length.toLocaleString()} characters ready</p>}

        {/* Step 2 — detect units */}
        <div className="mt-4 flex items-center justify-between">
          <label className="block text-sm font-semibold">2. Units / topics detected</label>
          <button type="button" onClick={detectUnits} disabled={detecting || pdfBusy || !text.trim()} className="btn-outline !py-1 text-xs">
            {detecting ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Detecting…</> : <><Sparkles className="h-3.5 w-3.5" /> Detect units from PDF</>}
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {units.length === 0 && <p className="text-xs text-slate-400">No units yet — click “Detect units”, or add them manually.</p>}
          {units.map((u, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-6 text-right text-xs text-slate-400">{i + 1}.</span>
              <input className="input !py-1 text-sm" value={u.name} onChange={(e) => setUnitName(i, e.target.value)} placeholder={`Topic ${i + 1} name`} />
              <button type="button" onClick={() => removeUnit(i)} className="rounded-lg p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/30"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <button type="button" onClick={addUnit} className="btn-outline !py-1 text-xs"><Plus className="h-3.5 w-3.5" /> Add topic</button>
        </div>

        {/* Step 3 — how many per topic */}
        {units.some((u) => u.name.trim()) && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold">Questions per topic</label>
              <input type="number" min={1} max={maxPerBatch} value={perTopic} onChange={(e) => setPerTopic(e.target.value)} className="input" />
              <p className="mt-1 text-xs text-slate-400">Up to {maxPerBatch} per topic · total ≈ {totalToGenerate}</p>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold">Difficulty</label>
              <select className="input" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
                {DIFFS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
        )}

        {/* Step 4 — generate */}
        {units.some((u) => u.name.trim()) && (
          <button type="button" onClick={generateAll} disabled={generating || inserting || !status?.enabled} className="btn-primary mt-4 w-full">
            {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4" /> Generate questions for all topics</>}
          </button>
        )}

        {/* Per-topic results */}
        {results.length > 0 && (
          <div className="mt-4 space-y-1.5 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-1 text-sm font-semibold">Per-topic questions ({generatedTotal} total)</p>
            {results.map((r, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-slate-600 dark:text-slate-300">{r.unit}</span>
                <span className="flex-shrink-0 font-semibold">
                  {r.status === "working" && <Loader2 className="inline h-3.5 w-3.5 animate-spin text-brand-500" />}
                  {r.status === "pending" && <span className="text-slate-400">queued</span>}
                  {r.status === "done" && <span className="text-emerald-600">{r.count} questions</span>}
                  {r.status === "inserted" && <span className="text-emerald-600">✓ inserted ({r.count})</span>}
                  {r.status === "error" && <span className="text-rose-600">{r.error || "failed"}</span>}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Coverage vs the PDF */}
        {coverage && (
          <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><ListChecks className="h-4 w-4 text-brand-600" /> Areas covered from this PDF</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-emerald-600">Covered ({coverage.covered.length})</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-300">
                  {coverage.covered.map((c, i) => <li key={i} className="flex gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-emerald-500" />{c}</li>)}
                  {!coverage.covered.length && <li className="text-slate-400">—</li>}
                </ul>
              </div>
              <div>
                <p className="mb-1 text-xs font-bold uppercase tracking-wide text-amber-600">Not yet covered ({coverage.missing.length})</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600 dark:text-slate-300">
                  {coverage.missing.map((c, i) => <li key={i} className="flex gap-1.5"><Circle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-amber-500" />{c}</li>)}
                  {!coverage.missing.length && <li className="font-medium text-emerald-600">All covered 🎉</li>}
                </ul>
              </div>
            </div>
          </div>
        )}

        {msg && <p className={`mt-3 text-sm font-medium ${msg.startsWith("✓") ? "text-emerald-600" : "text-slate-600 dark:text-slate-300"}`}>{msg}</p>}

        {/* Step 5 — insert */}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-outline">Close</button>
          {generatedTotal > 0 && (
            <button type="button" onClick={insertAll} disabled={inserting || generating} className="btn-primary">
              {inserting ? <><Loader2 className="h-4 w-4 animate-spin" /> Inserting…</> : <>Create topics &amp; insert {generatedTotal}</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
