import { CheckCircle2 } from "lucide-react";
import MathText from "../ui/MathText";
import Badge from "../ui/Badge";

const toRoman = (n) => ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][n] || n + 1;

// Read-only display of a full question (text, options, correct answer,
// matching columns, explanation). Used by the admin "View" / "View all".
export default function QuestionView({ q, index }) {
  if (!q) return null;
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {index != null && (
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-xs font-bold dark:bg-slate-800">{index}</span>
        )}
        <Badge variant={q.type === "matching" ? "accent" : "brand"}>{q.type === "matching" ? "Matching" : "MCQ"}</Badge>
        {q.difficulty && <Badge variant={q.difficulty}>{q.difficulty}</Badge>}
        {q.status && <Badge variant={q.status === "published" ? "brand" : "neutral"}>{q.status}</Badge>}
        {q.correct !== undefined && (
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Correct: {String.fromCharCode(65 + q.correct)}</span>
        )}
      </div>

      <p className="font-semibold"><MathText>{q.text}</MathText></p>
      {q.image && <img src={q.image} alt="" className="mt-2 max-h-48 rounded-lg object-contain" />}

      {q.type === "matching" && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <p className="mb-1 text-xs font-semibold uppercase text-brand-600 dark:text-brand-400">Column A</p>
            {(q.columnA || []).map((it, k) => (
              <div key={k} className="flex gap-1.5 text-sm"><span className="font-bold">{k + 1}.</span> <MathText>{it}</MathText></div>
            ))}
          </div>
          <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
            <p className="mb-1 text-xs font-semibold uppercase text-accent-600 dark:text-accent-400">Column B</p>
            {(q.columnB || []).map((it, k) => (
              <div key={k} className="flex gap-1.5 text-sm"><span className="font-bold">{toRoman(k)}.</span> <MathText>{it}</MathText></div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {(q.options || []).map((opt, idx) => {
          const isCorrect = idx === q.correct;
          const optExp = q.optionExplanations?.[idx];
          const cls = `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            isCorrect ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"
          }`;
          return (
            <div key={idx}>
              <div className={cls}>
                {isCorrect ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <span className="h-4 w-4" />}
                <span className="font-bold">({String.fromCharCode(97 + idx)})</span>
                <MathText>{opt}</MathText>
              </div>
              {optExp && optExp.trim() && (
                <p className="ml-6 mt-0.5 text-xs text-slate-500 dark:text-slate-400"><MathText>{optExp}</MathText></p>
              )}
            </div>
          );
        })}
      </div>

      {q.explanation && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <span className="font-semibold">Explanation: </span><MathText>{q.explanation}</MathText>
        </p>
      )}
    </div>
  );
}
