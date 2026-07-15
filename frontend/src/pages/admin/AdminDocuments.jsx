import { useEffect, useState, useRef } from "react";
import { FileText, Upload, Plus, Pencil, Trash2, X, Loader2, Save, Download, ScanText, Maximize2, Minimize2, Copy, Check, Sigma, Wand2, Eraser } from "lucide-react";
import { documentService, aiService } from "../../services";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";
import { questionsToCsv } from "../../components/admin/BulkUploadQuestions";

const LETTERS = ["A", "B", "C", "D"];
const COL_A = ["1", "2", "3", "4", "5", "6", "7", "8"];
const COL_B = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];
const CLOSING = {
  statement: "Which of the statement(s) given above is/are correct?",
  pair: "How many of the above pairs are correctly matched?",
  pairselect: "Which of the pairs given above is/are correctly matched?",
};

// Format ONE extracted question as clean, answer-free text, respecting its type
// (matching / pair / pairselect / statement / assertion / table / mcq).
function formatQuestionText(q, idx) {
  const clean = (s) => String(s == null ? "" : s).trim();
  const opts = (q.options || []).map(clean).filter(Boolean);
  const optionLines = opts.map((o, j) => `${LETTERS[j] || j + 1}) ${o}`);
  const lines = [`${idx + 1}. ${clean(q.text)}`];
  const A = (q.columnA || []).map(clean).filter(Boolean);
  const B = (q.columnB || []).map(clean).filter(Boolean);

  switch (q.type) {
    case "assertion":
      if (clean(q.assertion)) lines.push(`Assertion (A): ${clean(q.assertion)}`);
      if (clean(q.reason)) lines.push(`Reason (R): ${clean(q.reason)}`);
      break;
    case "statement":
      A.forEach((s, j) => lines.push(`${j + 1}. ${s}`));
      lines.push(CLOSING.statement);
      break;
    case "pair":
    case "pairselect": {
      const n = Math.max(A.length, B.length);
      for (let j = 0; j < n; j++) lines.push(`${j + 1}. ${A[j] || ""} — ${B[j] || ""}`);
      lines.push(CLOSING[q.type]);
      break;
    }
    case "matching":
      lines.push("Column A:");
      A.forEach((x, j) => lines.push(`   ${COL_A[j] || j + 1}. ${x}`));
      lines.push("Column B:");
      B.forEach((x, j) => lines.push(`   ${COL_B[j] || j + 1}. ${x}`));
      break;
    case "table":
      (q.tableRows || []).forEach((row) => lines.push(`   ${Array.isArray(row) ? row.join(" | ") : clean(row)}`));
      break;
    default:
      break;
  }
  lines.push(...optionLines);
  return lines.join("\n");
}

// One-click, offline text cleaner for extracted / OCR'd exam papers. Strips the
// boilerplate that scanned government PDFs carry — file numbers, eOffice stamps,
// "(Set-A)", "[P.T.O.]", page markers, board headers — while keeping the actual
// questions. Runs entirely in the browser (no AI / no network).
const JUNK_LINE_PATTERNS = [
  /^file\s*no\b/i,                                 // File No. JKSSB-COEOEXAM(UT)/…
  /generated\s+from\s+e?-?\s*office/i,             // Generated from eOffice by …
  /\bcomputer\s*no\b/i,                            // (Computer No. 7593614)
  /service\s+selection\s+board/i,                  // …SERVICE SELECTION BOARD…
  /outside\s+sec(?:retariat|tt)\b/i,               // (OUTSIDE SECTT)
  /\bproject\s+manager\b/i,                        // …, PROJECT MANAGER, …
  /^\(?\s*set\s*[-–]?\s*[a-z]\s*\)?[\s.)\]]*$/i,    // (Set-A) on its own line
  /^\s*page\s*\d+/i,                               // Page 3
  /^[[(]\s*\d{1,4}\s*[\])]$/,                       // (15)  [15]  page markers
  /^\s*\d{3,}(?:\s*[/\\]\s*\w+){2,}/,               // 8233675/2026/0/0 Clerical Hall JKSSB
  /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,               // 08/06/2026 date stamps
];

function cleanExtractedText(raw) {
  const original = String(raw || "");
  if (!original.trim()) return { text: original, removed: 0 };
  // First scrub stamps that sit INLINE on the same line as real content.
  const scrubbed = original
    .replace(/\[[^\]\n]*\bP\.?\s*T\.?\s*O\.?[^\]\n]*\]/gi, " ")  // [P.T.O.15]
    .replace(/\(\s*computer\s*no\.?[^)\n]*\)/gi, " ")            // (Computer No. …)
    .replace(/\(\s*set\s*[-–]?\s*[a-z]\s*\)/gi, " ")            // (Set-A)
    .replace(/\bP\.?\s*T\.?\s*O\.?\b/gi, " ");                   // stray P.T.O.
  let removed = 0;
  const kept = scrubbed.split(/\r?\n/).filter((line) => {
    const t = line.trim();
    if (!t) return true; // keep blanks now; collapse runs later
    if (JUNK_LINE_PATTERNS.some((re) => re.test(t))) { removed++; return false; }
    return true;
  });
  const text = kept
    .join("\n")
    .replace(/[ \t]+\n/g, "\n")   // trailing whitespace
    .replace(/\n{3,}/g, "\n\n")   // collapse blank-line runs
    .trim();
  return { text, removed };
}

// Inline-math toolbar: LaTeX snippets render via KaTeX inside $…$; plain symbols
// are inserted as-is. See MathText ($…$ inline, $$…$$ block).
const MATH_BTNS = [
  { t: "$ $", ins: ["$", "$"], title: "Wrap selection in inline math" },
  { t: "x²", ins: ["$x^{2}$"] },
  { t: "xₙ", ins: ["$x_{n}$"] },
  { t: "a⁄b", ins: ["$\\frac{a}{b}$"] },
  { t: "√", ins: ["$\\sqrt{x}$"] },
  { t: "×", ins: ["×"] },
  { t: "÷", ins: ["÷"] },
  { t: "π", ins: ["π"] },
  { t: "≤", ins: ["≤"] },
  { t: "≥", ins: ["≥"] },
  { t: "≠", ins: ["≠"] },
  { t: "°", ins: ["°"] },
  { t: "→", ins: ["→"] },
];

const blank = { id: null, title: "", content: "", sourceName: "", pages: 0 };

export default function AdminDocuments() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editor, setEditor] = useState(null); // null | { ...blank }
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfProgress, setPdfProgress] = useState(null); // { page, total }
  const [pdfFile, setPdfFile] = useState(null); // kept so OCR can re-read a scanned PDF
  const [scanned, setScanned] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showMath, setShowMath] = useState(false);
  const [converting, setConverting] = useState(""); // "" | "text" | "csv"
  const [convertMsg, setConvertMsg] = useState("");
  const taRef = useRef(null);

  // Reset transient editor UI whenever the editor closes.
  useEffect(() => {
    if (!editor) { setFullscreen(false); setShowMath(false); setConvertMsg(""); }
  }, [editor]);

  // Insert text at the textarea caret (wrapping the selection when `after` given).
  const insertMath = (before, after = "") => {
    const ta = taRef.current;
    const val = editor?.content || "";
    const start = ta?.selectionStart ?? val.length;
    const end = ta?.selectionEnd ?? start;
    const sel = val.slice(start, end);
    const next = val.slice(0, start) + before + sel + after + val.slice(end);
    setEditor((ed) => ({ ...ed, content: next }));
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      const pos = start + before.length + sel.length + after.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  // Convert the document text into the app's typed questions (preview only).
  // Convert the document text into questions, written back into the text box so
  // it can be saved and copied. Two output formats:
  //   "text" → clean, ANSWER-FREE readable text (type-aware: matching → Column
  //            A/B, statement → numbered statements, assertion → A/R, etc.).
  //   "csv"  → your bulk-upload CSV format (all question types, WITH answers)
  //            via questionsToCsv() — ready to paste straight into Bulk Upload.
  const runConvert = async (format) => {
    if (!editor?.content?.trim()) { setError("Add some text first."); return; }
    setConverting(format);
    setConvertMsg("Converting to questions…");
    try {
      const { jobId } = await aiService.extract({ content: editor.content.trim() });
      if (!jobId) throw new Error("Couldn't start conversion.");
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      let done = false;
      for (let i = 0; i < 240 && !done; i++) {
        await sleep(2000);
        let s;
        try { s = await aiService.job(jobId); } catch { continue; }
        if (s.status === "done") {
          const qs = s.questions || [];
          const out = format === "csv"
            ? questionsToCsv(qs)
            : qs.map((q, idx) => formatQuestionText(q, idx)).join("\n\n");
          if (out.trim()) setEditor((ed) => ({ ...ed, content: out }));
          setConvertMsg(format === "csv"
            ? `✓ ${qs.length} question(s) in your bulk-upload (CSV) format — Save/Copy, or paste into Bulk Upload.`
            : `✓ Converted ${qs.length} question(s) — answers removed. Review, then Save or Copy.`);
          done = true;
        } else if (s.status === "error") { setConvertMsg(s.error || "Conversion failed."); done = true; }
        else setConvertMsg(`Converting… ${s.count || 0} question(s) so far`);
      }
      if (!done) setConvertMsg("Still working — large text; try again.");
    } catch (e) {
      setConvertMsg(e.message || "Conversion failed.");
    } finally {
      setConverting("");
    }
  };

  // Remove exam-paper boilerplate from the WHOLE text box (offline), leaving
  // only the questions — run this before "Convert to questions".
  const cleanText = () => {
    if (!editor?.content?.trim()) { setError("Add some text first."); return; }
    const { text, removed } = cleanExtractedText(editor.content);
    setEditor((ed) => ({ ...ed, content: text }));
    setConvertMsg(removed
      ? `✓ Cleaned — removed ${removed} boilerplate line(s) (file numbers, stamps, page markers).`
      : "Nothing to clean — no boilerplate lines found.");
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(editor?.content || "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Couldn't copy — your browser blocked clipboard access.");
    }
  };

  const load = () => {
    setLoading(true);
    setError("");
    documentService
      .list()
      .then(setDocs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openNew = () => { setEditor({ ...blank }); };

  const openEdit = async (row) => {
    setBusyId(row._id);
    try {
      const full = await documentService.get(row._id);
      setEditor({ id: full._id, title: full.title || "", content: full.content || "", sourceName: full.sourceName || "", pages: full.pages || 0 });
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId("");
    }
  };

  // Extract PDF text (in the browser) into the editor's content field.
  const onPdf = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file.");
      return;
    }
    // If no editor is open (uploading fresh), open a blank one first.
    const base = editor || { ...blank };
    setPdfBusy(true);
    setPdfProgress(null);
    setError("");
    setPdfFile(file);
    setScanned(false);
    const niceTitle = file.name.replace(/\.pdf$/i, "");
    try {
      const { extractPdfText, looksScanned } = await import("../../lib/pdf");
      let total = 0;
      const text = await extractPdfText(file, (page, t) => { total = t; setPdfProgress({ page, total: t }); });
      // Scanned/image PDFs (no real text layer) — open the editor so the OCR
      // button is available, and don't fill it with the useless stamp text.
      if (!text || looksScanned(text)) {
        setScanned(true);
        setEditor({ ...base, title: base.title?.trim() ? base.title : niceTitle, sourceName: file.name, pages: total });
        setError(`“${file.name}” looks like a scanned PDF — use “Read with OCR” below to read the pages.`);
        return;
      }
      setEditor({
        ...base,
        title: base.title?.trim() ? base.title : niceTitle,
        content: base.content?.trim() ? `${base.content.trim()}\n\n${text}` : text,
        sourceName: file.name,
        pages: total,
      });
    } catch (err) {
      setError(`PDF read failed: ${err.message}`);
    } finally {
      setPdfBusy(false);
    }
  };

  // Read a scanned/image PDF with OCR (slower) into the editor's text.
  const runOcr = async () => {
    if (!pdfFile) return;
    setOcrBusy(true);
    setOcrProgress(null);
    setError("");
    try {
      const { ocrPdfText } = await import("../../lib/pdf");
      let total = 0;
      const text = await ocrPdfText(pdfFile, (page, t) => { total = t; setOcrProgress({ page, total: t }); });
      if (!text) { setError("OCR couldn't read any text from this PDF."); return; }
      setEditor((ed) => {
        const b = ed || { ...blank };
        return {
          ...b,
          title: b.title?.trim() ? b.title : pdfFile.name.replace(/\.pdf$/i, ""),
          content: b.content?.trim() ? `${b.content.trim()}\n\n${text}` : text,
          sourceName: pdfFile.name,
          pages: total,
        };
      });
      setScanned(false);
    } catch (e) {
      setError(`OCR failed: ${e.message}`);
    } finally {
      setOcrBusy(false);
    }
  };

  const save = async () => {
    if (!editor?.title.trim()) { setError("Please enter a title."); return; }
    setSaving(true);
    setError("");
    try {
      const payload = { title: editor.title.trim(), content: editor.content, sourceName: editor.sourceName, pages: editor.pages };
      if (editor.id) await documentService.update(editor.id, payload);
      else await documentService.create(payload);
      setEditor(null);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (row) => {
    if (!window.confirm(`Delete “${row.title}”? This cannot be undone.`)) return;
    setBusyId(row._id);
    try {
      await documentService.remove(row._id);
      load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusyId("");
    }
  };

  const downloadTxt = () => {
    if (!editor) return;
    const blob = new Blob([editor.content || ""], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(editor.title || "document").replace(/[^\w.-]+/g, "_")}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold"><FileText className="h-6 w-6 text-brand-600" /> Documents</h1>
          <p className="text-slate-500 dark:text-slate-400">Upload a PDF to extract its text (scanned PDFs can be read with OCR), or write a note — then save it here.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className={`btn-primary cursor-pointer ${pdfBusy ? "pointer-events-none opacity-70" : ""}`}>
            <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPdf} disabled={pdfBusy} />
            {pdfBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Reading{pdfProgress ? ` ${pdfProgress.page}/${pdfProgress.total}` : "…"}</> : <><Upload className="h-4 w-4" /> Upload PDF</>}
          </label>
          <button onClick={openNew} className="btn-outline"><Plus className="h-4 w-4" /> New note</button>
        </div>
      </div>

      {error && !editor && (
        <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</div>
      )}

      {loading ? (
        <Loading label="Loading documents..." />
      ) : error && !docs.length ? (
        <ErrorState message={error} onRetry={load} />
      ) : !docs.length ? (
        <EmptyState message="No documents yet — upload a PDF or create a note to get started." />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-2">Title</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Added</th>
                <th className="px-4 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d._id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-4 py-2 font-semibold">
                    <button onClick={() => openEdit(d)} className="text-left hover:text-brand-600">{d.title}</button>
                  </td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                    {d.sourceName ? <span>{d.sourceName}{d.pages ? ` · ${d.pages}p` : ""}</span> : <span className="italic text-slate-400">note</span>}
                  </td>
                  <td className="px-4 py-2 text-slate-500 dark:text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => openEdit(d)} disabled={busyId === d._id} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800" title="Open / edit">
                        {busyId === d._id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
                      </button>
                      <button onClick={() => remove(d)} disabled={busyId === d._id} className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30" title="Delete">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editor && (
        <div className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 ${fullscreen ? "p-0" : "p-4"}`}>
          <div className={`animate-scale-in card ${fullscreen ? "flex h-screen w-screen max-w-none flex-col rounded-none p-4" : "my-8 w-full max-w-3xl p-6"}`}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-lg font-bold"><FileText className="h-5 w-5 text-brand-600" /> {editor.id ? "Edit document" : "New document"}</h3>
              <button onClick={() => { setEditor(null); setError(""); }}><X className="h-5 w-5" /></button>
            </div>

            {error && <div className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</div>}

            <label className="mb-1 block text-sm font-semibold">Title</label>
            <input className="input mb-4" value={editor.title} onChange={(e) => setEditor({ ...editor, title: e.target.value })} placeholder="Document title" />

            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <label className="text-sm font-semibold">Text</label>
              <div className="flex items-center gap-2">
                <label className={`btn-outline cursor-pointer !py-1 !text-xs ${pdfBusy ? "pointer-events-none opacity-70" : ""}`}>
                  <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={onPdf} disabled={pdfBusy} />
                  {pdfBusy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading{pdfProgress ? ` ${pdfProgress.page}/${pdfProgress.total}` : "…"}</> : <><Upload className="h-3.5 w-3.5" /> Load from PDF</>}
                </label>
                {pdfFile && (
                  <button type="button" onClick={runOcr} disabled={ocrBusy || pdfBusy} className={`!py-1 !text-xs ${scanned ? "btn-primary" : "btn-outline"}`}>
                    {ocrBusy ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> OCR {ocrProgress?.page || 0}/{ocrProgress?.total || "?"}</> : <><ScanText className="h-3.5 w-3.5" /> Read with OCR</>}
                  </button>
                )}
                {editor.content?.trim() && (
                  <button type="button" onClick={cleanText} className="btn-outline !py-1 !text-xs" title="Remove headers, file numbers, stamps & page markers — keep only questions">
                    <Eraser className="h-3.5 w-3.5" /> Clean text
                  </button>
                )}
                {editor.content?.trim() && (
                  <button type="button" onClick={copyText} className="btn-outline !py-1 !text-xs">
                    {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
                  </button>
                )}
                {editor.content?.trim() && (
                  <button type="button" onClick={downloadTxt} className="btn-outline !py-1 !text-xs"><Download className="h-3.5 w-3.5" /> .txt</button>
                )}
                <button type="button" onClick={() => setShowMath((v) => !v)} className={`!py-1 !text-xs ${showMath ? "btn-primary" : "btn-outline"}`} title="Insert math">
                  <Sigma className="h-3.5 w-3.5" /> Math
                </button>
                <button type="button" onClick={() => setFullscreen((f) => !f)} className="btn-outline !py-1 !text-xs" title={fullscreen ? "Exit full screen" : "Full screen"}>
                  {fullscreen ? <><Minimize2 className="h-3.5 w-3.5" /> Exit</> : <><Maximize2 className="h-3.5 w-3.5" /> Full screen</>}
                </button>
              </div>
            </div>

            {showMath && (
              <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                {MATH_BTNS.map((b, i) => (
                  <button key={i} type="button" onClick={() => insertMath(...b.ins)} title={b.title || ""}
                    className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs hover:border-brand-400 hover:text-brand-600 dark:border-slate-600 dark:bg-slate-900">
                    {b.t}
                  </button>
                ))}
                <span className="ml-auto self-center text-[11px] text-slate-400">Use $…$ for inline math</span>
              </div>
            )}

            <textarea
              ref={taRef}
              rows={16}
              className={`input resize-y font-mono text-xs ${fullscreen ? "min-h-0 flex-1" : ""}`}
              value={editor.content}
              onChange={(e) => setEditor({ ...editor, content: e.target.value })}
              placeholder="Upload a PDF to fill this, or type/paste text here…"
            />
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-400">
                {(editor.content || "").length.toLocaleString()} characters
                {editor.sourceName ? ` · from ${editor.sourceName}${editor.pages ? ` (${editor.pages} pages)` : ""}` : ""}
              </p>
              {editor.content?.trim() && (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => runConvert("text")} disabled={!!converting} className="btn-outline !py-1 !text-xs">
                    {converting === "text" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Converting…</> : <><Wand2 className="h-3.5 w-3.5" /> Convert to questions</>}
                  </button>
                  <button type="button" onClick={() => runConvert("csv")} disabled={!!converting} className="btn-outline !py-1 !text-xs" title="Output in your bulk-upload CSV format (all question types, with answers)">
                    {converting === "csv" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Converting…</> : <><FileText className="h-3.5 w-3.5" /> To my format (CSV)</>}
                  </button>
                </div>
              )}
            </div>
            {convertMsg && <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{convertMsg}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => { setEditor(null); setError(""); }} className="btn-outline">Cancel</button>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</> : <><Save className="h-4 w-4" /> Save</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
