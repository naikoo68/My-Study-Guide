import { useEffect, useState } from "react";
import { FileDown, KeyRound, Eye, X, Loader2 } from "lucide-react";
import { printPaper, answerLetter } from "../../lib/paper";
import MathText from "../ui/MathText";

// Download a quiz/test as a QUESTION PAPER (PDF, no answers) or ANSWER KEY (PDF,
// with answers + explanations), and VIEW the answer key on screen.
//
// Pass either `questions` (already loaded, admin data incl. `correct`) OR a
// `load` async function that fetches them on demand (for list rows). Renders a
// single button that opens a small chooser modal.
export default function PaperExport({ title = "Question Paper", questions = null, load = null, compact = false, label = "Paper / Key", paperOnly = false }) {
  const [open, setOpen] = useState(false);
  const [list, setList] = useState(Array.isArray(questions) ? questions : []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => { if (Array.isArray(questions)) setList(questions); }, [questions]);

  const ensure = async () => {
    if (list.length) return list;
    if (!load) return list;
    setBusy(true);
    setErr("");
    try {
      const res = await load();
      const arr = Array.isArray(res) ? res : (res?.questions || []);
      setList(arr);
      return arr;
    } catch (e) {
      setErr(e.message || "Couldn't load questions.");
      return [];
    } finally {
      setBusy(false);
    }
  };

  const openModal = async () => { await ensure(); setOpen(true); };
  const paper = () => { if (!printPaper(title, list, { withAnswers: false })) window.alert("Allow pop-ups for this site to download the PDF."); };
  const key = () => { if (!printPaper(`${title} — Answer Key`, list, { withAnswers: true })) window.alert("Allow pop-ups for this site to download the PDF."); };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        disabled={busy}
        title="Download question paper / answer key"
        className={compact
          ? "rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-brand-600 dark:hover:bg-slate-800"
          : "btn-outline !py-1 !text-xs"}
      >
        {busy ? <Loader2 className={compact ? "h-4 w-4 animate-spin" : "h-3.5 w-3.5 animate-spin"} /> : <FileDown className={compact ? "h-4 w-4" : "h-3.5 w-3.5"} />}
        {!compact && <> {label}</>}
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="my-8 w-full max-w-2xl animate-scale-in card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-lg font-bold"><FileDown className="h-5 w-5 text-brand-600" /> Download — {title}</h3>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            </div>

            {err && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{err}</p>}

            {!list.length ? (
              <p className="py-6 text-center text-sm text-slate-500">No questions to export.</p>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  <button onClick={paper} className="btn-primary"><FileDown className="h-4 w-4" /> Question paper (PDF)</button>
                  {!paperOnly && <button onClick={key} className="btn-outline"><KeyRound className="h-4 w-4" /> Answer key (PDF)</button>}
                </div>

                {paperOnly ? (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">The answer key for a test is available after you attempt and submit it.</p>
                ) : (
                <>
                <p className="mb-2 flex items-center gap-2 text-sm font-semibold"><Eye className="h-4 w-4 text-slate-400" /> Answer key ({list.length} question{list.length === 1 ? "" : "s"})</p>
                <div className="mb-3 flex flex-wrap gap-2">
                  {list.map((q, i) => (
                    <span key={q._id || i} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-slate-800">
                      <span className="text-slate-500">{i + 1}.</span> <span className="text-emerald-600 dark:text-emerald-400">{answerLetter(q)}</span>
                    </span>
                  ))}
                </div>
                <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
                  {list.map((q, i) => (
                    <div key={q._id || i} className="rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-700">
                      <p><b>{i + 1}.</b> <MathText>{q.text}</MathText></p>
                      <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        Answer: {answerLetter(q)}{q.options?.[q.correct] ? <> — <MathText>{q.options[q.correct]}</MathText></> : null}
                      </p>
                    </div>
                  ))}
                </div>
                </>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
