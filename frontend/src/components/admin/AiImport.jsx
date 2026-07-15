import { useEffect, useState } from "react";
import { X, Globe, Download, CheckCircle2, AlertTriangle, Loader2, Server, KeyRound, FileText, Upload, Files, Layers, ScanText } from "lucide-react";
import { aiService, documentService } from "../../services";
import { useAuth } from "../../context/AuthContext";

const LETTERS = ["A", "B", "C", "D"];
const PER_BATCH = 20; // questions per batch

// Split source text into batches of ~PER_BATCH questions by detecting numbered
// questions (1., 12), Q3., Question 5:). Mirrors the backend splitter so what
// the user sees as a batch matches what gets sent to the AI. Falls back to a
// single batch when no reliable numbering is found.
function splitIntoBatches(text, per = PER_BATCH) {
  const re = /(^|\n)[ \t]*(?:Q(?:uestion)?\.?\s*)?(\d{1,3})[.)\]:]\s/gi;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ pos: m.index + (m[1] ? m[1].length : 0), num: parseInt(m[2], 10) });
  const starts = [];
  let prev = null;
  for (const mk of marks) {
    if (prev === null) { if (mk.num <= 3) { starts.push(mk.pos); prev = mk.num; } }
    else if (mk.num === prev + 1 || mk.num === 1) { starts.push(mk.pos); prev = mk.num; }
  }
  if (starts.length < 2) return [{ text: text.trim(), count: 0 }];
  const blocks = [];
  for (let i = 0; i < starts.length; i++) {
    blocks.push(text.slice(starts[i], i + 1 < starts.length ? starts[i + 1] : text.length).trim());
  }
  const out = [];
  for (let i = 0; i < blocks.length; i += per) {
    const group = blocks.slice(i, i + per);
    out.push({ text: group.join("\n\n"), count: group.length });
  }
  return out;
}

// Import questions from a saved document, a PDF, a web page, or pasted text.
// The source is split into batches; you Extract each batch, review, and Insert.
export default function AiImport({ open, onClose, onUpload, title = "Import Questions (PDF, Web or Text)", sections = [], documents = false }) {
  const { user } = useAuth();
  const isClient = user?.role === "client" && user?.aiAccess;
  const canChooseSource = isClient && user?.aiAllowInbuilt !== false && user?.aiAllowSelf !== false;
  const [source, setSource] = useState(user?.aiMode === "self" ? "self" : "inbuilt"); // "inbuilt" | "self"
  const [status, setStatus] = useState(null);
  const [model, setModel] = useState("");
  const [section, setSection] = useState(sections[0] || "");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [batches, setBatches] = useState([]); // [{ key, text?, url?, label, count, status, questions, msg }]
  const [msg, setMsg] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null);
  const [pdfFile, setPdfFile] = useState(null); // kept so OCR can re-read a scanned PDF
  const [scanned, setScanned] = useState(false); // last PDF had no real text layer
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [docList, setDocList] = useState([]);
  const [docId, setDocId] = useState("");

  useEffect(() => {
    if (!open) return;
    setMsg("");
    setBatches([]);
    setDocId("");
    setPdfFile(null);
    setScanned(false);
  }, [open]);

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

  const onPdf = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMsg("Please choose a PDF file.");
      return;
    }
    setPdfBusy(true);
    setPdfProgress(null);
    setPdfFile(file);
    setScanned(false);
    setMsg(`Reading “${file.name}”…`);
    try {
      const { extractPdfText, looksScanned } = await import("../../lib/pdf");
      let total = 0;
      const extracted = await extractPdfText(file, (page, t) => { total = t; setPdfProgress({ page, total: t }); });
      // Scanned/image PDFs (e.g. eOffice files) carry only a short digital stamp
      // as selectable text — detect that and offer OCR instead of importing junk.
      if (!extracted || looksScanned(extracted)) {
        setScanned(true);
        setMsg(`“${file.name}” looks like a SCANNED PDF — the pages are images, so only ${extracted ? "a header/stamp" : "no text"} could be read. Use “Read scanned PDF with OCR” below.`);
        return;
      }
      const combined = text.trim() ? `${text.trim()}\n\n${extracted}` : extracted;
      setText(combined);
      buildBatches(combined); // auto-create the question boxes
      setMsg(`✓ Read ${total || "?"} page(s) from “${file.name}” — split into question boxes below.`);
    } catch (err) {
      setMsg(`PDF read failed: ${err.message}. Check your connection and try again.`);
    } finally {
      setPdfBusy(false);
    }
  };

  // Read a scanned/image PDF with OCR (slower). Renders each page and recognises
  // its text, then builds the question boxes from the result.
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
      buildBatches(ocrText);
      setScanned(false);
      setMsg(`✓ OCR read ${total} page(s) — split into question boxes below. OCR isn't perfect, so review each box before extracting.`);
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
      const body = (doc?.content || "").trim();
      if (!body) { setMsg("That document has no text to use."); return; }
      const combined = text.trim() ? `${text.trim()}\n\n${body}` : body;
      setText(combined);
      buildBatches(combined); // auto-create the question boxes
      setMsg(`✓ Loaded “${doc.title}” — split into question boxes below.`);
    } catch (e) {
      setMsg(e.message || "Couldn't load that document.");
    }
  };

  // Split the source into editable question boxes (~20 questions each). Called
  // automatically after a PDF/document loads, and via the button after pasting.
  const buildBatches = (fullText) => {
    setMsg("");
    const t = (fullText ?? text).trim();
    if (t) {
      const parts = splitIntoBatches(t);
      setBatches(parts.map((p, i) => ({
        key: `${Date.now()}-${i}`,
        text: p.text,
        label: `Box ${i + 1}`,
        count: p.count,
        status: "idle",
        questions: [],
        msg: "",
      })));
    } else if (url.trim()) {
      setBatches([{ key: `${Date.now()}-url`, url: url.trim(), label: "Web page", count: 0, status: "idle", questions: [], msg: "" }]);
    } else {
      setMsg("Add a saved document, a PDF, a URL, or paste text first.");
    }
  };

  const patchBatch = (i, patch) => setBatches((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...patch } : b)));

  // Run the AI extraction for one batch and poll to completion.
  const runExtraction = async (src, onProg) => {
    const { jobId } = await aiService.extract({
      content: src.text || undefined,
      url: src.url || undefined,
      model: model || undefined,
      mode: isClient ? source : undefined,
    });
    if (!jobId) throw new Error("Could not start extraction.");
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 180; i++) {
      await sleep(2000);
      let s;
      try { s = await aiService.job(jobId); } catch { continue; }
      if (s.status === "done") return { questions: s.questions || [], quota: s.error === "quota" };
      if (s.status === "error") throw new Error(s.error || "Extraction failed.");
      onProg?.(s);
    }
    throw new Error("Timed out — this batch is large; try splitting the source into more/smaller batches.");
  };

  const extractBatch = async (i) => {
    patchBatch(i, { status: "extracting", msg: "Extracting…", questions: [] });
    try {
      const { questions, quota } = await runExtraction(batches[i], (s) => patchBatch(i, { msg: `Extracting… ${s.count || 0} question(s) so far` }));
      patchBatch(i, {
        status: "done",
        questions,
        msg: questions.length
          ? `✓ ${questions.length} question(s) extracted${quota ? " (quota reached — insert these, then retry)" : ""}. Review & Insert.`
          : "No questions found in this batch.",
      });
    } catch (e) {
      patchBatch(i, { status: "error", msg: e.message });
    }
  };

  const insertBatch = async (i) => {
    const qs = batches[i].questions;
    if (!qs?.length) return;
    patchBatch(i, { status: "inserting", msg: "Inserting…" });
    try {
      const res = await onUpload(qs, { section });
      patchBatch(i, { status: "inserted", msg: `✓ Inserted ${res?.inserted ?? qs.length} question(s).` });
    } catch (e) {
      patchBatch(i, { status: "done", msg: e.message || "Insert failed." });
    }
  };

  const busyAny = batches.some((b) => b.status === "extracting" || b.status === "inserting");

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
              {documents ? <><b>Pick a saved document</b>, upload a <b>PDF</b>, </> : <>Upload a <b>PDF</b>, </>}
              paste a page link, <b>or</b> paste the questions text, then <b>Split into batches</b>. Extract each batch and insert it — batch by batch.
              {typeof status?.keys === "number" && (
                <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400"> {status.keys} API key{status.keys === 1 ? "" : "s"} active.</span>
              )}
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

            <label className="mb-1 block text-sm font-semibold">Upload a PDF</label>
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-4 text-sm transition ${pdfBusy ? "border-brand-400 text-brand-600" : "border-slate-300 text-slate-500 hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:text-slate-400"}`}>
              <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPdf} disabled={pdfBusy} />
              {pdfBusy ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Reading PDF{pdfProgress ? ` — page ${pdfProgress.page}/${pdfProgress.total}` : "…"}</>
              ) : (
                <><Upload className="h-4 w-4" /> Choose a PDF <span className="text-slate-400">— its text is extracted for the AI</span></>
              )}
            </label>
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-400">
              <FileText className="h-3.5 w-3.5" /> Text-based PDFs read instantly. Scanned/image PDFs (no selectable text) need OCR below.
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

            <label className="mb-1 block text-sm font-semibold">Page URL (optional)</label>
            <input className="input" placeholder="https://example.com/quiz-page" value={url} onChange={(e) => setUrl(e.target.value)} />

            <label className="mb-1 mt-3 block text-sm font-semibold">Extracted or pasted text</label>
            <textarea
              rows={6}
              className="input resize-y font-mono text-xs"
              placeholder={"PDF/document text appears here — or paste questions directly, e.g.\n1. What is the powerhouse of the cell?\nA) Nucleus  B) Mitochondria  C) Ribosome  D) Golgi\nAns: B"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {text.trim() && (
              <p className="mt-1 text-xs text-slate-400">{text.trim().length.toLocaleString()} characters ready.</p>
            )}

            <button type="button" onClick={() => buildBatches()} disabled={busyAny} className="btn-primary mt-4 w-full">
              <Layers className="h-4 w-4" /> Split into question boxes (20 each)
            </button>

            {batches.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                  {batches.length} box(es) — edit if needed, Extract, then Insert each.
                </p>
                {batches.map((b, i) => (
                  <div key={b.key} className="rounded-xl border border-slate-200 dark:border-slate-700">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                      <span className="text-sm font-semibold">
                        {b.label}
                        <span className="font-normal text-slate-400">
                          {b.count ? ` · ~${b.count} question(s)` : ""}{b.questions.length ? ` · ${b.questions.length} extracted` : ""}
                        </span>
                      </span>
                      <div className="flex gap-2">
                        {b.status !== "inserted" && (
                          <button type="button" onClick={() => extractBatch(i)} disabled={b.status === "extracting" || b.status === "inserting"} className="btn-outline !py-1 !text-xs">
                            {b.status === "extracting"
                              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extracting…</>
                              : <><Download className="h-3.5 w-3.5" /> {b.questions.length ? "Re-extract" : "Extract questions"}</>}
                          </button>
                        )}
                        {b.questions.length > 0 && b.status !== "inserted" && (
                          <button type="button" onClick={() => insertBatch(i)} disabled={b.status === "inserting" || b.status === "extracting"} className="btn-primary !py-1 !text-xs">
                            {b.status === "inserting" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Inserting…</> : <>Insert {b.questions.length}</>}
                          </button>
                        )}
                        {b.status === "inserted" && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-4 w-4" /> Inserted</span>
                        )}
                      </div>
                    </div>
                    {/* The editable "Extracted or pasted text" box for THIS batch (~20 questions) */}
                    {b.url ? (
                      <p className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400">{b.url}</p>
                    ) : (
                      <div className="p-2">
                        <textarea
                          className="input resize-y font-mono text-xs"
                          rows={6}
                          value={b.text}
                          onChange={(e) => patchBatch(i, { text: e.target.value })}
                          disabled={b.status === "extracting" || b.status === "inserting" || b.status === "inserted"}
                        />
                      </div>
                    )}
                    {b.msg && <p className="px-3 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">{b.msg}</p>}
                    {b.questions.length > 0 && b.status !== "inserted" && (
                      <div className="max-h-56 space-y-2 overflow-y-auto p-2">
                        {b.questions.map((q, j) => <QuestionCard key={j} q={q} n={j + 1} />)}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {msg && <p className="mt-3 text-sm font-medium">{msg}</p>}

        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-outline">Close</button>
        </div>
      </div>
    </div>
  );
}
