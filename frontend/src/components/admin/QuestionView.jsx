import { useState } from "react";
import { CheckCircle2, Clock, Eye, EyeOff, RefreshCw, Loader2, Wand2 } from "lucide-react";
import MathText from "../ui/MathText";
import { questionDateText } from "../../lib/questions";
import StatementPairView from "../ui/StatementPairView";
import TableView from "../ui/TableView";
import AssertionReasonView from "../ui/AssertionReasonView";
import Badge from "../ui/Badge";

const toRoman = (n) => ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"][n] || n + 1;

// Read-only display of a full question (text, options, correct answer,
// matching columns, explanation). Used by the admin "View" / "View all".
//
// `studentView` shows the question exactly as a student would see it BEFORE
// answering: the correct answer, per-option notes and explanation are hidden,
// with a per-question "Reveal answer" button to expose them on demand.
// `onRegenerate` (optional) shows a "Regenerate" button that rebuilds this
// question's options/answer/explanation to fit the stem (fixes wrong-format
// questions). `regenerating` toggles the in-progress spinner.
// `onExtend` (optional) shows an "Extend explanation" button that AI-enriches
// this question's explanation (and can fix off-category options via the popup).
// `extending` toggles its in-progress spinner.
export default function QuestionView({ q, index, studentView = false, onRegenerate, regenerating = false, onExtend, extending = false }) {
  const [revealed, setRevealed] = useState(false);
  if (!q) return null;
  const showAnswer = !studentView || revealed;

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {index != null && (
          <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-100 text-xs font-bold dark:bg-slate-800">{index}</span>
        )}
        <Badge variant={["matching", "pair", "pairselect"].includes(q.type) ? "accent" : "brand"}>{{ matching: "Matching", statement: "Statement", pair: "Pair", pairselect: "Pair-select", image: "Image", table: "Table", assertion: "Assertion & Reason" }[q.type] || "MCQ"}</Badge>
        {q.difficulty && <Badge variant={q.difficulty}>{q.difficulty}</Badge>}
        {q.status && <Badge variant={q.status === "published" ? "brand" : "neutral"}>{q.status}</Badge>}
        {showAnswer && q.correct !== undefined && (
          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Correct: {String.fromCharCode(65 + q.correct)}</span>
        )}
        {questionDateText(q) && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400">
            <Clock className="h-3 w-3" /> {questionDateText(q)}
          </span>
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

      <StatementPairView q={q} />
      <TableView q={q} />
      <AssertionReasonView q={q} />

      <div className="mt-3 space-y-2">
        {(q.options || []).map((opt, idx) => {
          const isCorrect = idx === q.correct;
          const optExp = q.optionExplanations?.[idx];
          const highlight = showAnswer && isCorrect;
          const cls = `flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            highlight ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" : "text-slate-600 dark:text-slate-300"
          }`;
          return (
            <div key={idx}>
              <div className={cls}>
                {highlight ? <CheckCircle2 className="h-4 w-4 flex-shrink-0" /> : <span className="h-4 w-4" />}
                <span className="font-bold">({String.fromCharCode(97 + idx)})</span>
                <MathText>{opt}</MathText>
              </div>
              {showAnswer && !isCorrect && optExp && optExp.trim() && (
                <p className="ml-6 mt-0.5 text-xs text-slate-500 dark:text-slate-400"><MathText>{optExp}</MathText></p>
              )}
            </div>
          );
        })}
      </div>

      {/* Student view: reveal/hide the answer + explanation on demand. */}
      {studentView && (
        <button
          onClick={() => setRevealed((v) => !v)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50 dark:border-slate-700 dark:hover:bg-brand-900/30"
        >
          {revealed ? <><EyeOff className="h-3.5 w-3.5" /> Hide answer</> : <><Eye className="h-3.5 w-3.5" /> Reveal answer</>}
        </button>
      )}

      {showAnswer && q.explanation && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          <span className="font-semibold">Explanation: </span><MathText>{q.explanation}</MathText>
        </p>
      )}

      {/* AI actions — shown wherever a handler is passed (single preview +
          "View all"). Extend enriches the explanation (with an optional
          fix-options popup); Regenerate rebuilds options/answer to fit the
          stem (fixes wrong-format questions). */}
      {(onExtend || onRegenerate) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {onExtend && (
            <button
              type="button"
              onClick={onExtend}
              disabled={extending}
              title="Extend this question's explanation with AI (optionally fix off-category options)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 px-3 py-1.5 text-xs font-semibold text-brand-600 transition hover:bg-brand-50 disabled:opacity-50 dark:border-brand-900/50 dark:text-brand-300 dark:hover:bg-brand-900/30"
            >
              {extending ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Extending…</> : <><Wand2 className="h-3.5 w-3.5" /> Extend explanation</>}
            </button>
          )}
          {onRegenerate && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={regenerating}
              title="Regenerate this question's options, answer & explanation to fit the stem (fixes wrong format)"
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 px-3 py-1.5 text-xs font-semibold text-violet-600 transition hover:bg-violet-50 disabled:opacity-50 dark:border-violet-900/50 dark:text-violet-300 dark:hover:bg-violet-900/30"
            >
              {regenerating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Regenerating…</> : <><RefreshCw className="h-3.5 w-3.5" /> Regenerate</>}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
