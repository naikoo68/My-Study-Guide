import { useEffect, useState } from "react";
import { X, Globe, Download, CheckCircle2, AlertTriangle, Loader2, Server, KeyRound, FileText, Upload, Files } from "lucide-react";
import { aiService, documentService } from "../../services";
import { useAuth } from "../../context/AuthContext";

const LETTERS = ["A", "B", "C", "D"];

// Import questions FROM another website or pasted text. The AI extracts the
// questions already present (it does not invent them) and returns them in the
// app's format for preview → insert. Reuses the same onUpload handler as the
// bulk-upload / AI-generate modals.
export default function AiImport({ open, onClose, onUpload, title = "Import Questions (PDF, Web or Text)", sections = [], documents = false }) {
  const { user } = useAuth();
  const isClient = user?.role === "client" && user?.aiAccess;
  const canChooseSource = isClient && user?.aiAllowInbuilt !== false && user?.aiAllowSelf !== false;
  const [source, setSource] = useState(user?.aiMode === "self" ? "self" : "inbuilt"); // "inbuilt" | "self"
  const [status, setStatus] = useState(null);
  const [model, setModel] = useState("");
  const [section, setSection] = useState(sections[0] || ""); // subject to tag imported questions
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState([]);
  const [busy, setBusy] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [msg, setMsg] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null); // { page, total }
  const [docList, setDocList] = useState([]); // saved documents (when `documents` enabled)
  const [docId, setDocId] = useState("");

  useEffect(() => {
    if (!open) return;
    setMsg("");
    setPreview([]);
    setDocId("");
  }, [open]);

  // When enabled, load the saved-document list so the user can pick one as the source.
  useEffect(() => {
    if (!open || !documents) return;
    documentService.list().then(setDocList).catch(() => setDocList([]));
  }, [open, documents]);

  // (Re)load status for the chosen source so the model list / key count match.
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

  // Read a PDF in the browser, pull out its text, and drop it into the box below
  // so the normal AI extraction runs on it. pdf.js is loaded on demand.
  const onPdf = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // let the same file be picked again later
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setMsg("Please choose a PDF file.");
      return;
    }
    setPdfBusy(true);
    setPdfProgress(null);
    setMsg(`Reading “${file.name}”…`);
    try {
      const { extractPdfText } = await import("../../lib/pdf");
      let total = 0;
      const extracted = await extractPdfText(file, (page, t) => { total = t; setPdfProgress({ page, total: t }); });
      if (!extracted) {
        setMsg("Couldn't read any text — this PDF looks like scanned images (no selectable text). Try a text-based PDF or paste the text.");
        return;
      }
      // Append so multiple PDFs / pasted text can be combined before extracting.
      setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${extracted}` : extracted));
      setMsg(`✓ Read ${total || "?"} page(s) from “${file.name}”. Now click “Extract Questions”.`);
    } catch (err) {
      setMsg(`PDF read failed: ${err.message}. Check your connection and try again.`);
    } finally {
      setPdfBusy(false);
    }
  };

  // Load a saved document's text into the box below, ready for extraction.
  const pickDoc = async (id) => {
    setDocId(id);
    if (!id) return;
    setMsg("Loading document…");
    try {
      const doc = await documentService.get(id);
      const body = (doc?.content || "").trim();
      if (!body) { setMsg("That document has no text to use."); return; }
      setText((prev) => (prev.trim() ? `${prev.trim()}\n\n${body}` : body));
      setMsg(`✓ Loaded “${doc.title}”. Now click “Extract Questions”.`);
    } catch (e) {
      setMsg(e.message || "Couldn't load that document.");
    }
  };

  const extract = async () => {
    if (!url.trim() && !text.trim()) {
      setMsg("Paste a page URL or the questions text to import.");
      return;
    }
    setBusy(true);
    setPreview([]);
    setMsg("Reading the source and extracting questions…");
    try {
      const { jobId, chunks } = await aiService.extract({
        url: url.trim() || undefined,
        content: text.trim() || undefined,
        model: model || undefined,
        mode: isClient ? source : undefined, // which key pool to use for this import
      });
      if (!jobId) throw new Error("Could not start the import.");

      // Poll the background job — it processes every section of the source.
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let done = false;
      for (let i = 0; i < 240 && !done; i++) {
        await sleep(2000);
        let s;
        try {
          s = await aiService.job(jobId);
        } catch {
          continue;
        }
        if (s.status === "done") {
          const qs = s.questions || [];
          setPreview(qs);
          setMsg(
            qs.length
              ? `✓ Extracted ${qs.length} question(s) from ${s.chunksTotal || chunks || 1} section(s)${
                  s.error === "quota" ? " (stopped early — quota reached; import these, then continue)" : ""
                }. Review below, then Insert.`
              : "No questions found — try pasting the text directly."
          );
          done = true;
        } else if (s.status === "error") {
          setMsg(s.error || "Import failed.");
          done = true;
        } else {
          setMsg(`Extracting… ${s.count || 0} question(s) so far (section ${s.chunksDone || 0}/${s.chunksTotal || chunks || "?"})`);
        }
      }
      if (!done) setMsg("Still working — the source is large. Try importing fewer sections at a time.");
    } catch (e) {
      setMsg(e.message || "Import failed.");
    } finally {
      setBusy(false);
    }
  };

  const insert = async () => {
    if (!preview.length) return;
    setInserting(true);
    setMsg("");
    try {
      const res = await onUpload(preview, { section });
      setMsg(`✓ Inserted ${res?.inserted ?? preview.length} question(s).`);
      setPreview([]);
      setUrl("");
      setText("");
      setTimeout(onClose, 1000);
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
            <Globe className="h-5 w-5 text-brand-600" /> {title}
          </h3>
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
              paste a page link, <b>or</b> paste the questions text. The AI reads the content and
              extracts the questions into your format — review before inserting. Only import content you have the right to use.
              {typeof status?.keys === "number" && (
                <span className="ml-1 font-semibold text-emerald-600 dark:text-emerald-400">
                  {status.keys} API key{status.keys === 1 ? "" : "s"} active.
                </span>
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
                    {docList.map((d) => (
                      <option key={d._id} value={d._id}>{d.title}{d.pages ? ` (${d.pages}p)` : ""}</option>
                    ))}
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
              <FileText className="h-3.5 w-3.5" /> Works with text-based PDFs (question papers, notes). Scanned image PDFs have no selectable text.
            </p>

            <div className="my-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /> or <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
            </div>

            <label className="mb-1 block text-sm font-semibold">Page URL (optional)</label>
            <input
              className="input"
              placeholder="https://example.com/quiz-page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />

            <label className="mb-1 block text-sm font-semibold">Extracted or pasted text</label>
            <textarea
              rows={6}
              className="input resize-y font-mono text-xs"
              placeholder={"PDF text appears here after upload — or paste questions directly, e.g.\n1. What is the powerhouse of the cell?\nA) Nucleus  B) Mitochondria  C) Ribosome  D) Golgi\nAns: B"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {text.trim() && (
              <p className="mt-1 text-xs text-slate-400">{text.trim().length.toLocaleString()} characters ready. Edit if needed, then Extract Questions.</p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Tip: pasting the text works more reliably than a URL — many sites block automated reading.
            </p>

            <button type="button" onClick={extract} disabled={busy} className="btn-primary mt-4 w-full">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Extracting…</> : <><Download className="h-4 w-4" /> Extract Questions</>}
            </button>

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
