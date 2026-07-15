import { useRef, useState } from "react";
import { Sparkles, Loader2, Download, FileDown, Feather, Trash2 } from "lucide-react";
import { aiService } from "../../services";
import HandwrittenSheet from "../../components/ui/HandwrittenSheet";

// html2canvas (CDN) — rasterises the handwritten A4 sheet for PNG / PDF export.
async function loadHtml2Canvas() {
  const mod = await import(/* @vite-ignore */ "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/+esm");
  return mod?.default || mod;
}

const escapeHtml = (s) =>
  String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Standalone "Handwritten Notes" studio: generate study notes on a topic with
// AI (or write your own), preview them as realistic handwriting on an A4 sheet
// (unruled or ruled), and download as PNG or PDF.
export default function AdminNotes() {
  const [topic, setTopic] = useState("");
  const [notesBusy, setNotesBusy] = useState(false);
  const [content, setContent] = useState("");
  const [paper, setPaper] = useState("unruled"); // "unruled" | "ruled"
  const [hwBusy, setHwBusy] = useState(""); // "png" | "pdf"
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const hwRef = useRef(null);

  const hasContent = content.trim().length > 0;

  const generate = async () => {
    const t = topic.trim();
    if (!t) { setError("Enter a topic to generate notes."); return; }
    setError("");
    setNotesBusy(true);
    setMsg("Generating study notes…");
    try {
      const { notes } = await aiService.notes({ topic: t });
      if (notes && notes.trim()) {
        setContent(notes);
        setMsg("✓ Notes generated — edit if you like, then download as PNG or PDF.");
      } else {
        setMsg("No notes were returned — try a more specific topic.");
      }
    } catch (e) {
      setMsg("");
      setError(e.message || "Couldn't generate notes.");
    } finally {
      setNotesBusy(false);
    }
  };

  const exportSheet = async (kind) => {
    if (!hwRef.current || !hasContent) return;
    setHwBusy(kind);
    setError("");
    try {
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* ignore */ } }
      const html2canvas = await loadHtml2Canvas();
      const canvas = await html2canvas(hwRef.current, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const dataUrl = canvas.toDataURL("image/png");
      const name = (topic || "notes").replace(/[^\w.-]+/g, "_");
      if (kind === "png") {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = `${name}.png`;
        a.click();
      } else {
        const win = window.open("", "_blank");
        if (!win) { setError("Allow pop-ups for this site to download the PDF."); return; }
        win.document.write(
          `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(topic || "notes")}</title>` +
          `<style>@page{size:A4;margin:0}html,body{margin:0;padding:0}img{width:100%;display:block}</style></head><body>` +
          `<img src="${dataUrl}">` +
          `<scr` + `ipt>window.onload=function(){setTimeout(function(){window.focus();window.print();},300)};</scr` + `ipt>` +
          `</body></html>`
        );
        win.document.close();
      }
    } catch (e) {
      setError(`Couldn't create the ${kind.toUpperCase()}: ${e.message}`);
    } finally {
      setHwBusy("");
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-extrabold"><Feather className="h-6 w-6 text-brand-600" /> Handwritten Notes</h1>
        <p className="text-slate-500 dark:text-slate-400">Generate study notes on any topic with AI (or write your own), then download them as a realistic handwritten A4 sheet.</p>
      </div>

      {/* Topic → AI notes */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <label className="mb-1 block text-sm font-semibold">Topic</label>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input flex-1"
            placeholder="e.g. Photosynthesis · Mughal Empire · Newton's laws of motion"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") generate(); }}
          />
          <button type="button" onClick={generate} disabled={notesBusy} className="btn-primary">
            {notesBusy ? <><Loader2 className="h-4 w-4 animate-spin" /> Generating…</> : <><Sparkles className="h-4 w-4" /> Generate notes</>}
          </button>
        </div>
        {error && <p className="mt-2 rounded-lg bg-rose-50 px-3 py-1.5 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{error}</p>}
        {msg && <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">{msg}</p>}
      </div>

      {/* Editable notes text */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm font-semibold">Notes text</label>
          {hasContent && (
            <button type="button" onClick={() => { setContent(""); setMsg(""); }} className="btn-outline !py-1 !text-xs"><Trash2 className="h-3.5 w-3.5" /> Clear</button>
          )}
        </div>
        <textarea
          rows={8}
          className="input resize-y font-mono text-xs"
          placeholder={"Generate notes above, or type/paste them here.\nUse # Heading, ## Sub-heading, - bullet, **bold**, ==highlight==, $math$."}
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-slate-400">Formatting: <b># / ## / ###</b> headings · <b>- </b>bullets · <b>**bold**</b> · <b>==highlight==</b> · <b>$math$</b></p>
      </div>

      {/* Handwritten preview + downloads */}
      <div className="rounded-xl border border-slate-200 bg-slate-200/70 p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Paper:</span>
          <div className="flex overflow-hidden rounded-lg border border-slate-300 dark:border-slate-600">
            <button type="button" onClick={() => setPaper("unruled")} className={`px-2.5 py-1 text-xs font-semibold ${paper === "unruled" ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>Unruled</button>
            <button type="button" onClick={() => setPaper("ruled")} className={`px-2.5 py-1 text-xs font-semibold ${paper === "ruled" ? "bg-brand-600 text-white" : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300"}`}>Ruled</button>
          </div>
          <button type="button" onClick={() => exportSheet("png")} disabled={!!hwBusy || !hasContent} className="btn-outline !py-1 !text-xs">
            {hwBusy === "png" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> PNG…</> : <><Download className="h-3.5 w-3.5" /> Download PNG</>}
          </button>
          <button type="button" onClick={() => exportSheet("pdf")} disabled={!!hwBusy || !hasContent} className="btn-outline !py-1 !text-xs">
            {hwBusy === "pdf" ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> PDF…</> : <><FileDown className="h-3.5 w-3.5" /> Download PDF</>}
          </button>
          <span className="ml-auto text-[11px] text-slate-400">Live preview — realistic handwriting on A4</span>
        </div>
        <div className="max-h-[80vh] overflow-auto">
          {hasContent
            ? <HandwrittenSheet ref={hwRef} text={content} paper={paper} />
            : <p className="py-10 text-center text-sm text-slate-400">Your handwritten notes will appear here.</p>}
        </div>
      </div>
    </div>
  );
}
