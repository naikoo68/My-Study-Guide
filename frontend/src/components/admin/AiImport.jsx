import { useEffect, useState } from "react";
import { X, Globe, Download, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";
import { aiService } from "../../services";

const LETTERS = ["A", "B", "C", "D"];

// Import questions FROM another website or pasted text. The AI extracts the
// questions already present (it does not invent them) and returns them in the
// app's format for preview → insert. Reuses the same onUpload handler as the
// bulk-upload / AI-generate modals.
export default function AiImport({ open, onClose, onUpload, title = "Import Questions from Web" }) {
  const [status, setStatus] = useState(null);
  const [model, setModel] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState([]);
  const [busy, setBusy] = useState(false);
  const [inserting, setInserting] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!open) return;
    setMsg("");
    setPreview([]);
    aiService
      .status()
      .then((s) => {
        setStatus(s);
        setModel(s?.model || (s?.models && s.models[0]) || "");
      })
      .catch(() => setStatus({ enabled: false }));
  }, [open]);

  if (!open) return null;

  const extract = async () => {
    if (!url.trim() && !text.trim()) {
      setMsg("Paste a page URL or the questions text to import.");
      return;
    }
    setBusy(true);
    setPreview([]);
    setMsg("Reading the source and extracting questions…");
    try {
      const res = await aiService.extract({
        url: url.trim() || undefined,
        content: text.trim() || undefined,
        model: model || undefined,
      });
      const qs = res?.questions || [];
      setPreview(qs);
      setMsg(qs.length ? `✓ Extracted ${qs.length} question(s). Review below, then Insert.` : "No questions found — try pasting the text directly.");
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
      const res = await onUpload(preview);
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

        {status && !status.enabled ? (
          <div className="rounded-xl bg-amber-50 p-4 text-sm text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> AI is not configured</p>
            <p className="mt-1">Add <code>AI_API_KEY</code> to the server environment to enable importing.</p>
          </div>
        ) : (
          <>
            <div className="mb-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              Paste a page link <b>or</b> the copied questions text. The AI extracts the questions into your format —
              review before inserting. Only import content you have the right to use.
            </div>

            {status?.models && status.models.length > 1 && (
              <div className="mb-3">
                <label className="mb-1 block text-sm font-semibold">AI model</label>
                <select className="input" value={model} onChange={(e) => setModel(e.target.value)}>
                  {status.models.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}

            <label className="mb-1 block text-sm font-semibold">Page URL (optional)</label>
            <input
              className="input"
              placeholder="https://example.com/quiz-page"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />

            <label className="mb-1 mt-3 block text-sm font-semibold">Or paste the questions text</label>
            <textarea
              rows={6}
              className="input resize-y font-mono text-xs"
              placeholder={"Paste questions here, e.g.\n1. What is the powerhouse of the cell?\nA) Nucleus  B) Mitochondria  C) Ribosome  D) Golgi\nAns: B"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
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
