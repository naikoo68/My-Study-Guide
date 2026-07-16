import { useState } from "react";
import { FileDown, KeyRound, Eye, X } from "lucide-react";
import { printPaper, answerLetter } from "../../lib/paper";
import MathText from "../ui/MathText";

// Buttons to download a quiz/test as a QUESTION PAPER (PDF, no answers), an
// ANSWER KEY (PDF, with answers + explanations), and a VIEW ANSWER KEY modal.
// `questions` must include options + correct (admin data).
export default function PaperExport({ title = "Question Paper", questions = [], compact = false }) {
  const [open, setOpen] = useState(false);
  const list = Array.isArray(questions) ? questions : [];
  const disabled = !list.length;
  const size = compact ? "!py-1 !text-xs" : "";

  const paper = () => { if (!printPaper(title, list, { withAnswers: false })) window.alert("Allow pop-ups for this site to download the PDF."); };
  const key = () => { if (!printPaper(`${title} — Answer Key`, list, { withAnswers: true })) window.alert("Allow pop-ups for this site to download the PDF."); };

  return (
    <>
      <button type="button" onClick={paper} disabled={disabled} className={`btn-outline ${size}`} title="Download the question paper as a PDF (no answers)">
        <FileDown className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> Paper (PDF)
      </button>
      <button type="button" onClick={key} disabled={disabled} className={`btn-outline ${size}`} title="Download the answer key as a PDF (answers + explanations)">
        <KeyRound className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> Answer key
      </button>
      <button type="button" onClick={() => setOpen(true)} disabled={disabled} className={`btn-outline ${size}`} title="View the answer key">
        <Eye className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} /> View key
      </button>

      {open && (
        <div className="fixed inset-0 z-[70] flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="my-8 w-full max-w-2xl animate-scale-in card p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-lg font-bold"><KeyRound className="h-5 w-5 text-brand-600" /> Answer Key</h3>
              <button onClick={() => setOpen(false)}><X className="h-5 w-5" /></button>
            </div>
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">{title} · {list.length} question(s)</p>

            {/* Compact key grid */}
            <div className="mb-4 flex flex-wrap gap-2">
              {list.map((q, i) => (
                <span key={q._id || i} className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold dark:bg-slate-800">
                  <span className="text-slate-500">{i + 1}.</span> <span className="text-emerald-600 dark:text-emerald-400">{answerLetter(q)}</span>
                </span>
              ))}
            </div>

            {/* Full list with the correct option shown */}
            <div className="max-h-[55vh] space-y-2 overflow-y-auto pr-1">
              {list.map((q, i) => (
                <div key={q._id || i} className="rounded-lg border border-slate-200 p-2.5 text-sm dark:border-slate-700">
                  <p><b>{i + 1}.</b> <MathText>{q.text}</MathText></p>
                  <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Answer: {answerLetter(q)}
                    {q.options?.[q.correct] ? <> — <MathText>{q.options[q.correct]}</MathText></> : null}
                  </p>
                  {q.explanation && String(q.explanation).trim() && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400"><MathText>{q.explanation}</MathText></p>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="btn-outline">Close</button>
              <button onClick={key} className="btn-primary"><FileDown className="h-4 w-4" /> Download PDF</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
