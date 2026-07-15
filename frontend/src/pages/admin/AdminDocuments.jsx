import { useEffect, useState } from "react";
import { FileText, Upload, Plus, Pencil, Trash2, X, Loader2, Save, Download } from "lucide-react";
import { documentService } from "../../services";
import { Loading, ErrorState, EmptyState } from "../../components/ui/AsyncState";

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
    try {
      const { extractPdfText } = await import("../../lib/pdf");
      let total = 0;
      const text = await extractPdfText(file, (page, t) => { total = t; setPdfProgress({ page, total: t }); });
      const niceTitle = file.name.replace(/\.pdf$/i, "");
      setEditor({
        ...base,
        title: base.title?.trim() ? base.title : niceTitle,
        content: base.content?.trim() ? `${base.content.trim()}\n\n${text}` : text,
        sourceName: file.name,
        pages: total,
      });
      if (!text) setError("Couldn't read any text — this PDF looks like scanned images (no selectable text).");
    } catch (err) {
      setError(`PDF read failed: ${err.message}`);
    } finally {
      setPdfBusy(false);
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
          <p className="text-slate-500 dark:text-slate-400">Upload a PDF to extract its text, or write a note — then save it here.</p>
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4">
          <div className="my-8 w-full max-w-3xl animate-scale-in card p-6">
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
                {editor.content?.trim() && (
                  <button type="button" onClick={downloadTxt} className="btn-outline !py-1 !text-xs"><Download className="h-3.5 w-3.5" /> .txt</button>
                )}
              </div>
            </div>
            <textarea
              rows={16}
              className="input resize-y font-mono text-xs"
              value={editor.content}
              onChange={(e) => setEditor({ ...editor, content: e.target.value })}
              placeholder="Upload a PDF to fill this, or type/paste text here…"
            />
            <p className="mt-1 text-xs text-slate-400">
              {(editor.content || "").length.toLocaleString()} characters
              {editor.sourceName ? ` · from ${editor.sourceName}${editor.pages ? ` (${editor.pages} pages)` : ""}` : ""}
            </p>

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
